/**
 * Plan optimiser (SPEC 6.2). Mirrors docs/reference_engine.py `plan()` exactly for the
 * "most profit" goal, and adds the "new customers" and "orders steady" goals.
 */
import { NEW_GROUPS, type Goal, type GroupId, type GroupStats, type OfferId } from '../data/types';
import { PROFILE } from '../data/fixtures';
import { breakEven, candidateOffers, NONE_ECON, perCheckout, type Econ } from './economics';

export type PlanSettings = {
  budget: number;
  margin: number; // fraction, 0.40
  /** v2: share of extra sales kept after returns and failed COD (default 1 = v1 maths). */
  keptRate?: number;
  goal: Goal;
  ordersFloorPct: number; // used only with goal 'orders_steady'
  floorReturn?: number; // default break-even
  coverage?: number; // default 0.9 (10% holdout)
  allowedOffers?: readonly OfferId[];
  maxDiscountInr?: number;
  overrides?: Partial<Record<GroupId, OfferId>>;
  /**
   * v3 growth trade-off: give up up to `giveUpInr` of monthly profit (vs the plan without it) for more
   * new customers or orders. Upgrades go to the best extra customers per rupee of profit lost, within budget.
   */
  growth?: GrowthSetting | null;
};

export type GrowthMetric = 'new_customers' | 'orders';
export type GrowthSetting = { metric: GrowthMetric; giveUpInr: number };

export const DEFAULT_SETTINGS: PlanSettings = {
  budget: 100000,
  margin: PROFILE.marginPct / 100,
  goal: 'most_profit',
  ordersFloorPct: 5,
  allowedOffers: ['free_shipping', 'flat_100', 'flat_200'],
  maxDiscountInr: 250,
};

export type PlanRow = {
  group: GroupId;
  label: string;
  offer: OfferId;
  econ: Econ;
  covered: number; // checkouts that can see an offer (coverage applied)
  spend: number;
  extraSales: number;
  extraOrders: number;
  ret: number;
  profit: number;
  overridden: boolean;
};

export type PlanResult = {
  rows: PlanRow[];
  spend: number;
  extraSales: number;
  extraOrders: number;
  ret: number;
  profit: number;
  orders: number;
  ordersChangePct: number;
  overBudget: boolean;
  /** bestChangePct: best reachable within budget; bestAnyBudgetPct: best at break-even with up to ₹10,00,000. */
  infeasible?: { bestChangePct: number; bestAnyBudgetPct: number; raiseBudgetTo?: number };
  settings: PlanSettings;
};

export type Opt = { offer: OfferId; e: Econ };

/** Store-level order counts shared by every scenario. */
export function storeOrders(groups: GroupStats[]) {
  const base = groups.reduce((a, g) => a + g.checkouts * g.baseConversion, 0);
  let alpha10 = 0;
  let creator = 0;
  for (const g of groups) for (const t of g.today) {
    const x = (g.checkouts * t.share * t.liftPp) / 100;
    if (t.code === 'ALPHA10') alpha10 += x;
    else if (t.code === 'CREATOR15') creator += x;
  }
  return { base, alpha10Extra: alpha10, creatorExtra: creator, today: base + alpha10 + creator };
}

function optsFor(g: GroupStats, s: PlanSettings, floor: number): Opt[] {
  const out: Opt[] = [{ offer: 'none', e: NONE_ECON }];
  for (const o of candidateOffers(g, s.allowedOffers)) {
    const e = perCheckout(g, o, s.margin, undefined, s.keptRate ?? 1);
    if (s.maxDiscountInr !== undefined && e.spend / Math.max(e.p, 1e-9) > s.maxDiscountInr) continue;
    if (e.ret >= floor - 1e-12) out.push({ offer: o, e });
  }
  return out;
}

const r9 = (x: number) => Math.round(x * 1e9) / 1e9;

