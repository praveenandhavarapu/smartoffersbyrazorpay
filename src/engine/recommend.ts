/**
 * v3: offers the merchant isn't using yet, scored by the same engine as the plan.
 * Sources: the stores-like-yours playbook (what worked in tests, ≥ 20 stores, synthetic) and any standard
 * offer the merchant removed from the menu. Adding one is always a draft the merchant approves.
 */
import { OFFER_BY_ID, OFFERS } from '../data/fixtures';
import type { GroupId, GroupStats, OfferId } from '../data/types';
import { playbook } from '../data/network/playbook';
import { buyerShareAtLeast } from './learning';
import { prepaidShareWithNudge } from './paymentAware';
import { perCheckout } from './economics';
import { buildPlan, type PlanResult, type PlanSettings } from './plan';
import { costPerExtraOrder } from './net';
import { newCustomers } from './tradeoffs';
import { PROFILE } from '../data/fixtures';

/** Cost share of the variants: free shipping ₹999+ is paid only on ₹999+ carts; prepaid-only on prepaid orders. */
function variantCostShare(group: GroupId, offer: OfferId): number | undefined {
  if (offer === 'free_shipping_999') return buyerShareAtLeast(group, 999);
  if (offer === 'free_shipping_prepaid') return prepaidShareWithNudge(group);
  return undefined;
}

/**
 * Groups with playbook priors for offers they have no prior for yet (the learning loop's measured priors win).
 * Only used when the offer is on the menu, so adding priors never changes a plan by itself.
 */
export function withPlaybookPriors(groups: GroupStats[]): GroupStats[] {
  return groups.map((g) => {
    const rows = playbook().filter((r) => r.group === g.id && r.offer !== 'early_access' && g.priorLiftsPp[r.offer as OfferId] === undefined);
    if (!rows.length) return g;
    const priors = { ...g.priorLiftsPp }, costShare = { ...(g.costShare ?? {}) };
    for (const r of rows) {
      const o = r.offer as OfferId;
      priors[o] = r.medianLiftPp;
      const cs = variantCostShare(g.id, o);
      if (cs !== undefined && costShare[o] === undefined) costShare[o] = cs;
    }
    return { ...g, priorLiftsPp: priors, costShare };
  });
}

export type Recommendation = {
  /** The group it's for (for a standard offer: the first group the engine would use it for). */
  group: GroupId;
  /** Every group the engine would move to it at the merchant's numbers. */
  groups: GroupId[];
  offer: OfferId | 'early_access';
  label: string;
  kind: 'new_offer' | 'removed_from_menu' | 'non_cash';
  evidence: { storesTested: number | null; beatNoOfferPct: number | null; medianLiftPp: number; note?: string };
  /** The engine would use it once it's on the menu (at the merchant's numbers). */
  picked: boolean;
  /** Plan change from adding it to the menu (same budget, margin, goal, guardrails). */
  profitDelta: number; spendDelta: number; extraOrdersDelta: number; newCustomersDelta: number;
  /** `group` on this offer, per month (90% of checkouts; the holdout never sees offers). */
  ret: number; groupProfit: number; groupExtraOrders: number; costPerExtraOrder: number | null;
  verdict: 'adds_profit' | 'adds_growth' | 'not_at_your_numbers' | 'idea';
};

const coverageOf = (s: Partial<PlanSettings>) => s.coverage ?? 1 - PROFILE.holdoutPct / 100;
const STANDARD = new Set(OFFERS.map((o) => o.id));

