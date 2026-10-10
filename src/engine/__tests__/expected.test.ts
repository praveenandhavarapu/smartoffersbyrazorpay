import expected from '../../../fixtures/expected_outputs.json';
import { fixtureGroupStats, PILOT_TRUTH, CREATOR_CODES } from '../../data/fixtures';
import { poolLifts } from '../../data/network/peers';
import { buildPlan, offerMap, planRange, storeOrders, type PlanResult } from '../plan';
import { alpha10, codesEconomics, overrideCost, planProfitAtMargin, ruleFirstOrderOnly } from '../scenarios';
import { blendGroups, countsFromFormula, feeBasis, measure, type Snapshot } from '../measure';
import { creatorReport } from '../creators';
import { roundHalfEven } from '../../lib/format';
import { generateAlpha } from '../../data/generator/alpha';
import { pilotCountsFromSessions } from '../../data/aggregate';

const groups = fixtureGroupStats();
const money = (a: number, b: number) => expect(Math.abs(roundHalfEven(a) - b)).toBeLessThanOrEqual(1);
const ret = (a: number, b: number) => expect(Math.abs(roundHalfEven(a, 2) - b)).toBeLessThanOrEqual(0.01 + 1e-9);
const tenth = (a: number, b: number) => expect(Math.abs(roundHalfEven(a, 1) - b)).toBeLessThanOrEqual(0.1 + 1e-9);

type ExpRow = { group: string; offer?: string; spend: number; extra_sales: number; extra_orders: number; ret: number };
type ExpPlan = { rows: ExpRow[]; spend: number; extra_sales: number; extra_orders: number; ret: number; profit: number; orders: number; orders_change_pct: number };

function checkPlan(p: PlanResult, e: ExpPlan) {
  for (const er of e.rows) {
    const r = p.rows.find((x) => x.group === er.group)!;
    expect(r.offer).toBe(er.offer);
    money(r.spend, er.spend); money(r.extraSales, er.extra_sales); tenth(r.extraOrders, er.extra_orders); ret(r.ret, er.ret);
  }
  money(p.spend, e.spend); money(p.extraSales, e.extra_sales); tenth(p.extraOrders, e.extra_orders); ret(p.ret, e.ret); money(p.profit, e.profit);
  expect(Math.abs(roundHalfEven(p.orders) - e.orders)).toBeLessThanOrEqual(1);
  tenth(p.ordersChangePct, e.orders_change_pct);
}

