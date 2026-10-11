/** Scenarios used by Ray and the setup card (SPEC 6.3). */
import type { GroupId, GroupStats, OfferId } from '../data/types';
import { perCheckout } from './economics';
import { buildPlan, DEFAULT_SETTINGS, type PlanResult, type PlanSettings } from './plan';

export type CodeRow = { group: GroupId; spend: number; extraSales: number; extraOrders: number; ret: number };
export type CodeEconomics = { rows: CodeRow[]; spend: number; extraSales: number; extraOrders: number; ret: number; profit: number };

/** Economics of today's codes (no holdout existed; lifts are network estimates). kept: v2 net-of-returns (1 = v1). */
export function codesEconomics(groups: GroupStats[], filter: (code: string) => boolean, margin = DEFAULT_SETTINGS.margin, kept = 1): CodeEconomics {
  let S = 0, X = 0, O = 0;
  const rows: CodeRow[] = [];
  for (const g of groups) {
    let s = 0, x = 0, o = 0;
    for (const u of g.today) {
      if (!filter(u.code)) continue;
      const n = g.checkouts * u.share;
      const l = u.liftPp / 100;
      s += n * (g.baseConversion + l) * u.discountInr;
      x += n * l * g.aovInr;
      o += n * l;
    }
    if (s) rows.push({ group: g.id, spend: s, extraSales: x, extraOrders: o, ret: (x * kept) / s });
    S += s; X += x; O += o;
  }
  return { rows, spend: S, extraSales: X, extraOrders: O, ret: S ? (X * kept) / S : 0, profit: X * kept * margin - S };
}

export const alpha10 = (groups: GroupStats[], margin?: number, kept = 1) => codesEconomics(groups, (c) => c === 'ALPHA10', margin, kept);

/** "ALPHA10 for first orders only" (the three new non-creator groups); coverage 0.9 = like-for-like. */
export function ruleFirstOrderOnly(groups: GroupStats[], margin = DEFAULT_SETTINGS.margin, coverage = 0.9, kept = 1) {
  const a = alpha10(groups, margin, kept);
  const rows = a.rows.filter((r) => ['new_ads_small', 'new_ads_big', 'new_organic'].includes(r.group));
  const spend = rows.reduce((t, r) => t + r.spend, 0);
  const extraSales = rows.reduce((t, r) => t + r.extraSales, 0);
  const extraOrders = rows.reduce((t, r) => t + r.extraOrders, 0);
  return { spend: spend * coverage, extraSales: extraSales * coverage, extraOrders: extraOrders * coverage, ret: (extraSales * kept) / spend, profit: (extraSales * kept * margin - spend) * coverage };
}

/** Cost of forcing one group onto an offer (merchant override), 90% coverage. */
export function overrideCost(groups: GroupStats[], group: GroupId, offer: OfferId, margin = DEFAULT_SETTINGS.margin, coverage = 0.9, kept = 1) {
  const g = groups.find((x) => x.id === group)!;
  const e = perCheckout(g, offer, margin, undefined, kept);
  const n = g.checkouts * coverage;
  return { group, offer, spend: n * e.spend, extraOrders: n * e.lift, extraSales: n * e.extraSales, ret: e.ret, profit: n * e.profit };
}

export type Simulation = PlanResult & {
  vsCurrent: { profit: number; spend: number; ordersChangePct: number };
  vsAlpha10: { profit: number };
};

/** simulate({budget, margin, goal, ordersFloorPct, floorReturn, allowedOffers, overrides}) -> plan + deltas. */
export function simulate(groups: GroupStats[], settings: Partial<PlanSettings>, current?: PlanResult): Simulation {
  const p = buildPlan(groups, settings);
  const cur = current ?? buildPlan(groups, {});
  const a = alpha10(groups, p.settings.margin, p.settings.keptRate ?? 1);
  return {
    ...p,
    vsCurrent: { profit: p.profit - cur.profit, spend: p.spend - cur.spend, ordersChangePct: p.ordersChangePct - cur.ordersChangePct },
    vsAlpha10: { profit: p.profit - a.profit },
  };
}

/** Profit of an existing plan's offers if the margin is actually different (e.g. 30%). */
export const planProfitAtMargin = (p: PlanResult, margin: number): number => p.extraSales * (p.settings.keptRate ?? 1) * margin - p.spend;
