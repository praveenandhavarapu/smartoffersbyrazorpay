/** Pure derivation of every on-screen number from the model + user inputs (no hard-coded figures). */
import { AFTER_DELIVERY, PILOT_TRUTH, PROFILE } from '../data/fixtures';
import { pilotCountsFromSessions } from '../data/aggregate';
import { pilotCounts } from '../data/generator/alpha';
import { DEMO_DATES, MOMENT_DAY, PILOT_START, addDays, fmtDate, pilotDayDate, toUnix, type Moment } from '../lib/dates';
import { buildReview, type WeeklyReview } from '../engine/review';
import { inr } from '../lib/format';
import { couponSignals, eligibility } from '../engine/opportunities';
import { pilotDecision, strategies as strategiesV1, type Alert } from '../engine/lifecycle';
import { proposeExperiments } from '../engine/experiments';
import { GROUP_IDS, type GroupId, type OfferId } from '../data/types';
import { breakEven } from '../engine/economics';
import { buildPlan, offerMap, planRange, storeOrders, type PlanResult, type PlanSettings } from '../engine/plan';
import { alpha10, codesEconomics, ruleFirstOrderOnly } from '../engine/scenarios';
import { countsFromFormula, feeBasis, measure, type ArmCounts, type Snapshot } from '../engine/measure';
import { creatorReport } from '../engine/creators';
import { nearBreakEven } from '../engine/guardrails';
import { compareStrategies, profitOverRatio } from '../engine/compare';
import { costPerExtraOrder, dayMetrics, earnedPerExtraOrder, keptRate, leakedRupees } from '../engine/net';
import { FEATURES } from '../config/features';
import { GOAL_LABEL, groupLabel, offerLabel } from '../lib/labels';
import { buildLearning, type LearningModel } from '../engine/learning';
import { withPlaybookPriors } from '../engine/recommend';
import { getStoreBenchmark } from '../data/network/peers';
import type { ReviewItem } from '../engine/review';
import type { Model } from './model';
import { DEFAULT_USER_SETTINGS, draftSettingsOf, marginOf, type Settings } from './store';

/** extraAllowed = offer variants promoted by the learning loop (approved by the merchant). */
export function toPlanSettings(s: Settings, overrides?: Partial<Record<GroupId, OfferId>>, extraAllowed: OfferId[] = []): Partial<PlanSettings> {
  return {
    budget: s.budget, margin: marginOf(s), keptRate: keptRate(), goal: s.goal, ordersFloorPct: s.ordersFloorPct,
    allowedOffers: [...s.allowedOffers, ...extraAllowed.filter((o) => !s.allowedOffers.includes(o))], maxDiscountInr: s.maxDiscountInr, overrides,
    ...(s.minReturn ? { floorReturn: s.minReturn } : {}), growth: s.growth ?? null,
  };
}

export type DerivedInput = {
  settings: Settings; approved: boolean; approvedSettings: Settings | null; overrides: Partial<Record<GroupId, OfferId>>; killed: boolean;
  moment?: Moment; creatorFix?: 'pending' | 'limited' | 'kept'; creatorFixDate?: string | null;
  experimentSpace?: boolean; learningDecisions?: Record<string, 'approved' | 'declined'>; undone?: string[];
  learningDecidedOn?: Record<string, number>;
};

/** Learning-loop items for a weekly review (the events that happen on that Monday). */
function learningItems(L: LearningModel, reviewDay: number, week: number): ReviewItem[] {
  return L.events.filter((e) => e.day === reviewDay).flatMap((e): ReviewItem[] => {
    const id = `w${week}-${e.id}`;
    if (e.type === 'challenger_started') return [{ id, kind: 'experiment', group: e.group, title: 'Started a challenger test (no approval needed)', detail: `${e.summary.replace(/^Week \d+ review: /, '')}. Undo any time in the Activity log.` }];
    if (e.type === 'playbook_suggestion' || e.type === 'promotion_proposed') return [{ id, kind: 'experiment', group: e.group, title: e.type === 'promotion_proposed' ? `Promote ₹150 off for ${e.group ? groupLabel(e.group) : 'this group'}` : `Playbook suggestion: Free shipping on ₹999+ for ${e.group ? groupLabel(e.group) : 'this group'}`, detail: `${e.detail ?? e.summary.replace(/^Week \d+ review: /, '')}${e.impactInr !== undefined ? ` About ${e.impactInr >= 0 ? '+' : '−'}${inr(Math.abs(e.impactInr))} a month after returns.` : ''}`, action: { type: 'learning', key: e.key! } }];
    if (e.type === 'early_read') return [{ id, kind: 'experiment', group: e.group, title: 'Early read on the organic challenger', detail: e.summary.replace(/^Week \d+ review: /, '') }];
    return [];
  });
}