export function recommendOffers(groups: GroupStats[], settings: Partial<PlanSettings>, base?: PlanResult): Recommendation[] {
  const G = withPlaybookPriors(groups);
  const now = base ?? buildPlan(G, settings);
  const allowed = new Set(now.settings.allowedOffers ?? []);
  const margin = now.settings.margin, kept = now.settings.keptRate ?? 1, cov = coverageOf(settings);
  const n0 = newCustomers(G, now);
  const nowOffer = (g: GroupId) => now.rows.find((r) => r.group === g)?.offer;
  type Cand = { group: GroupId | null; offer: OfferId; label: string; evidence: Recommendation['evidence']; kind: Recommendation['kind'] };
  const cands: Cand[] = [
    // Playbook variants: tested at stores like yours for one group each.
    ...playbook().filter((r) => r.offer !== 'early_access' && !STANDARD.has(r.offer as OfferId) && !allowed.has(r.offer as OfferId))
      .map((r) => ({ group: r.group, offer: r.offer as OfferId, label: r.label, kind: 'new_offer' as const, evidence: { storesTested: r.storesTested, beatNoOfferPct: r.beatNoOfferPct, medianLiftPp: r.medianLiftPp, ...(r.note ? { note: r.note } : {}) } })),
    // Standard offers the merchant took off the menu: one row per offer, for whichever groups would use it.
    ...OFFERS.filter((o) => o.id !== 'none' && !allowed.has(o.id)).map((o) => ({ group: null, offer: o.id, label: o.label, kind: 'removed_from_menu' as const, evidence: { storesTested: null, beatNoOfferPct: null, medianLiftPp: 0 } })),
  ];
  const out: Recommendation[] = [];
  for (const c of cands) {
    if (now.settings.maxDiscountInr !== undefined && OFFER_BY_ID[c.offer].costPerOrderInr > now.settings.maxDiscountInr) continue;
    const p = buildPlan(G, { ...settings, allowedOffers: [...allowed, c.offer] });
    const moved = p.rows.filter((r) => r.offer === c.offer && nowOffer(r.group) !== c.offer).map((r) => r.group);
    // For a standard offer, describe the first group that moves (or the group where it does best).
    const withPrior = G.filter((g) => g.priorLiftsPp[c.offer] !== undefined);
    const best = withPrior.map((g) => ({ g, e: perCheckout(g, c.offer, margin, undefined, kept) })).sort((a, b) => b.e.profit * b.g.checkouts - a.e.profit * a.g.checkouts)[0];
    const gid = c.group ?? moved[0] ?? best?.g.id;
    if (!gid) continue;
    const g = G.find((x) => x.id === gid)!;
    if (g.priorLiftsPp[c.offer] === undefined) continue;
    const e = perCheckout(g, c.offer, margin, undefined, kept);
    const pb = playbook().find((r) => r.group === gid && r.offer === c.offer);
    const evidence = c.group ? c.evidence : pb ? { storesTested: pb.storesTested, beatNoOfferPct: pb.beatNoOfferPct, medianLiftPp: pb.medianLiftPp, ...(pb.note ? { note: pb.note } : {}) } : { storesTested: null, beatNoOfferPct: null, medianLiftPp: g.priorLiftsPp[c.offer]! };
    const n = g.checkouts * cov;
    const rec: Recommendation = {
      group: gid, groups: moved, offer: c.offer, label: c.label, kind: c.kind, evidence, picked: moved.length > 0,
      profitDelta: p.profit - now.profit, spendDelta: p.spend - now.spend, extraOrdersDelta: p.extraOrders - now.extraOrders, newCustomersDelta: newCustomers(G, p) - n0,
      ret: e.ret, groupProfit: n * e.profit, groupExtraOrders: n * e.lift, costPerExtraOrder: costPerExtraOrder(n * e.spend, n * e.lift),
      verdict: 'not_at_your_numbers',
    };
    rec.verdict = rec.profitDelta > 1 ? 'adds_profit' : rec.newCustomersDelta > 0.5 || (e.lift > 0 && (evidence.beatNoOfferPct ?? 0) >= 50) ? 'adds_growth' : 'not_at_your_numbers';
    out.push(rec);
  }
  for (const r of playbook().filter((x) => x.offer === 'early_access')) {
    out.push({ group: r.group, groups: [], offer: 'early_access', label: r.label, kind: 'non_cash', evidence: { storesTested: r.storesTested, beatNoOfferPct: r.beatNoOfferPct, medianLiftPp: r.medianLiftPp, ...(r.note ? { note: r.note } : {}) }, picked: false, profitDelta: 0, spendDelta: 0, extraOrdersDelta: 0, newCustomersDelta: 0, ret: 0, groupProfit: 0, groupExtraOrders: 0, costPerExtraOrder: null, verdict: 'idea' });
  }
  const rank = (r: Recommendation) => (r.verdict === 'adds_profit' ? 0 : r.verdict === 'adds_growth' ? 1 : r.verdict === 'not_at_your_numbers' ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b) || b.profitDelta - a.profitDelta || (b.evidence.beatNoOfferPct ?? 0) - (a.evidence.beatNoOfferPct ?? 0));
}
