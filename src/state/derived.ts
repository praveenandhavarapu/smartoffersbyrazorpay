/** Pure derivation of every on-screen number from the model + user inputs (no hard-coded figures). */
import { PILOT_TRUTH } from '../data/fixtures';
import { GROUP_IDS, type GroupId, type OfferId } from '../data/types';
import { breakEven } from '../engine/economics';
import { buildPlan, offerMap, planRange, storeOrders, type PlanResult, type PlanSettings } from '../engine/plan';
import { alpha10, codesEconomics, ruleFirstOrderOnly } from '../engine/scenarios';
import { countsFromFormula, feeBasis, measure, type Snapshot } from '../engine/measure';
import { creatorReport } from '../engine/creators';
import { nearBreakEven } from '../engine/guardrails';
import type { Model } from './model';
import { DEFAULT_USER_SETTINGS, marginOf, type Settings } from './store';

export function toPlanSettings(s: Settings, overrides?: Partial<Record<GroupId, OfferId>>): Partial<PlanSettings> {
  return {
    budget: s.budget, margin: marginOf(s), goal: s.goal, ordersFloorPct: s.ordersFloorPct,
    allowedOffers: s.allowedOffers, maxDiscountInr: s.maxDiscountInr, overrides,
  };
}

export type DerivedInput = {
  settings: Settings; approved: boolean; approvedSettings: Settings | null; overrides: Partial<Record<GroupId, OfferId>>; killed: boolean;
};

export function derive(m: Model, st: DerivedInput) {
  const g = m.groups;
  const margin = marginOf(st.settings);
  const draft = buildPlan(g, toPlanSettings(st.settings));
  const range = planRange(g, draft, m.pool.p25, m.pool.p75);
  const a10 = alpha10(g, 0.4);
  const a10AtMargin = alpha10(g, margin);
  const allCodes = codesEconomics(g, () => true, 0.4);
  const so = storeOrders(g);
  const gmv = g.reduce((a, x) => a + x.checkouts * x.baseConversion * x.aovInr, 0) + allCodes.extraSales;
  const store = {
    checkouts: g.reduce((a, x) => a + x.checkouts, 0), orders: so.today, gmv, aov: gmv / so.today,
    discounts: allCodes.spend, discountShare: allCodes.spend / gmv, conversion: so.today / g.reduce((a, x) => a + x.checkouts, 0),
  };
  const rule = ruleFirstOrderOnly(g, margin);

  const live: PlanResult = buildPlan(g, toPlanSettings(st.approvedSettings ?? DEFAULT_USER_SETTINGS, st.overrides));
  const liveOffers: Record<GroupId, OfferId> = st.killed
    ? (Object.fromEntries(GROUP_IDS.map((x) => [x, 'none'])) as Record<GroupId, OfferId>)
    : offerMap(live);

  // Pilot data was generated for the default plan (fixtures/pilot_truth.json). Results always measure that plan.
  const pilotOffers = PILOT_TRUTH.planOffers;
  const day20 = measure(g, pilotOffers, m.pilot20Counts, 20);
  const day60 = measure(g, pilotOffers, countsFromFormula(g, pilotOffers, PILOT_TRUTH.actualLiftPp, 60), 60);
  const defaultPlan = buildPlan(g);
  const snapExtras = (s: Snapshot) => ({
    budgetPace: (defaultPlan.spend * s.days) / 30,
    alpha10SamePeriod: (a10.profit * s.days) / 30,
    returningNotGiven: ((a10.rows.find((r) => r.group === 'returning')?.spend ?? 0) * s.days) / 30,
    fee: feeBasis(s),
    nearBreakEven: nearBreakEven(s.rows, breakEven(0.4)),
    weekly: { spend: (s.spend * 7) / s.days, extraSales: (s.extraSales * 7) / s.days, extraOrders: (s.extraOrders * 7) / s.days, profit: (s.profit * 7) / s.days },
  });

  return {
    margin, breakEven: breakEven(margin), draft, range, a10, a10AtMargin, allCodes, store, storeOrders: so, rule,
    live, liveOffers, defaultPlan,
    snapshots: { day20: { ...day20, ...snapExtras(day20) }, day60: { ...day60, ...snapExtras(day60) } },
    creators: creatorReport(g, m.creators),
    approvedDiffersFromPilot: GROUP_IDS.some((x) => offerMap(live)[x] !== pilotOffers[x]),
  };
}

export type Derived = ReturnType<typeof derive>;