export const SNAP_DAYS = { day7: 7, day14: 14, day20: 20, day30: 30, day60: 60 } as const;
export type SnapKey = keyof typeof SNAP_DAYS;

/** The demo day "today" for each moment (null before go-live). */
export const NOW_DAY: Record<Moment, number> = MOMENT_DAY;
export const todaySnap = (m: Moment): SnapKey | null => (m === 'day20' ? 'day20' : m === 'day30' ? 'day30' : m === 'day60' ? 'day60' : null);

/** Human diff between two settings objects ("Budget ₹1,00,000 → ₹50,000"). */
export function settingsDiff(a: Settings, b: Settings): string[] {
  const out: string[] = [];
  if (a.budget !== b.budget) out.push(`Budget ${inr(a.budget)} → ${inr(b.budget)}`);
  if (a.keepPer1000 !== b.keepPer1000) out.push(`What you keep from ₹1,000 ${inr(a.keepPer1000)} → ${inr(b.keepPer1000)}`);
  if (a.goal !== b.goal) out.push(`Goal ${GOAL_LABEL[a.goal]} → ${GOAL_LABEL[b.goal]}`);
  if (a.goal === 'orders_steady' && b.goal === 'orders_steady' && a.ordersFloorPct !== b.ordersFloorPct) out.push(`Orders may fall at most ${a.ordersFloorPct}% → ${b.ordersFloorPct}%`);
  const added = b.allowedOffers.filter((o) => !a.allowedOffers.includes(o)), removed = a.allowedOffers.filter((o) => !b.allowedOffers.includes(o));
  if (added.length) out.push(`Offer menu + ${added.map(offerLabel).join(', ')}`);
  if (removed.length) out.push(`Offer menu − ${removed.map(offerLabel).join(', ')}`);
  if (a.festiveWindow !== b.festiveWindow) out.push(`No offers on the festive drop: ${a.festiveWindow ? 'on' : 'off'} → ${b.festiveWindow ? 'on' : 'off'}`);
  if (a.maxDiscountInr !== b.maxDiscountInr) out.push(`Max discount ${inr(a.maxDiscountInr)} → ${inr(b.maxDiscountInr)}`);
  if ((a.minReturn ?? null) !== (b.minReturn ?? null)) out.push(`Minimum return ${a.minReturn ? `${a.minReturn}x` : 'break-even'} → ${b.minReturn ? `${b.minReturn}x` : 'break-even'}`);
  const gl = (x: Settings) => (x.growth ? `give up up to ${inr(x.growth.giveUpInr)} for more ${x.growth.metric === 'orders' ? 'orders' : 'new customers'}` : 'none');
  if (gl(a) !== gl(b)) out.push(`Growth trade-off ${gl(a)} → ${gl(b)}`);
  return out;
}

/** Plan rows whose offer changes ("Big carts ₹200 off → No offer"). */
export function planDiff(from: PlanResult, to: PlanResult): string[] {
  return to.rows.filter((r) => from.rows.find((x) => x.group === r.group)?.offer !== r.offer)
    .map((r) => `${groupLabel(r.group)}: ${offerLabel(from.rows.find((x) => x.group === r.group)!.offer)} → ${offerLabel(r.offer)}`);
}