export function buildPlan(groups: GroupStats[], settings: Partial<PlanSettings> = {}): PlanResult {
  const s: PlanSettings = { ...DEFAULT_SETTINGS, ...settings };
  const floor = s.floorReturn ?? breakEven(s.margin);
  const coverage = s.coverage ?? 1 - PROFILE.holdoutPct / 100;
  const repeatValue = PROFILE.repeat.rate * PROFILE.repeat.aovInr * s.margin * (s.keptRate ?? 1);
  const objective = (g: GroupStats, e: Econ) =>
    e.profit + (s.goal === 'new_customers' && NEW_GROUPS.includes(g.id) ? e.lift * repeatValue : 0);

  const opts = new Map(groups.map((g) => [g.id, optsFor(g, s, floor)]));
  const choice = new Map<GroupId, Opt>();
  for (const g of groups) {
    const os = opts.get(g.id)!;
    let best = os[0];
    for (const o of os.slice(1)) {
      const a = r9(objective(g, o.e)), b = r9(objective(g, best.e));
      if (a > b || (a === b && -o.e.spend > -best.e.spend)) best = o;
    }
    choice.set(g.id, objective(g, best.e) > 1e-9 ? best : os[0]);
  }

  const totalSpend = (ch: Map<GroupId, Opt>) => groups.reduce((a, g) => a + g.checkouts * coverage * ch.get(g.id)!.e.spend, 0);

  // Budget: apply the downgrade that loses the least objective per rupee saved.
  const downgraded = totalSpend(choice) > s.budget + 1e-6;
  while (totalSpend(choice) > s.budget + 1e-6) {
    const cands: { k: number; g: GroupId; o: Opt }[] = [];
    for (const g of groups) {
      const cur = choice.get(g.id)!;
      if (cur.offer === 'none') continue;
      for (const o2 of opts.get(g.id)!) {
        const saved = cur.e.spend - o2.e.spend;
        if (o2.offer === cur.offer || saved <= 0) continue;
        cands.push({ k: (objective(g, cur.e) - objective(g, o2.e)) / saved, g: g.id, o: o2 });
      }
    }
    if (!cands.length) break;
    cands.sort((a, b) => a.k - b.k);
    choice.set(cands[0].g, cands[0].o);
  }
  // Refill (v3, mirrored in reference_engine.py): greedy downgrades can leave budget unused; add the upgrade
  // with the largest objective gain that still fits, until none does. Plans that never hit the budget are unchanged.
  while (downgraded) {
    const room = s.budget - totalSpend(choice);
    let best: { gain: number; g: GroupId; o: Opt } | null = null;
    for (const g of groups) {
      const cur = choice.get(g.id)!, n = g.checkouts * coverage;
      for (const o2 of opts.get(g.id)!) {
        const gain = (objective(g, o2.e) - objective(g, cur.e)) * n;
        const extra = (o2.e.spend - cur.e.spend) * n;
        if (gain > 1e-9 && extra <= room + 1e-6 && (!best || gain > best.gain + 1e-9)) best = { gain, g: g.id, o: o2 };
      }
    }
    if (!best) break;
    choice.set(best.g, best.o);
  }

  let infeasible: PlanResult['infeasible'];
  if (s.goal === 'orders_steady') {
    const res = keepOrdersSteady(groups, s, choice, opts, coverage, s.budget);
    if (!res.ok) {
      const big = new Map(choice);
      const reach = keepOrdersSteady(groups, s, big, opts, coverage, 1_000_000);
      infeasible = { bestChangePct: res.changePct, bestAnyBudgetPct: reach.changePct, ...(reach.ok ? { raiseBudgetTo: Math.ceil(totalSpend(big) / 1000) * 1000 } : {}) };
    }
  }

  if (s.growth && s.growth.giveUpInr > 0) {
    const steps = growthSteps(groups, s, choice, coverage, s.growth.metric);
    // ₹1 tolerance: give-up amounts are shown and passed back rounded to the rupee.
    const within = steps.filter((x) => x.giveUp <= s.growth!.giveUpInr + 1);
    const last = within[within.length - 1];
    if (last) for (const [gid, o] of last.choice) choice.set(gid, o);
  }

  // Merchant overrides win (shown with their cost); they are not re-optimised.
  const overridden = new Set<GroupId>();
  for (const g of groups) {
    const o = s.overrides?.[g.id];
    if (o && o !== choice.get(g.id)!.offer) {
      choice.set(g.id, { offer: o, e: o === 'none' ? NONE_ECON : perCheckout(g, o, s.margin, undefined, s.keptRate ?? 1) });
      overridden.add(g.id);
    }
  }
  return assemble(groups, choice, s, coverage, overridden, infeasible);
}

