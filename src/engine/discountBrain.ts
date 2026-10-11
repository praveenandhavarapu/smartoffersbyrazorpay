/**
 * v2 §9 — one discount brain for every Razorpay agent. Other agents ask before offering a discount;
 * Smart Offers authorises only what the merchant's live plan allows, and only if it pays back.
 * The 10% holdout applies to recovery decisions too (they get no discount, so recovery lift is proven).
 */
import { OFFER_BY_ID } from '../data/fixtures';
import type { GroupId, GroupStats, OfferId } from '../data/types';
import { RECOVERY, type AgentRequest } from '../data/generator/agentDecisions';

export type BrainAnswer = AgentRequest & {
  decision: OfferId; reason: string; recoveryWithout: number; recoveryWith: number; expectedProfitChange: number; decisionId: string;
};

/** Profit change per request if `offer` is given vs not (net of returns, at the merchant's margin). */
export function recoveryEconomics(g: GroupStats, offer: OfferId, margin: number, kept: number) {
  const r = RECOVERY[g.id];
  if (offer === 'none') return { without: r.without, with: r.without, change: 0 };
  const cost = OFFER_BY_ID[offer].costPerOrderInr * (g.costShare?.[offer] ?? 1);
  return { without: r.without, with: r.withOffer, change: (r.withOffer - r.without) * g.aovInr * kept * margin - r.withOffer * cost };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (x: number) => `${x < 0 ? '−' : '+'}₹${Math.abs(Math.round(x)).toLocaleString('en-IN')}`;

export function answer(req: AgentRequest, groups: GroupStats[], liveOffers: Record<GroupId, OfferId>, margin: number, kept: number, label: (g: GroupId) => string, paused = false): BrainAnswer {
  const g = groups.find((x) => x.id === req.group)!;
  const asked = recoveryEconomics(g, req.asked, margin, kept);
  const base = { ...req, recoveryWithout: asked.without, decisionId: `dec_${req.id.slice(4)}` };
  if (paused) return { ...base, decision: 'none', recoveryWith: asked.without, expectedProfitChange: 0, reason: 'Smart Offers is paused (kill switch): no discounts are authorised.' };
  if (req.holdout) return { ...base, decision: 'none', recoveryWith: asked.without, expectedProfitChange: 0, reason: 'Holdout: 1 in 10 recovery requests gets no discount, so the lift is measured, not assumed.' };
  const plan = liveOffers[req.group];
  if (plan === 'none') {
    return { ...base, decision: 'none', recoveryWith: asked.with, expectedProfitChange: asked.change, reason: `${label(req.group)} recover at ${pct(asked.without)} without a discount; ${OFFER_BY_ID[req.asked].label} adds ~${Math.round((asked.with - asked.without) * 100)} pp; doesn't pay back (${money(asked.change)} per request).` };
  }
  const e = recoveryEconomics(g, plan, margin, kept);
  if (e.change <= 0) return { ...base, decision: 'none', recoveryWith: e.with, expectedProfitChange: e.change, reason: `Recovery ${pct(e.without)} → ${pct(e.with)} with ${OFFER_BY_ID[plan].label}, but it doesn't pay back (${money(e.change)} per request).` };
  return { ...base, decision: plan, recoveryWith: e.with, expectedProfitChange: e.change, reason: `Recovery ${pct(e.without)} → ${pct(e.with)} with ${OFFER_BY_ID[plan].label}${plan !== req.asked ? ` (the plan's offer, not ${OFFER_BY_ID[req.asked].label})` : ''}; pays back (${money(e.change)} per request).` };
}

export function brainSummary(answers: BrainAnswer[], groups: GroupStats[]) {
  const noDiscount = answers.filter((a) => a.decision === 'none');
  const avoided = noDiscount.reduce((t, a) => {
    const g = groups.find((x) => x.id === a.group)!;
    return t + RECOVERY[a.group].withOffer * OFFER_BY_ID[a.asked].costPerOrderInr * (g.costShare?.[a.asked] ?? 1);
  }, 0);
  const recoveries = answers.reduce((t, a) => t + (a.decision === 'none' ? a.recoveryWithout : a.recoveryWith), 0);
  return { requests: answers.length, noDiscountShare: answers.length ? noDiscount.length / answers.length : 0, discountAvoided: avoided, recoveries, holdout: answers.filter((a) => a.holdout).length };
}