/** The proof sentence for a day (v2 §5.6): early days prove orders, not profit; day 60 names proven groups. */
export function proofText(s: Snapshot, be: number): string {
  const offerRows = s.rows.filter((r) => r.offer !== 'none');
  if (s.extraOrdersLow <= 0) return 'Not proven yet: the range of extra orders still includes zero. Normal in the first two weeks.';
  if (s.days >= 60) {
    const proven = offerRows.filter((r) => !r.stillLearning).map((r) => groupLabel(r.group));
    const learning = offerRows.filter((r) => r.stillLearning).map((r) => groupLabel(r.group));
    return `${s.retLow >= be ? 'Profitable even at the low end of the range.' : 'Extra orders proven; profit likely.'} Proven groups: ${proven.join(', ') || 'none yet'}.${learning.length ? ` Still learning: ${learning.join(', ')}.` : ''}`;
  }
  if (s.retLow >= be) return 'Profitable even at the low end of the range.';
  if (s.days >= 30) return 'Extra orders proven; profit is likely but its range still dips below break-even. Clearer by day 60.';
  return 'Extra orders proven, profit not yet: the return\'s range still dips below break-even.';
}

export function derive(m: Model, st: DerivedInput) {
  const g = m.groups;
  const v2 = FEATURES.netReturns;
  const kept = keptRate();
  // Live = approved settings (defaults before the first approval). Draft = the edit buffer.
  const liveSettings = st.approvedSettings ?? DEFAULT_USER_SETTINGS;
  const draftSettings = st.settings;
  const hasDraft = Boolean(draftSettingsOf(st));
  const margin = v2 ? marginOf(liveSettings) : marginOf(st.settings);
  const draftMargin = marginOf(draftSettings);
  const v1Margin = PROFILE.marginPct / 100; // v1 measured ALPHA10 and the pilot at the profile margin
  const moment0 = st.moment ?? 'before';
  const learning = FEATURES.experiments ? buildLearning(g, {
    approved: st.approved, experimentSpace: st.experimentSpace ?? true, festiveWindow: liveSettings.festiveWindow,
    decisions: st.learningDecisions ?? {}, undone: st.undone ?? [], nowDay: NOW_DAY[moment0],
    decidedOn: st.learningDecidedOn ?? {}, paymentAware: FEATURES.paymentAware,
  }, marginOf(liveSettings), kept, groupLabel) : null;
  const promoted = learning?.promotedOffers ?? [];
  // Playbook priors for offers not on the menu yet (used only when the merchant adds one); measured priors win.
  const planGroups = withPlaybookPriors(learning?.groupsV2 ?? g);
  const draft = buildPlan(planGroups, toPlanSettings(draftSettings, undefined, promoted));
  const range = planRange(planGroups, draft, m.pool.p25, m.pool.p75);
  const a10 = alpha10(g, v2 ? margin : v1Margin, kept);
  const a10AtMargin = alpha10(g, draftMargin, kept);
  const allCodes = codesEconomics(g, () => true, v2 ? margin : v1Margin, kept);
  const so = storeOrders(g);
  const gmv = g.reduce((a, x) => a + x.checkouts * x.baseConversion * x.aovInr, 0) + allCodes.extraSales;
  const store = {
    checkouts: g.reduce((a, x) => a + x.checkouts, 0), orders: so.today, gmv, aov: gmv / so.today,
    discounts: allCodes.spend, discountShare: allCodes.spend / gmv, conversion: so.today / g.reduce((a, x) => a + x.checkouts, 0),
  };
  const rule = ruleFirstOrderOnly(g, v2 ? margin : draftMargin, 0.9, kept);
  // ALPHA10's discount that went to buyers who would have bought anyway (spend × base rate ÷ rate with the code).
  const a10Leaked = g.reduce((acc, x) => acc + x.today.filter((u) => u.code === 'ALPHA10').reduce((t, u) => {
    const n = x.checkouts * u.share, withCode = x.baseConversion + u.liftPp / 100;
    return t + leakedRupees(n * withCode * u.discountInr, x.baseConversion, withCode);
  }, 0), 0);

  const live: PlanResult = buildPlan(planGroups, toPlanSettings(liveSettings, st.overrides, promoted));
  const liveRange = planRange(planGroups, live, m.pool.p25, m.pool.p75);
  const liveOffers: Record<GroupId, OfferId> = st.killed
    ? (Object.fromEntries(GROUP_IDS.map((x) => [x, 'none'])) as Record<GroupId, OfferId>)
    : offerMap(live);

  // Pilot data was generated for the default plan (fixtures/pilot_truth.json). Results always measure that plan.
  const pilotOffers = PILOT_TRUTH.planOffers;
  const start = toUnix(PILOT_START);
  const be = v2 ? breakEven(margin) : breakEven(v1Margin);
  const measureMargin = v2 ? margin : v1Margin;
  /**
   * Days 7 and 14 come from the generated sessions cut at that day; day 20 is the full generated pilot; later days use the count formulas.
   * v2: no-offer control groups (A/A checks) use the expected counts on every day, so treated vs holdout differ only by rounding.
   */
  const controlFix = (counts: Record<GroupId, ArmCounts>, d: number): Record<GroupId, ArmCounts> => {
    if (!v2) return counts;
    const out = { ...counts };
    for (const x of g) if (pilotOffers[x.id] === 'none') out[x.id] = pilotCounts(x, 'none', 0, d);
    return out;
  };
  const snapAt = (d: number): Snapshot => (d === 20 ? measure(g, pilotOffers, controlFix(m.pilot20Counts, 20), 20, measureMargin, kept)
    : d < 20 ? measure(g, pilotOffers, controlFix(pilotCountsFromSessions(m.pilotSessions.filter((x) => x.created_at < start + d * 86400)), d), d, measureMargin, kept)
    : learning ? (() => { const c = learning.countsAt(d); return measure(learning.withCost, learning.offersOn(d), c.counts, d, measureMargin, kept, c.cost); })()
    : measure(g, pilotOffers, countsFromFormula(g, pilotOffers, PILOT_TRUTH.actualLiftPp, d), d, measureMargin, kept));
  const day7 = snapAt(7), day14 = snapAt(14), day20 = snapAt(20), day30 = snapAt(30), day60 = snapAt(60);
  const defaultPlan = buildPlan(g, toPlanSettings(DEFAULT_USER_SETTINGS));
  const earnedPerOrder = earnedPerExtraOrder(store.aov, margin, kept);
  const snapExtras = (s: Snapshot) => ({
    budgetPace: (defaultPlan.spend * s.days) / 30,
    alpha10SamePeriod: (a10.profit * s.days) / 30,
    returningNotGiven: ((a10.rows.find((r) => r.group === 'returning')?.spend ?? 0) * s.days) / 30,
    fee: feeBasis(s),
    nearBreakEven: nearBreakEven(s.rows, be),
    weekly: { spend: (s.spend * 7) / s.days, extraSales: (s.extraSales * 7) / s.days, extraOrders: (s.extraOrders * 7) / s.days, profit: (s.profit * 7) / s.days },
    metrics: dayMetrics(s, store.aov, margin, kept),
    proof: proofText(s, be),
  });

  const creators = creatorReport(g, m.creators, v2 ? margin * kept : 0.4);
  const leak = creators.rows.find((r) => r.flag) ?? null;
  const moment = st.moment ?? 'before';
  const label = (id: GroupId) => g.find((x) => x.id === id)!.label.replace('from Instagram/Meta ads', 'ads').replace('from a creator link (no code typed)', 'creator link').replace('cart ', '');
  const drop = PROFILE.upcomingDrop;
  const dropEnd = addDays(drop.launch, drop.fullPriceDays - 1);

  // Weekly reviews: every Monday 06:00 from week 1 (28 Sep) while the plan is live.
  const weeksDone = !st.approved || moment === 'before' ? 0 : moment === 'day20' ? 2 : 4;
  const reviews: WeeklyReview[] = Array.from({ length: weeksDone }, (_, i) => {
    const week = i + 1;
    const reviewDay = week * 7 + 1;
    const date = pilotDayDate(reviewDay);
    const launchGap = (toUnix(drop.launch) - toUnix(date)) / 86400;
    const promotedThen = learning ? promoted.filter(() => reviewDay > 22) : [];
    const r = buildReview({
      week, date, snap: snapAt(week * 7), groups: planGroups, liveOffers: learning ? learning.offersOn(week * 7) : pilotOffers, settings: toPlanSettings(liveSettings, undefined, promotedThen), margin: v2 ? margin : v1Margin,
      budget: liveSettings.budget,
      creatorLeak: leak ? { code: leak.code, share: leak.returningSharePct / 100, monthly: leak.discountToReturning } : null,
      creatorFixed: (st.creatorFix ?? 'pending') !== 'pending',
      festive: launchGap >= 0 && launchGap <= 7 ? { name: drop.name, launch: fmtDate(drop.launch, false), styles: drop.styles, days: drop.fullPriceDays } : null,
      label,
    });
    if (!learning) return r;
    const items = [...r.items.slice(0, -1), ...learningItems(learning, reviewDay, week), ...r.items.slice(-1)];
    return { ...r, items, changes: items.filter((x) => x.action).length };
  }).reverse();
  const nextReview = st.approved && moment !== 'before' ? pilotDayDate((weeksDone + 1) * 7 + 1) : null;

  const snapshots = {
    day7: { ...day7, ...snapExtras(day7) }, day14: { ...day14, ...snapExtras(day14) }, day20: { ...day20, ...snapExtras(day20) },
    day30: { ...day30, ...snapExtras(day30) }, day60: { ...day60, ...snapExtras(day60) },
  };
  const pilot = pilotDecision(day30, be);
  const daysLeft = moment === 'day20' ? 10 : moment === 'day30' || moment === 'day60' ? 0 : 30;
  const today = todaySnap(moment);

  // Prompts that bring the merchant back (notification bell, Ray, Agent Studio).
  const alerts: Alert[] = [];
  const creatorDecided = (st.creatorFix ?? 'pending') !== 'pending';
  if (!st.approved) {
    alerts.push({ id: 'opp-alpha10', tone: 'warn', title: `ALPHA10 lost ${inr(Math.abs(a10.profit))} last month`, detail: `Return${v2 ? ' after returns' : ''} ${a10.ret.toFixed(2)}x vs break-even ${be.toFixed(2)}x. Smart Offers could make about +${inr(defaultPlan.profit)} a month instead.`, to: '/offers/smart' });
    if (leak && !(v2 && creatorDecided)) alerts.push({ id: 'opp-creator', tone: 'warn', title: `${leak.code} is leaking to returning buyers`, detail: `${leak.returningUses} of ${leak.uses} uses were by returning buyers.`, ask: 'Are creator codes leaking?' });
  } else if (st.killed) {
    alerts.push({ id: `paused-${moment}`, tone: 'warn', title: 'Smart Offers is paused', detail: st.approved ? 'Every group sees no offer. Resume any time from Agent Studio.' : '', to: '/studio/smart-offers' });
  } else if (moment !== 'before') {
    if (reviews[0]) alerts.push({ id: `review-${reviews[0].id}`, tone: 'info', title: `Week ${reviews[0].week} review is ready`, detail: `${reviews[0].items.length} items, ${reviews[0].changes} need your approval.`, to: '/studio/smart-offers?tab=reviews' });
    const todaySnapshot = snapshots[today ?? 'day20'];
    const nb = todaySnapshot.nearBreakEven[0];
    if (nb) alerts.push({ id: `nearbe-${nb.group}`, tone: 'warn', title: `${label(nb.group)} is near break-even`, detail: `Return${v2 ? ' after returns' : ''} ${nb.ret.toFixed(2)}x vs ${be.toFixed(2)}x. Auto step-down after 7 days below.`, to: '/offers/smart' });
    const proj = (todaySnapshot.spend * 30) / todaySnapshot.days;
    const budget = liveSettings.budget;
    if (proj >= budget * 0.8) alerts.push({ id: 'budget-80', tone: 'warn', title: `Budget: ${Math.round((proj / budget) * 100)}% projected this month`, detail: `On pace for ${inr(proj)} of ${inr(budget)}. The hard stop protects you; raise or keep it.`, to: '/offers/smart?tab=plan' });
    const nowDate = DEMO_DATES[moment];
    if (liveSettings.festiveWindow && nowDate <= dropEnd) alerts.push({ id: nowDate < drop.launch ? 'festive' : 'festive-on', tone: 'info', title: nowDate < drop.launch ? `${drop.name} starts ${fmtDate(drop.launch, false)}` : `${drop.name} is on until ${fmtDate(dropEnd, false)}`, detail: `Offers pause on ${drop.styles} styles for ${drop.fullPriceDays} days, as you set.`, to: '/studio/smart-offers?tab=guardrails' });
    if (moment === 'day20') alerts.push({ id: 'pilot-10', tone: 'info', title: `Free pilot ends ${fmtDate(DEMO_DATES.day30, false)} (${daysLeft} days left)`, detail: 'You will see proven results and the fee before deciding.', to: '/offers/smart' });
    if (moment === 'day30') alerts.push({ id: 'pilot-decision', tone: 'good', title: 'Pilot day 30: decide whether to keep Smart Offers', detail: `Expected +${inr(pilot.expectedProfitMonth)} a month; fee about ${inr(pilot.fee.fee)}.`, to: '/offers/smart' });
  }

  const comparison = compareStrategies(g, approvedOrDraft(st) === 'live' ? live : draft);
  const draftComparison = compareStrategies(g, draft);

  return {
    margin, breakEven: be, kept, draftMargin, draftBreakEven: breakEven(draftMargin), liveSettings, hasDraft,
    draftDiff: hasDraft && st.approvedSettings ? [...settingsDiff(st.approvedSettings, draftSettings), ...planDiff(live, draft)] : [],
    draft, range, liveRange, a10, a10AtMargin, allCodes, store, storeOrders: so, rule,
    a10CostPerOrder: costPerExtraOrder(a10.spend, a10.extraOrders), earnedPerOrder, a10Leaked,
    live, liveOffers, defaultPlan,
    snapshots, today, nowDay: NOW_DAY[moment],
    reviews, nextReview, alerts, pilot, daysLeft,
    signals: couponSignals(a10, be, leak ? { code: leak.code, share: leak.returningSharePct / 100 } : null),
    eligibility: eligibility({ magicCheckout: true, checkouts: store.checkouts, alwaysOnCoupon: a10.spend > 0, poolSize: m.pool.size }),
    strategies: v2 ? comparison.rows : strategiesV1(a10AtMargin.profit, rule.profit, draft.profit),
    comparison, draftComparison,
    profitOverRatio: profitOverRatio(g, approvedOrDraft(st) === 'live' ? live : draft),
    draftProfitOverRatio: profitOverRatio(g, draft),
    experiments: proposeExperiments({ ordersPerMonth: so.today, codShare: PROFILE.codSharePct / 100, rtoRate: AFTER_DELIVERY.rtoRateOfCod, checkoutsPerMonth: store.checkouts, creatorLeakCode: leak?.code ?? null }),
    holdoutCostMonth: draft.profit / 9,
    holdoutCostMonthLive: live.profit / 9,
    pilotEndDate: DEMO_DATES.day30,
    festive: { ...drop, end: dropEnd },
    creators,
    creatorFixDate: st.creatorFixDate ?? null,
    approvedDiffersFromPilot: GROUP_IDS.some((x) => offerMap(live)[x] !== (learning ? learning.offersOn(Math.max(NOW_DAY[moment0], 1)) : pilotOffers)[x]),
    learning,
    /** v3: the groups and promoted offers every plan uses (Ray scenarios included), and benchmarks for this store's size. */
    planGroups, promoted,
    planSettingsFor: (x: Settings, overrides?: Partial<Record<GroupId, OfferId>>) => toPlanSettings(x, overrides, promoted),
    benchmark: getStoreBenchmark(gmv),
  };
}

/** Decisions waiting on the merchant across all reviews, one per underlying action (the creator fix appears weekly). */
export function pendingActions(reviews: WeeklyReview[], decisions: Record<string, string>): ReviewItem[] {
  const seen = new Set<string>();
  const out: ReviewItem[] = [];
  for (const r of [...reviews].reverse()) for (const i of r.items) {
    if (!i.action || decisions[i.id]) continue;
    const key = i.action.type === 'creator' ? 'creator' : i.action.type === 'learning' ? `l:${i.action.key}` : `o:${i.action.group}:${i.action.offer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

/** Which plan "Why AI" describes: the live one once approved, else the draft. */
const approvedOrDraft = (st: DerivedInput): 'live' | 'draft' => (st.approved ? 'live' : 'draft');

export type Derived = ReturnType<typeof derive>;
