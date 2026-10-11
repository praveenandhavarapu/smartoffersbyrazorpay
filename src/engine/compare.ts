/**
 * "Why AI, not a fixed rule" (v2 spec §5.5): ALPHA10 for everyone, a simple rule and Smart Offers
 * on the same shoppers (90% treated), the same budget cap, the same kept rate and margin.
 */
import type { GroupId, GroupStats, OfferId } from '../data/types';
import { breakEven, candidateOffers, perCheckout } from './economics';
import type { PlanResult } from './plan';
import { alpha10, ruleFirstOrderOnly } from './scenarios';

export type Strategy = { id: 'blanket' | 'rule' | 'ai'; label: string; profit: number; spend: number; extraOrders: number; ret: number; capped: boolean };
export type Comparison = { rows: Strategy[]; verdict: 'ai_wins' | 'tie' | 'rule_wins'; budget: number; coverage: number };

type Money = { spend: number; extraSales: number; extraOrders: number };

/** A rule that hits the budget stops for the rest of the month: spend, sales and orders scale down together. */
function capped(x: Money, budget: number, margin: number, kept: number) {
  const f = x.spend > budget ? budget / x.spend : 1;
  const spend = x.spend * f, extraSales = x.extraSales * f;
  return { spend, extraOrders: x.extraOrders * f, profit: extraSales * kept * margin - spend, ret: spend ? (extraSales * kept) / spend : 0, capped: f < 1 };
}

export function compareStrategies(groups: GroupStats[], plan: PlanResult, coverage = 0.9): Comparison {
  const margin = plan.settings.margin, kept = plan.settings.keptRate ?? 1, budget = plan.settings.budget;
  const a = alpha10(groups, margin, kept);
  const blanket = capped({ spend: a.spend * coverage, extraSales: a.extraSales * coverage, extraOrders: a.extraOrders * coverage }, budget, margin, kept);
  const rule = capped(ruleFirstOrderOnly(groups, margin, coverage, kept), budget, margin, kept);
  const rows: Strategy[] = [
    { id: 'blanket', label: 'ALPHA10 for everyone (today)', ...blanket },
    { id: 'rule', label: 'Simple rule: ALPHA10 for first orders only', ...rule },
    { id: 'ai', label: 'Smart Offers: offer or none per group', profit: plan.profit, spend: plan.spend, extraOrders: plan.extraOrders, ret: plan.ret, capped: false },
  ];
  const tol = Math.max(1000, 0.05 * Math.abs(plan.profit));
  const verdict = rule.profit > plan.profit + tol ? 'rule_wins' : Math.abs(rule.profit - plan.profit) <= tol ? 'tie' : 'ai_wins';
  return { rows, verdict, budget, coverage };
}

export type ProfitOverRatio = { group: GroupId; offer: OfferId; ret: number; alt: OfferId; altRet: number; extraProfitMonth: number };

/** A group where the plan picked an offer with a LOWER return but MORE profit than another eligible offer (null if none). */
export function profitOverRatio(groups: GroupStats[], plan: PlanResult): ProfitOverRatio | null {
  const s = plan.settings, kept = s.keptRate ?? 1, be = breakEven(s.margin);
  let best: ProfitOverRatio | null = null;
  for (const r of plan.rows) {
    if (r.offer === 'none') continue;
    const g = groups.find((x) => x.id === r.group);
    if (!g) continue;
    const e = perCheckout(g, r.offer, s.margin, undefined, kept);
    for (const o of candidateOffers(g, s.allowedOffers)) {
      if (o === r.offer) continue;
      const alt = perCheckout(g, o, s.margin, undefined, kept);
      if (s.maxDiscountInr !== undefined && alt.spend / Math.max(alt.p, 1e-9) > s.maxDiscountInr) continue;
      if (alt.ret < be || !(alt.ret > e.ret && alt.profit < e.profit)) continue;
      const extra = (e.profit - alt.profit) * r.covered;
      if (extra > 0 && (!best || extra > best.extraProfitMonth)) best = { group: r.group, offer: r.offer, ret: e.ret, alt: o, altRet: alt.ret, extraProfitMonth: extra };
    }
  }
  return best;
}
