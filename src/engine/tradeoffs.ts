/**
 * v3 trade-offs the merchant chooses between (nothing here is assumed for them):
 *  - Growth frontier: how many more new customers (or orders) each rupee of profit buys, step by step.
 *  - Margin squeeze: what the plan keeps and loses if the store keeps less of each sale, and what it would
 *    cost to keep today's new customers anyway.
 * Every point is a real plan from buildPlan (same budget, menu, max discount and minimum return).
 */
import { NEW_GROUPS, type GroupId, type GroupStats, type OfferId } from '../data/types';
import { breakEven } from './economics';
import { buildPlan, growthSteps, offerMap, type GrowthMetric, type GrowthSetting, type PlanResult, type PlanSettings } from './plan';
import { PROFILE } from '../data/fixtures';

/** First orders per month: shoppers in new-customer groups who buy (with or without an offer). */
export function newCustomers(groups: GroupStats[], p: PlanResult): number {
  return groups.filter((g) => NEW_GROUPS.includes(g.id)).reduce((a, g) => a + g.checkouts * g.baseConversion, 0)
    + p.rows.filter((r) => NEW_GROUPS.includes(r.group)).reduce((a, r) => a + r.extraOrders, 0);
}

export type FrontierPoint = {
  /** Monthly profit given up vs the merchant's plan without a trade-off (negative = a gain from a bigger budget). */
  giveUp: number;
  /** Budget this point needs (the merchant's budget, or more, rounded up to ₹5,000). */
  budget: number;
  /** The growth setting that reproduces this point exactly (null = no trade-off). */
  growth: GrowthSetting | null;
  plan: PlanResult;
  profit: number; spend: number; orders: number; ordersChangePct: number;
  newCustomers: number;
  /** vs the first point (the plan without a trade-off). */
  extraNewCustomers: number; extraOrders: number;
  /** What this step changed, and what each extra customer (or order) of the step cost in profit. */
  changes: { group: GroupId; from: OfferId; to: OfferId; belowBreakEven: boolean }[];
  costPerExtra: number | null;
};

const coverageOf = (s: Partial<PlanSettings>) => s.coverage ?? 1 - PROFILE.holdoutPct / 100;
const up5k = (x: number) => Math.ceil((x - 1e-6) / 5000) * 5000;
export const MAX_BUDGET = 1_000_000;
/** How far the frontier looks past the merchant's budget (twice the budget, at least ₹1,00,000 more). */
export const exploreBudget = (budget: number) => Math.min(MAX_BUDGET, Math.max(budget * 2, budget + 100_000));

/**
 * The frontier from "no trade-off" to the most growth within `maxBudget`. Each point is rebuilt with
 * buildPlan from its own settings (budget + growth), so choosing it reproduces exactly what was shown.
 */