/** One step of the growth frontier: the plan after this upgrade (cumulative from the starting plan). */
export type GrowthStep = { choice: Map<GroupId, Opt>; giveUp: number; gained: number; change: { group: GroupId; from: OfferId; to: OfferId } };

/**
 * Greedy growth frontier from a starting choice: each step moves one group to the offer that adds the most
 * new customers (or orders) per rupee of profit lost, within the budget and max discount. A merchant-set
 * minimum return (floorReturn) still applies; break-even does not (the profit given up is the point).
 */
export function growthSteps(groups: GroupStats[], s: PlanSettings, start: Map<GroupId, Opt>, coverage: number, metric: GrowthMetric): GrowthStep[] {
  const choice = new Map(start);
  const counts = (g: GroupStats) => metric === 'orders' || NEW_GROUPS.includes(g.id);
  const opts = new Map(groups.map((g) => [g.id, optsFor(g, s, s.floorReturn ?? -Infinity)]));
  const spend = () => groups.reduce((a, g) => a + g.checkouts * coverage * choice.get(g.id)!.e.spend, 0);
  const profit = () => groups.reduce((a, g) => a + g.checkouts * coverage * choice.get(g.id)!.e.profit, 0);
  const metricOf = () => groups.reduce((a, g) => a + (counts(g) ? g.checkouts * coverage * choice.get(g.id)!.e.lift : 0), 0);
  const p0 = profit(), m0 = metricOf();
  const out: GrowthStep[] = [];
  for (let guard = 0; guard < 40; guard++) {
    let best: { k: number; g: GroupStats; o: Opt } | null = null;
    for (const g of groups) {
      if (!counts(g)) continue;
      const cur = choice.get(g.id)!;
      for (const o2 of opts.get(g.id)!) {
        const gained = (o2.e.lift - cur.e.lift) * g.checkouts * coverage;
        if (gained <= 1e-9) continue;
        if (spend() + (o2.e.spend - cur.e.spend) * g.checkouts * coverage > s.budget + 1e-6) continue;
        const lost = (cur.e.profit - o2.e.profit) * g.checkouts * coverage;
        const k = lost <= 1e-9 ? Infinity : gained / lost;
        if (!best || k > best.k + 1e-12) best = { k, g, o: o2 };
      }
    }
    if (!best) break;
    const from = choice.get(best.g.id)!.offer;
    choice.set(best.g.id, best.o);
    out.push({ choice: new Map(choice), giveUp: Math.max(0, p0 - profit()), gained: metricOf() - m0, change: { group: best.g.id, from, to: best.o.offer } });
  }
  return out;
}

function ordersChange(groups: GroupStats[], extraOrders: number): { orders: number; pct: number } {
  const so = storeOrders(groups);
  const orders = so.base + extraOrders + so.creatorExtra;
  return { orders, pct: (orders / so.today - 1) * 100 };
}

/** Upgrade offers (most extra orders per rupee of profit lost) until the orders floor holds. Mutates `choice`. */
function keepOrdersSteady(
  groups: GroupStats[], s: PlanSettings, choice: Map<GroupId, Opt>, opts: Map<GroupId, Opt[]>, coverage: number, budget: number,
): { ok: boolean; changePct: number } {
  const extra = () => groups.reduce((a, g) => a + g.checkouts * coverage * choice.get(g.id)!.e.lift, 0);
  const spend = () => groups.reduce((a, g) => a + g.checkouts * coverage * choice.get(g.id)!.e.spend, 0);
  for (let guard = 0; guard < 50; guard++) {
    const { pct } = ordersChange(groups, extra());
    if (pct >= -s.ordersFloorPct - 1e-9) return { ok: true, changePct: pct };
    const cands: { k: number; g: GroupId; o: Opt }[] = [];
    for (const g of groups) {
      const cur = choice.get(g.id)!;
      for (const o2 of opts.get(g.id)!) {
        const gained = (o2.e.lift - cur.e.lift) * g.checkouts * coverage;
        if (gained <= 1e-9) continue;
        const addSpend = (o2.e.spend - cur.e.spend) * g.checkouts * coverage;
        if (spend() + addSpend > budget + 1e-6) continue;
        const lost = (cur.e.profit - o2.e.profit) * g.checkouts * coverage;
        cands.push({ k: lost <= 0 ? -Infinity : -gained / lost, g: g.id, o: o2 });
      }
    }
    if (!cands.length) return { ok: false, changePct: pct };
    cands.sort((a, b) => a.k - b.k);
    choice.set(cands[0].g, cands[0].o);
  }
  return { ok: false, changePct: ordersChange(groups, extra()).pct };
}

