/** Pure derivation of every on-screen number from the model + user inputs (no hard-coded figures). */
import { AFTER_DELIVERY, PILOT_TRUTH, PROFILE } from '../data/fixtures';
import { pilotCountsFromSessions } from '../data/aggregate';
import { DEMO_DATES, PILOT_START, fmtDate, pilotDayDate, toUnix, type Moment } from '../lib/dates';
import { buildReview, type WeeklyReview } from '../engine/review';
import { inr } from '../lib/format';
import { couponSignals, eligibility } from '../engine/opportunities';
import { pilotDecision, strategies, type Alert } from '../engine/lifecycle';
import { proposeExperiments } from '../engine/experiments';
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
  moment?: Moment; creatorFix?: 'pending' | 'limited' | 'kept';
};

export const SNAP_DAYS = { day7: 7, day14: 14, day20: 20, day30: 30, day60: 60 } as const;

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
  const start = toUnix(PILOT_START);
  // Days 7 and 14 come from the generated sessions cut at that day; day 20 is the full generated pilot; later days use the count formulas.
  const snapAt = (d: number): Snapshot => (d === 20 ? measure(g, pilotOffers, m.pilot20Counts, 20)
    : d < 20 ? measure(g, pilotOffers, pilotCountsFromSessions(m.pilotSessions.filter((x) => x.created_at < start + d * 86400)), d)
    : measure(g, pilotOffers, countsFromFormula(g, pilotOffers, PILOT_TRUTH.actualLiftPp, d), d));
  const day7 = snapAt(7), day14 = snapAt(14), day20 = snapAt(20), day30 = snapAt(30), day60 = snapAt(60);
  const defaultPlan = buildPlan(g);
  const snapExtras = (s: Snapshot) => ({
    budgetPace: (defaultPlan.spend * s.days) / 30,
    alpha10SamePeriod: (a10.profit * s.days) / 30,
    returningNotGiven: ((a10.rows.find((r) => r.group === 'returning')?.spend ?? 0) * s.days) / 30,
    fee: feeBasis(s),
    nearBreakEven: nearBreakEven(s.rows, breakEven(0.4)),
    weekly: { spend: (s.spend * 7) / s.days, extraSales: (s.extraSales * 7) / s.days, extraOrders: (s.extraOrders * 7) / s.days, profit: (s.profit * 7) / s.days },
  });

  const creators = creatorReport(g, m.creators);
  const leak = creators.rows.find((r) => r.flag) ?? null;
  const moment = st.moment ?? 'before';
  const label = (id: GroupId) => g.find((x) => x.id === id)!.label.replace('from Instagram/Meta ads', 'ads').replace('from a creator link (no code typed)', 'creator link').replace('cart ', '');
  const drop = PROFILE.upcomingDrop;

  // Weekly reviews: every Monday 06:00 from week 1 (28 Sep) while the plan is live.
  const weeksDone = !st.approved || moment === 'before' ? 0 : moment === 'day20' ? 2 : 4;
  const reviewSettings = toPlanSettings(st.approvedSettings ?? DEFAULT_USER_SETTINGS);
  const reviews: WeeklyReview[] = Array.from({ length: weeksDone }, (_, i) => {
    const week = i + 1;
    const date = pilotDayDate(week * 7 + 1);
    const launchGap = (toUnix(drop.launch) - toUnix(date)) / 86400;
    return buildReview({
      week, date, snap: snapAt(week * 7), groups: g, liveOffers: pilotOffers, settings: reviewSettings, margin: 0.4,
      budget: (st.approvedSettings ?? DEFAULT_USER_SETTINGS).budget,
      creatorLeak: leak ? { code: leak.code, share: leak.returningSharePct / 100, monthly: leak.discountToReturning } : null,
      creatorFixed: (st.creatorFix ?? 'pending') !== 'pending',
      festive: launchGap >= 0 && launchGap <= 7 ? { name: drop.name, launch: fmtDate(drop.launch, false), styles: drop.styles, days: drop.fullPriceDays } : null,
      label,
    });
  }).reverse();
  const nextReview = st.approved && moment !== 'before' ? pilotDayDate((weeksDone + 1) * 7 + 1) : null;

  const snapshots = {
    day7: { ...day7, ...snapExtras(day7) }, day14: { ...day14, ...snapExtras(day14) }, day20: { ...day20, ...snapExtras(day20) },
    day30: { ...day30, ...snapExtras(day30) }, day60: { ...day60, ...snapExtras(day60) },
  };
  const be40 = breakEven(0.4);
  const pilot = pilotDecision(day30, be40);
  const daysLeft = moment === 'day20' ? 10 : moment === 'day30' ? 0 : 30;

  // Prompts that bring the merchant back (notification bell, Ray, Agent Studio).
  const alerts: Alert[] = [];
  if (!st.approved) {
    alerts.push({ id: 'opp-alpha10', tone: 'warn', title: `ALPHA10 lost ${inr(Math.abs(a10.profit))} last month`, detail: `Return ${a10.ret.toFixed(2)}x vs break-even ${be40.toFixed(2)}x. Smart Offers could make about +${inr(defaultPlan.profit)} a month instead.`, to: '/offers/smart' });
    if (leak) alerts.push({ id: 'opp-creator', tone: 'warn', title: `${leak.code} is leaking to returning buyers`, detail: `${leak.returningUses} of ${leak.uses} uses were by returning buyers.`, ask: 'Are creator codes leaking?' });
  } else if (st.killed) {
    alerts.push({ id: `paused-${moment}`, tone: 'warn', title: 'Smart Offers is paused', detail: st.approved ? 'Every group sees no offer. Resume any time from Agent Studio.' : '', to: '/studio/smart-offers' });
  } else if (moment !== 'before') {
    if (reviews[0]) alerts.push({ id: `review-${reviews[0].id}`, tone: 'info', title: `Week ${reviews[0].week} review is ready`, detail: `${reviews[0].items.length} items, ${reviews[0].changes} need your approval.`, to: '/studio/smart-offers?tab=reviews' });
    const nb = snapshots.day20.nearBreakEven[0];
    if (nb) alerts.push({ id: `nearbe-${nb.group}`, tone: 'warn', title: `${label(nb.group)} is near break-even`, detail: `Return ${nb.ret.toFixed(2)}x vs ${be40.toFixed(2)}x. Auto step-down after 7 days below.`, to: '/offers/smart' });
    const proj = (day20.spend * 30) / 20;
    const budget = (st.approvedSettings ?? DEFAULT_USER_SETTINGS).budget;
    if (proj >= budget * 0.8) alerts.push({ id: 'budget-80', tone: 'warn', title: `Budget: ${Math.round((proj / budget) * 100)}% projected this month`, detail: `On pace for ${inr(proj)} of ${inr(budget)}. The hard stop protects you; raise or keep it.`, to: '/offers/smart?tab=plan' });
    if (moment === 'day20') alerts.push({ id: 'festive', tone: 'info', title: `${drop.name} starts ${fmtDate(drop.launch, false)}`, detail: `Offers pause on ${drop.styles} styles for ${drop.fullPriceDays} days, as you set.`, to: '/studio/smart-offers?tab=guardrails' });
    if (moment === 'day20') alerts.push({ id: 'pilot-10', tone: 'info', title: 'Free pilot ends 20 Oct (10 days left)', detail: 'You will see proven results and the fee before deciding.', to: '/offers/smart' });
    if (moment === 'day30') alerts.push({ id: 'pilot-decision', tone: 'good', title: 'Pilot day 30: decide whether to keep Smart Offers', detail: `Expected +${inr(pilot.expectedProfitMonth)} a month; fee about ${inr(pilot.fee.fee)}.`, to: '/offers/smart' });
  }

  return {
    margin, breakEven: breakEven(margin), draft, range, a10, a10AtMargin, allCodes, store, storeOrders: so, rule,
    live, liveOffers, defaultPlan,
    snapshots,
    reviews, nextReview, alerts, pilot, daysLeft,
    signals: couponSignals(a10, be40, leak ? { code: leak.code, share: leak.returningSharePct / 100 } : null),
    eligibility: eligibility({ magicCheckout: true, checkouts: store.checkouts, alwaysOnCoupon: a10.spend > 0, poolSize: m.pool.size }),
    strategies: strategies(a10AtMargin.profit, rule.profit, draft.profit),
    experiments: proposeExperiments({ ordersPerMonth: so.today, codShare: PROFILE.codSharePct / 100, rtoRate: AFTER_DELIVERY.rtoRateOfCod, checkoutsPerMonth: store.checkouts, creatorLeakCode: leak?.code ?? null }),
    holdoutCostMonth: draft.profit / 9,
    pilotEndDate: DEMO_DATES.day30,
    creators,
    approvedDiffersFromPilot: GROUP_IDS.some((x) => offerMap(live)[x] !== pilotOffers[x]),
  };
}

export type Derived = ReturnType<typeof derive>;