describe('engine reproduces fixtures/expected_outputs.json', () => {
  it('store month', () => {
    const so = storeOrders(groups);
    expect(groups.reduce((a, g) => a + g.checkouts, 0)).toBe(expected.store_month.checkouts);
    expect(roundHalfEven(so.today)).toBe(expected.store_month.orders);
    const gmv = groups.reduce((a, g) => a + g.checkouts * g.baseConversion * g.aovInr, 0) + codesEconomics(groups, () => true).extraSales;
    money(gmv, expected.store_month.gmv_inr);
    money(gmv / so.today, expected.store_month.aov_inr);
    tenth(so.creatorExtra, expected.creator_code_extra_orders_per_month);
  });

  it('today: ALPHA10 and all codes', () => {
    const a = alpha10(groups);
    for (const er of expected.today_alpha10.rows) {
      const r = a.rows.find((x) => x.group === er.group)!;
      money(r.spend, er.spend); money(r.extraSales, er.extra_sales); tenth(r.extraOrders, er.extra_orders); ret(r.ret, er.ret);
    }
    money(a.spend, expected.today_alpha10.spend); money(a.extraSales, expected.today_alpha10.extra_sales);
    ret(a.ret, expected.today_alpha10.ret); money(a.profit, expected.today_alpha10.profit);
    const ret_ = a.rows.find((r) => r.group === 'returning')!;
    money(ret_.spend, expected.today_alpha10.to_returning);
    tenth((ret_.spend / a.spend) * 100, expected.today_alpha10.to_returning_pct);
    const all = codesEconomics(groups, () => true);
    money(all.spend, expected.today_all_codes.spend); money(all.profit, expected.today_all_codes.profit); ret(all.ret, expected.today_all_codes.ret);
  });

  it('default plan (most profit, ₹1L)', () => {
    const p = buildPlan(groups);
    checkPlan(p, expected.plan_most_profit_budget_100k as ExpPlan);
    expect(offerMap(p)).toEqual(PILOT_TRUTH.planOffers);
    money(p.profit - alpha10(groups).profit, expected.profit_swing_vs_alpha10);
    money(buildPlan(groups, { coverage: 1 }).profit, expected.plan_without_holdout_profit);
    tenth(p.extraOrders / 9, expected.holdout_cost_per_month.extra_orders);
    money(p.profit / 9, expected.holdout_cost_per_month.profit);
  });

  it('scenarios', () => {
    checkPlan(buildPlan(groups, { floorReturn: 4 }), expected.scenario_floor_4x as ExpPlan);
    checkPlan(buildPlan(groups, { floorReturn: 3 }), expected.scenario_floor_3x as ExpPlan);
    checkPlan(buildPlan(groups, { margin: 0.3 }), expected.scenario_margin_30pct as ExpPlan);
    checkPlan(buildPlan(groups, { budget: 50000 }), expected.scenario_budget_50k as ExpPlan);
    money(planProfitAtMargin(buildPlan(groups), 0.3), expected.old_plan_profit_if_margin_is_30pct);
  });

  it('simple rule and override', () => {
    const full = ruleFirstOrderOnly(groups, 0.4, 1);
    money(full.spend, expected.rule_first_order_only.spend); money(full.profit, expected.rule_first_order_only.profit);
    const r = ruleFirstOrderOnly(groups);
    const e = expected.rule_first_order_only_same_shoppers_90pct;
    money(r.spend, e.spend); money(r.extraSales, e.extra_sales); ret(r.ret, e.ret); money(r.profit, e.profit);
    const o = overrideCost(groups, 'returning', 'flat_100');
    const eo = expected.override_returning_flat_100;
    money(o.spend, eo.spend); tenth(o.extraOrders, eo.extra_orders); money(o.extraSales, eo.extra_sales); ret(o.ret, eo.ret); money(o.profit, eo.profit);
  });

  it('goals: orders steady floor 2% is infeasible with no budget option; new customers keeps the plan', () => {
    const p = buildPlan(groups, { goal: 'orders_steady', ordersFloorPct: 2 });
    expect(p.infeasible).toBeDefined();
    expect(p.infeasible!.raiseBudgetTo).toBeUndefined();
    tenth(p.infeasible!.bestAnyBudgetPct, -2.9); // "about −2.9%" (exact −2.85%)
    expect(p.infeasible!.bestChangePct).toBeLessThanOrEqual(p.infeasible!.bestAnyBudgetPct);
    expect(buildPlan(groups, { goal: 'orders_steady', ordersFloorPct: 5 }).infeasible).toBeUndefined();
    expect(offerMap(buildPlan(groups, { goal: 'new_customers' }))).toEqual(offerMap(buildPlan(groups)));
  });

  it('plan range brackets the expected return (pool percentiles)', () => {
    const pl = poolLifts();
    const p = buildPlan(groups);
    const r = planRange(groups, p, pl.p25, pl.p75);
    expect(r.retLow).toBeLessThanOrEqual(p.ret);
    expect(r.retHigh).toBeGreaterThanOrEqual(p.ret);
  });

  type ExpSnap = typeof expected.pilot_day_20;
  function checkSnap(s: Snapshot, e: ExpSnap) {
    for (const er of e.rows) {
      const r = s.rows.find((x) => x.group === er.group)!;
      expect(r.offer).toBe(er.offer);
      expect(r.treatedCheckouts).toBe(er.treated_checkouts); expect(r.treatedOrders).toBe(er.treated_orders);
      expect(r.holdoutCheckouts).toBe(er.holdout_checkouts); expect(r.holdoutOrders).toBe(er.holdout_orders);
      tenth(r.treatedRate * 100, er.treated_rate); tenth(r.holdoutRate * 100, er.holdout_rate); tenth(r.lift * 100, er.lift_pp);
      tenth(r.liftLow * 100, er.lift_range_pp[0]); tenth(r.liftHigh * 100, er.lift_range_pp[1]);
      expect(r.stillLearning).toBe(er.still_learning);
      expect(Math.abs(roundHalfEven(r.trustWeight, 2) - er.trust_weight)).toBeLessThanOrEqual(0.01);
      if ('spend' in er) {
        const x = er as typeof er & { spend: number; extra_orders: number; extra_sales: number; ret: number };
        money(r.spend, x.spend); tenth(r.extraOrders, x.extra_orders); money(r.extraSales, x.extra_sales); ret(r.ret, x.ret);
      }
    }
    money(s.spend, e.spend); money(s.extraSales, e.extra_sales); tenth(s.extraOrders, e.extra_orders);
    money(s.extraOrdersLow, e.extra_orders_range[0]); money(s.extraOrdersHigh, e.extra_orders_range[1]);
    ret(s.ret, e.ret); ret(s.retLow, e.ret_range[0]); ret(s.retHigh, e.ret_range[1]); money(s.profit, e.profit);
  }

  it('pilot day 20 (from generated sessions via aggregate.ts) and day 60 (from formulas)', () => {
    const offers = offerMap(buildPlan(groups));
    const d20 = measure(groups, offers, pilotCountsFromSessions(generateAlpha().pilot20), 20);
    checkSnap(d20, expected.pilot_day_20);
    const d60 = measure(groups, offers, countsFromFormula(groups, offers, PILOT_TRUTH.actualLiftPp, 60), 60);
    checkSnap(d60, expected.pilot_day_60 as unknown as ExpSnap);
    const plan = buildPlan(groups);
    for (const [s, e] of [[d20, expected.pilot_day_20], [d60, expected.pilot_day_60]] as const) {
      money((plan.spend * s.days) / 30, e.budget_pace);
      money((alpha10(groups).profit * s.days) / 30, e.alpha10_same_period_profit);
      money((alpha10(groups).rows.find((r) => r.group === 'returning')!.spend * s.days) / 30, e.returning_not_given_away);
    }
  });

  it('fee basis', () => {
    const offers = offerMap(buildPlan(groups));
    for (const [days, e] of [[20, expected.fee_basis_day_20], [60, expected.fee_basis_day_60]] as const) {
      const s = measure(groups, offers, countsFromFormula(groups, offers, PILOT_TRUTH.actualLiftPp, days), days);
      const f = feeBasis(s);
      tenth(f.avgExtraOrderValue, e.avg_extra_order_value);
      expect(f.provenExtraOrders).toBe(e.proven_extra_orders);
      money(f.provenExtraSales, e.proven_extra_sales); money(f.fee, e.fee); money(f.cap, e.cap);
    }
  });

  it('creator code report', () => {
    const r = creatorReport(groups, CREATOR_CODES);
    const e = expected.creator_codes;
    expect(r.totalUses).toBe(e.total_uses); expect(r.returningUses).toBe(e.returning_uses);
    expect(r.monthlyDiscountToReturning).toBe(e.monthly_discount_to_returning);
    money(r.firstOrderOnlyNetGain, e.first_order_only_net_gain); tenth(r.lostOrders, e.lost_orders);
    for (const er of e.rows) {
      const x = r.rows.find((y) => y.code === er.code)!;
      expect(roundHalfEven(x.returningSharePct)).toBe(er.returning_share_pct);
      expect(x.discountToReturning).toBe(er.discount_to_returning); expect(x.flag).toBe(er.flag);
    }
  });

  it('blended lifts: day 20 re-plan keeps the same offers', () => {
    const offers = offerMap(buildPlan(groups));
    const d20 = measure(groups, offers, countsFromFormula(groups, offers, PILOT_TRUTH.actualLiftPp, 20), 20);
    expect(offerMap(buildPlan(blendGroups(groups, d20)))).toEqual(offers);
  });
});