function assemble(
  groups: GroupStats[], choice: Map<GroupId, Opt>, s: PlanSettings, coverage: number, overridden: Set<GroupId>,
  infeasible: PlanResult['infeasible'],
): PlanResult {
  const rows: PlanRow[] = groups.map((g) => {
    const { offer, e } = choice.get(g.id)!;
    const n = g.checkouts * coverage;
    return {
      group: g.id, label: g.label, offer, econ: e, covered: n,
      spend: n * e.spend, extraSales: n * e.extraSales, extraOrders: n * e.lift, ret: e.ret, profit: n * e.profit,
      overridden: overridden.has(g.id),
    };
  });
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const extraSales = rows.reduce((a, r) => a + r.extraSales, 0);
  const extraOrders = rows.reduce((a, r) => a + r.extraOrders, 0);
  const oc = ordersChange(groups, extraOrders);
  return {
    rows, spend, extraSales, extraOrders, ret: spend ? (extraSales * (s.keptRate ?? 1)) / spend : 0, profit: extraSales * (s.keptRate ?? 1) * s.margin - spend,
    orders: oc.orders, ordersChangePct: oc.pct, overBudget: spend > s.budget + 1e-6, infeasible, settings: s,
  };
}

/** Offers by group (for the checkout table and pilot). */
export const offerMap = (p: PlanResult): Record<GroupId, OfferId> =>
  Object.fromEntries(p.rows.map((r) => [r.group, r.offer])) as Record<GroupId, OfferId>;

/** Playbook variants have no pool percentiles: use the closest standard offer's spread around the variant's own prior. */
const RANGE_ANCHOR: Partial<Record<OfferId, OfferId>> = { flat_150: 'flat_200', free_shipping_999: 'free_shipping', free_shipping_prepaid: 'free_shipping' };
function rangeLift(t: Record<GroupId, Partial<Record<OfferId, number>>>, g: GroupStats, offer: OfferId): number | undefined {
  const direct = t[g.id]?.[offer];
  if (direct !== undefined) return direct;
  const prior = g.priorLiftsPp[offer];
  if (prior === undefined) return undefined;
  const a = RANGE_ANCHOR[offer];
  const anchorPrior = a ? g.priorLiftsPp[a] : undefined, anchorPct = a ? t[g.id]?.[a] : undefined;
  return anchorPrior && anchorPct !== undefined ? prior * (anchorPct / anchorPrior) : prior;
}

/** Plan range: re-run the chosen offers' economics with pool 25th / 75th percentile lifts (SPEC 6.2). */
export function planRange(groups: GroupStats[], p: PlanResult, p25: Record<GroupId, Partial<Record<OfferId, number>>>, p75: Record<GroupId, Partial<Record<OfferId, number>>>) {
  const run = (t: Record<GroupId, Partial<Record<OfferId, number>>>) => {
    let spend = 0, sales = 0;
    for (const r of p.rows) {
      if (r.offer === 'none') continue;
      const g = groups.find((x) => x.id === r.group)!;
      const e = perCheckout(g, r.offer, p.settings.margin, rangeLift(t, g, r.offer));
      spend += r.covered * e.spend;
      sales += r.covered * e.extraSales;
    }
    const k = p.settings.keptRate ?? 1;
    return { ret: spend ? (sales * k) / spend : 0, profit: sales * k * p.settings.margin - spend };
  };
  const lo = run(p25), hi = run(p75);
  return { retLow: lo.ret, retHigh: hi.ret, profitLow: lo.profit, profitHigh: hi.profit };
}