export function growthFrontier(groups: GroupStats[], settings: Partial<PlanSettings>, metric: GrowthMetric = 'new_customers', maxBudget?: number): FrontierPoint[] {
  const base = buildPlan(groups, { ...settings, growth: null });
  const budget0 = base.settings.budget;
  const start = new Map(base.rows.map((r) => [r.group, { offer: r.offer, e: r.econ }]));
  const steps = growthSteps(groups, { ...base.settings, budget: Math.max(budget0, maxBudget ?? budget0) }, start, coverageOf(settings), metric);
  const cov = coverageOf(settings);
  const n0 = newCustomers(groups, base), o0 = base.orders;
  const metricOf = (p: PlanResult) => (metric === 'orders' ? p.orders : newCustomers(groups, p));
  const make = (p: PlanResult, b: number, growth: GrowthSetting | null, prev: FrontierPoint | null): FrontierPoint => {
    const nc = newCustomers(groups, p);
    const changes = prev ? p.rows.filter((r) => prev.plan.rows.find((x) => x.group === r.group)!.offer !== r.offer).map((r) => ({ group: r.group, from: prev.plan.rows.find((x) => x.group === r.group)!.offer, to: r.offer, belowBreakEven: r.offer !== 'none' && r.ret < breakEven(p.settings.margin) })) : [];
    const gain = prev ? metricOf(p) - metricOf(prev.plan) : 0;
    return {
      giveUp: base.profit - p.profit, budget: b, growth, plan: p, profit: p.profit, spend: p.spend, orders: p.orders, ordersChangePct: p.ordersChangePct,
      newCustomers: nc, extraNewCustomers: nc - n0, extraOrders: p.orders - o0, changes,
      costPerExtra: prev && gain > 1e-9 ? (prev.profit - p.profit) / gain : null,
    };
  };
  const out: FrontierPoint[] = [make(base, budget0, null, null)];
  for (const st of steps) {
    const spend = groups.reduce((a, g) => a + g.checkouts * cov * st.choice.get(g.id)!.e.spend, 0);
    const profit = groups.reduce((a, g) => a + g.checkouts * cov * st.choice.get(g.id)!.e.profit, 0);
    const b = spend > budget0 + 1e-6 ? Math.min(MAX_BUDGET, up5k(spend)) : budget0;
    const baseB = b === budget0 ? base : buildPlan(groups, { ...settings, budget: b, growth: null });
    const g = Math.max(0, baseB.profit - profit);
    const growth = g > 1e-6 ? { metric, giveUpInr: Math.ceil(g) } : null;
    const p = buildPlan(groups, { ...settings, budget: b, growth });
    const prev = out[out.length - 1];
    if (metricOf(p) <= metricOf(prev.plan) + 1e-9) continue;
    out.push(make(p, b, growth, prev));
  }
  return out;
}

/** The furthest frontier point whose profit given up fits the merchant's limit. */
export const pointWithin = (f: FrontierPoint[], giveUpInr: number, budget?: number): FrontierPoint => [...f].reverse().find((x) => x.giveUp <= giveUpInr + 1e-6 && (budget === undefined || x.budget <= budget)) ?? f[0];

export type SqueezeRow = {
  keepPer1000: number; margin: number; breakEven: number;
  plan: PlanResult; offersOn: number; profit: number; newCustomers: number; orders: number;
  /** Groups whose offer stops (or changes) at this margin, vs the merchant's plan now. */
  lost: { group: GroupId; from: OfferId; to: OfferId }[];
  /** Profit to give up at this margin to keep today's new customers (null: not reachable within budget). */
  keepGrowthCost: number | null;
  current: boolean;
};

/** Plans at lower (and slightly higher) margins than the merchant's, same budget and menu. */
export function marginSqueeze(groups: GroupStats[], settings: Partial<PlanSettings>, keepPer1000: number, steps: number[] = [-200, -150, -100, -50, 0, 50]): SqueezeRow[] {
  const cur = buildPlan(groups, settings);
  const curNew = newCustomers(groups, cur);
  const curOffers = offerMap(cur);
  const keeps = [...new Set(steps.map((d) => keepPer1000 + d).filter((k) => k >= 150 && k <= 900))];
  return keeps.map((k) => {
    const s = { ...settings, margin: k / 1000 };
    const p = k === keepPer1000 ? cur : buildPlan(groups, { ...s, growth: settings.growth ?? null });
    const f = growthFrontier(groups, s, 'new_customers');
    const reach = f.find((x) => x.newCustomers >= curNew - 1e-6);
    return {
      keepPer1000: k, margin: k / 1000, breakEven: breakEven(k / 1000), plan: p, offersOn: p.rows.filter((r) => r.offer !== 'none').length,
      profit: p.profit, newCustomers: newCustomers(groups, p), orders: p.orders,
      lost: p.rows.filter((r) => r.offer !== curOffers[r.group]).map((r) => ({ group: r.group, from: curOffers[r.group], to: r.offer })),
      keepGrowthCost: reach ? reach.giveUp : null, current: k === keepPer1000,
    };
  });
}
