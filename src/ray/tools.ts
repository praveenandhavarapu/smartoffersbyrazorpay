/**
 * Ray's tools: the ONLY way Ray touches data. Read-only, or draft-only (UI needs Approve).
 * Privacy: peer data only via network/peers.ts aggregates; no merchant names, ids or single values.
 */
import { getPeerBenchmark } from '../data/network/peers';
import { ALL_OFFER_IDS, GROUP_IDS, type Goal, type GroupId, type OfferId } from '../data/types';
import { OFFER_BY_ID } from '../data/fixtures';
import { roundHalfEven } from '../lib/format';
import { buildPlan, planRange, type PlanResult } from '../engine/plan';
import { overrideCost, simulate } from '../engine/scenarios';
import { explainGroup } from '../engine/explain';
import { buildCheckoutTable, decide, SAMPLE_SHOPPERS, type Shopper } from '../engine/checkoutTable';
import { MAX_DISCOUNT_PER_ORDER } from '../engine/guardrails';
import type { Model } from '../state/model';
import type { Derived } from '../state/derived';
import type { Settings } from '../state/store';
import type { ToolName } from './toolSchemas';
import { dailySeries, lastDays, paymentSummary, settlementSummary, unsettledBalance, inRange, type InstantSettlement, type LedgerView } from '../data/ledgerQueries';
import { fmtDate } from '../lib/dates';
import { accuracyRows, accuracySummary } from '../engine/accuracy';
import { costPerExtraOrder, earnedPerExtraOrder, RETURN_LABEL } from '../engine/net';
import { SNAP_DAYS, planDiff, settingsDiff, type SnapKey } from '../state/derived';
import { engineSnapshot } from './snapshot';
import { INPUT_KEYS, INPUT_LABEL, type InputKey, type InputSource } from '../state/store';
import { inputValue, pendingInputs, typicalPatch } from '../state/inputs';
import { exploreBudget, growthFrontier, marginSqueeze, newCustomers, pointWithin } from '../engine/tradeoffs';
import { recommendOffers } from '../engine/recommend';
import { groupLabel, offerLabel, GOAL_LABEL } from '../lib/labels';
import type { GrowthMetric } from '../engine/plan';

/** Scenario arguments Ray (Live or Demo) may pass: any input, extra offers, per-group overrides, a growth trade-off. */
export type ScenarioArgs = {
  budget?: number; margin_pct?: number; keep_per_1000?: number; goal?: Goal; orders_floor_pct?: number; floor_return?: number;
  allowed_offers?: OfferId[]; add_offers?: OfferId[]; remove_offers?: OfferId[]; max_discount_inr?: number;
  overrides?: Partial<Record<GroupId, OfferId>>; growth_metric?: GrowthMetric; growth_give_up_inr?: number;
};

/** "margin 30% · budget ₹50,000 · Returning → ₹100 off" */
export function scenarioName(a: ScenarioArgs): string {
  const parts: string[] = [];
  const inr = (x: number) => `₹${Math.round(x).toLocaleString('en-IN')}`;
  if (a.keep_per_1000 !== undefined) parts.push(`keep ${inr(a.keep_per_1000)} of ₹1,000`);
  else if (a.margin_pct !== undefined) parts.push(`margin ${a.margin_pct}%`);
  if (a.budget !== undefined) parts.push(`budget ${inr(a.budget)}`);
  if (a.goal) parts.push(GOAL_LABEL[a.goal]);
  if (a.orders_floor_pct !== undefined) parts.push(`orders fall at most ${a.orders_floor_pct}%`);
  if (a.floor_return !== undefined) parts.push(`${a.floor_return}x minimum return`);
  if (a.allowed_offers) parts.push(`menu: ${a.allowed_offers.map(offerLabel).join(', ') || 'none'}`);
  if (a.add_offers?.length) parts.push(`+ ${a.add_offers.map(offerLabel).join(', ')}`);
  if (a.remove_offers?.length) parts.push(`− ${a.remove_offers.map(offerLabel).join(', ')}`);
  if (a.max_discount_inr !== undefined) parts.push(`max ${inr(a.max_discount_inr)} off`);
  for (const [g, o] of Object.entries(a.overrides ?? {}) as [GroupId, OfferId][]) parts.push(`${groupLabel(g)} → ${offerLabel(o)}`);
  if (a.growth_give_up_inr) parts.push(`give up ${inr(a.growth_give_up_inr)} for more ${a.growth_metric === 'orders' ? 'orders' : 'new customers'}`);
  return parts.join(' · ') || 'your current settings';
}

const rupees = (p: number) => roundHalfEven(p / 100);
const dateOf = (t: number) => fmtDate(new Date((t + 19800) * 1000).toISOString().slice(0, 10));
/** "19 Sep 2026" for one day, "13 Sep 2026 – 19 Sep 2026" for several. */
const win = (r: { from: number; to: number }) => { const a = dateOf(r.from), b = dateOf(r.to - 1); return a === b ? a : `${a} – ${b}`; };
const clampDays = (d: unknown) => (typeof d === 'number' && Number.isFinite(d) ? Math.min(183, Math.max(1, Math.round(d))) : 7);

export type RayCtx = {
  /** settings = the edit buffer (draft); live numbers come from derived (approved settings). */
  model: Model; derived: Derived; settings: Settings; approved: boolean; killed: boolean;
  /** v2: the day selected on Results (defaults to today) and decisions already taken on review items. */
  day?: SnapKey; reviewDecisions?: Record<string, string>;
  /** v3: inputs the merchant gave or accepted (before the first approval nothing is assumed). */
  confirmed?: Partial<Record<InputKey, InputSource>>;
  ledger: LedgerView; settlementMode: 't1' | 'instant'; instant: InstantSettlement[];
};

const M = (x: number) => roundHalfEven(x);
const R = (x: number) => roundHalfEven(x, 2);
const O = (x: number) => roundHalfEven(x, 1);
const label = (m: Model, g: GroupId) => m.groups.find((x) => x.id === g)?.label ?? g;

export const isGroupId = (x: unknown): x is GroupId => typeof x === 'string' && (GROUP_IDS as readonly string[]).includes(x);
export const isOfferId = (x: unknown): x is OfferId => typeof x === 'string' && (ALL_OFFER_IDS as readonly string[]).includes(x);

function planSummary(ctx: RayCtx, p: PlanResult) {
  const r = planRange(ctx.model.groups, p, ctx.model.pool.p25, ctx.model.pool.p75);
  const cpo = costPerExtraOrder(p.spend, p.extraOrders);
  return {
    return_basis: `${RETURN_LABEL}: ${roundHalfEven((p.settings.keptRate ?? 1) * 100)}% of extra sales kept after returns and failed COD`,
    cost_per_extra_order: cpo === null ? null : M(cpo), earned_per_extra_order: M(earnedPerExtraOrder(ctx.derived.store.aov, p.settings.margin, p.settings.keptRate ?? 1)),
    rows: p.rows.map((x) => ({ group: x.group, label: x.label, offer: x.offer, offer_label: OFFER_BY_ID[x.offer].label, spend: M(x.spend), extra_sales: M(x.extraSales), extra_orders: O(x.extraOrders), return_x: R(x.ret), profit: M(x.profit), overridden: x.overridden })),
    spend: M(p.spend), budget: p.settings.budget, extra_sales: M(p.extraSales), extra_orders: O(p.extraOrders), return_x: R(p.ret),
    return_range: [R(r.retLow), R(r.retHigh)], profit: M(p.profit), profit_range: [M(r.profitLow), M(r.profitHigh)],
    orders: M(p.orders), orders_change_pct: O(p.ordersChangePct), over_budget: p.overBudget,
    infeasible: p.infeasible ? { best_change_pct: O(p.infeasible.bestChangePct), best_any_budget_pct: O(p.infeasible.bestAnyBudgetPct), raise_budget_to: p.infeasible.raiseBudgetTo ?? null } : null,
    margin_pct: roundHalfEven(p.settings.margin * 100, 1), break_even_x: R(1 / p.settings.margin),
    new_customers_month: M(newCustomers(ctx.derived.planGroups, p)),
    min_return_x: p.settings.floorReturn !== undefined ? R(p.settings.floorReturn) : null,
  };
}

export type SettingsArgs = {
  budget?: number; keep_per_1000?: number; goal?: Goal; orders_floor_pct?: number; allowed_offers?: OfferId[]; add_offers?: OfferId[]; remove_offers?: OfferId[];
  max_discount_inr?: number; min_return?: number | null; festive_window?: boolean; growth_metric?: GrowthMetric; growth_give_up_inr?: number;
};

export type Draft =
  | { type: 'override'; group: GroupId; groupLabel: string; offer: OfferId; from: OfferId; spend: number; extraOrders: number; ret: number; profit: number;
      /** v2: change vs the group's current offer (spend saved, orders lost, profit change). */
      vsNow?: { spend: number; extraOrders: number; profit: number } }
  | { type: 'pause'; scope: 'all' | GroupId }
  | { type: 'resume' }
  | { type: 'settings'; patch: Partial<Settings>; summary: string };

export const tools = {
  get_payments_summary(ctx: RayCtx, a: { days?: number; end_days_ago?: number } = {}) {
    const days = clampDays(a.days);
    const r = lastDays(ctx.ledger, days, Math.min(182 - days, Math.max(0, Math.round(a.end_days_ago ?? 0))));
    const s = paymentSummary(ctx.ledger, r);
    return {
      window: win(r), days, today: dateOf(ctx.ledger.now),
      captured_payments: s.capturedCount, collected: rupees(s.collected), success_rate_pct: O(s.successRate * 100), failed_payments: s.failedCount,
      refunds: s.refundsCount, refunded: rupees(s.refunded), fees: rupees(s.fees), gst_on_fees: rupees(s.tax),
      method_mix: Object.fromEntries(Object.entries(s.byMethod).map(([k, v]) => [k, { count: v.count, amount: rupees(v.amount), share_pct: s.capturedCount ? O((v.count / s.capturedCount) * 100) : 0 }])),
      payments_with_smart_offer: s.smartOfferPayments,
      note: 'Online payments only; cash-on-delivery orders are not payments.',
    };
  },
  get_daily_payments(ctx: RayCtx, a: { days?: number } = {}) {
    const days = typeof a.days === 'number' && Number.isFinite(a.days) ? Math.min(60, Math.max(2, Math.round(a.days))) : 10;
    const s = dailySeries(ctx.ledger, days);
    const rows = s.map((d) => ({ date: dateOf(d.day * 86400), collected: rupees(d.collected), payments: d.count, failed: d.failed, refunded: rupees(d.refunded) }));
    const best = rows.reduce((m, r) => (r.collected > m.collected ? r : m), rows[0]);
    const worst = rows.reduce((m, r) => (r.collected < m.collected ? r : m), rows[0]);
    const half = Math.floor(rows.length / 2);
    const avg = (xs: typeof rows) => (xs.length ? xs.reduce((x, r) => x + r.collected, 0) / xs.length : 0);
    return {
      days, window: `${rows[0].date} – ${rows[rows.length - 1].date}`, daily: rows,
      total_collected: rows.reduce((x, r) => x + r.collected, 0), average_per_day: Math.round(avg(rows)),
      best_day: { date: best.date, collected: best.collected }, lowest_day: { date: worst.date, collected: worst.collected },
      second_half_vs_first_half_pct: half && avg(rows.slice(0, half)) ? O(((avg(rows.slice(half)) / avg(rows.slice(0, half))) - 1) * 100) : 0,
    };
  },
  list_payments(ctx: RayCtx, a: { status?: string; method?: string; limit?: number } = {}) {
    const n = Math.min(10, Math.max(1, Math.round(a.limit ?? 5)));
    const ps = ctx.ledger.payments.filter((p) => (!a.status || p.status === a.status) && (!a.method || p.method === a.method)).slice(-n).reverse();
    return { payments: ps.map((p) => ({ id: p.id, date: dateOf(p.created_at), amount: rupees(p.amount), status: p.status, method: p.method, contact: p.contact, error: p.error_description ?? null, smart_offer: p.offer_id ?? null })) };
  },
  get_settlements(ctx: RayCtx, a: { days?: number } = {}) {
    const days = clampDays(a.days);
    const r = lastDays(ctx.ledger, days);
    const s = settlementSummary(ctx.ledger, r);
    return {
      window: win(r), days, schedule: ctx.settlementMode === 'instant' ? 'instant on demand (plus T+1 for the rest)' : 'T+1 (next day, 10:00)',
      settled_count: s.count, settled_amount: rupees(s.amount), fees_and_gst: rupees(s.fees),
      settlements: s.settlements.slice(0, 8).map((x) => ({ id: x.id, date: dateOf(x.created_at), amount: rupees(x.amount), status: x.status, type: x.type, utr: x.utr })),
      next_scheduled: s.next ? { date: dateOf(s.next.created_at), amount: rupees(s.next.amount) } : null,
      available_for_instant: ctx.settlementMode === 'instant' ? rupees(unsettledBalance(ctx.ledger, ctx.instant)) : null,
    };
  },
  get_refunds_and_disputes(ctx: RayCtx, a: { days?: number } = {}) {
    const days = clampDays(a.days);
    const r = lastDays(ctx.ledger, days);
    const rf = ctx.ledger.refunds.filter((f) => inRange(f.created_at, r));
    const ds = ctx.ledger.disputes;
    const inWin = ds.filter((d) => inRange(d.created_at, r));
    return {
      window: win(r), days, refunds: rf.length, refunded: rupees(rf.reduce((x, f) => x + f.amount, 0)),
      disputes_opened_in_window: inWin.length, disputed_amount_in_window: rupees(inWin.reduce((x, d) => x + d.amount, 0)),
      disputes_all_time: ds.map((d) => ({ id: d.id, status: d.status, amount: rupees(d.amount), reason: d.reason_code, opened: dateOf(d.created_at) })),
      open_disputes: ds.filter((d) => d.status === 'open' || d.status === 'under_review').length,
    };
  },
  get_store_summary(ctx: RayCtx) {
    const s = ctx.derived.store;
    return { period: ctx.approved ? 'the month before the pilot (22 Aug – 20 Sep 2026)' : 'last month (22 Aug – 20 Sep 2026)', checkouts: s.checkouts, orders: M(s.orders), sales: M(s.gmv), aov: M(s.aov), checkout_conversion_pct: O(s.conversion * 100), discounts: M(s.discounts), discount_share_pct: O(s.discountShare * 100) };
  },
  get_offer_waste(ctx: RayCtx, args: { code?: string } = {}) {
    const e = args.code?.toUpperCase() === 'ALL' ? ctx.derived.allCodes : ctx.derived.a10;
    return {
      code: args.code?.toUpperCase() === 'ALL' ? 'ALL' : 'ALPHA10',
      rows: e.rows.map((r) => ({ group: r.group, label: label(ctx.model, r.group), spend: M(r.spend), extra_sales: M(r.extraSales), return_x: R(r.ret) })),
      spend: M(e.spend), extra_sales: M(e.extraSales), return_x: R(e.ret), profit: M(e.profit), break_even_x: R(ctx.derived.breakEven),
      to_returning: M(e.rows.find((r) => r.group === 'returning')?.spend ?? 0),
      return_basis: `${RETURN_LABEL}: ${roundHalfEven(ctx.derived.kept * 100)}% of extra sales kept after returns and failed COD`,
      extra_orders: O(e.extraOrders), cost_per_extra_order: (() => { const c = costPerExtraOrder(e.spend, e.extraOrders); return c === null ? null : M(c); })(),
      earned_per_extra_order: M(ctx.derived.earnedPerOrder),
      ...(args.code?.toUpperCase() === 'ALL' ? {} : { discount_to_buyers_who_would_buy_anyway: M(ctx.derived.a10Leaked), share_to_buyers_who_would_buy_anyway_pct: e.spend ? M((ctx.derived.a10Leaked / e.spend) * 100) : 0, orders_using_code: M(ctx.model.groups.reduce((t, g) => t + g.today.filter((u) => u.code === 'ALPHA10').reduce((x, u) => x + g.checkouts * u.share * (g.baseConversion + u.liftPp / 100), 0), 0)) }),
    };
  },
  simulate_plan(ctx: RayCtx, a: ScenarioArgs = {}) {
    const base = ctx.derived.planSettingsFor(ctx.settings);
    let menu = a.allowed_offers ? [...a.allowed_offers] : [...(base.allowedOffers ?? [])];
    for (const o of a.add_offers ?? []) if (!menu.includes(o)) menu.push(o);
    menu = menu.filter((o) => !(a.remove_offers ?? []).includes(o));
    const margin = a.keep_per_1000 !== undefined ? a.keep_per_1000 / 1000 : a.margin_pct !== undefined ? a.margin_pct / 100 : undefined;
    const overrides = a.overrides && Object.keys(a.overrides).length ? { ...(base.overrides ?? {}), ...a.overrides } : base.overrides;
    const sim = simulate(ctx.derived.planGroups, {
      ...base,
      ...(a.budget !== undefined ? { budget: a.budget } : {}),
      ...(margin !== undefined ? { margin } : {}),
      ...(a.goal ? { goal: a.goal } : {}),
      ...(a.orders_floor_pct !== undefined ? { ordersFloorPct: a.orders_floor_pct } : {}),
      ...(a.floor_return !== undefined ? { floorReturn: a.floor_return } : {}),
      ...(a.max_discount_inr !== undefined ? { maxDiscountInr: a.max_discount_inr } : {}),
      ...(a.growth_give_up_inr !== undefined ? { growth: a.growth_give_up_inr > 0 ? { metric: a.growth_metric ?? 'new_customers', giveUpInr: a.growth_give_up_inr } : null } : {}),
      allowedOffers: menu, overrides,
    }, buildPlan(ctx.derived.planGroups, base));
    const now = buildPlan(ctx.derived.planGroups, base);
    return {
      scenario: scenarioName(a), ...planSummary(ctx, sim), vs_current_profit: M(sim.vsCurrent.profit), vs_alpha10_profit: M(sim.vsAlpha10.profit),
      vs_current_new_customers: M(newCustomers(ctx.derived.planGroups, sim) - newCustomers(ctx.derived.planGroups, now)),
      applied: false as const,
    };
  },
  get_current_plan(ctx: RayCtx) {
    return { status: ctx.killed ? 'paused (kill switch)' : ctx.approved ? 'approved' : 'draft', scenario: 'current plan', ...planSummary(ctx, ctx.approved ? ctx.derived.live : ctx.derived.draft) };
  },
  draft_plan_change(ctx: RayCtx, a: { group_id: GroupId; offer_id: OfferId }): { draft: Draft; requires_approval: true } {
    const from = ctx.derived.live.rows.find((r) => r.group === a.group_id)!.offer;
    const m = ctx.derived.margin, k = ctx.derived.kept;
    const c = overrideCost(ctx.derived.planGroups, a.group_id, a.offer_id, m, 0.9, k);
    const now = overrideCost(ctx.derived.planGroups, a.group_id, from, m, 0.9, k);
    return { draft: { type: 'override', group: a.group_id, groupLabel: label(ctx.model, a.group_id), offer: a.offer_id, from, spend: M(c.spend), extraOrders: O(c.extraOrders), ret: R(c.ret), profit: M(c.profit),
      vsNow: { spend: M(c.spend - now.spend), extraOrders: O(c.extraOrders - now.extraOrders), profit: M(c.profit - now.profit) } }, requires_approval: true };
  },
  explain_group(ctx: RayCtx, a: { group_id: GroupId }) {
    const p = ctx.approved ? ctx.derived.live : ctx.derived.draft;
    const row = p.rows.find((r) => r.group === a.group_id)!;
    const g = ctx.derived.planGroups.find((x) => x.id === a.group_id)!;
    return { group: a.group_id, label: g.label, offer: row.offer, explanation: explainGroup(g, row, p.settings.margin, p.settings.keptRate ?? 1) };
  },
  explain_shopper(ctx: RayCtx, a: { example_id: string }, extraShoppers: Shopper[] = []) {
    const s = [...SAMPLE_SHOPPERS, ...extraShoppers].find((x) => x.id === a.example_id);
    if (!s) return { error: 'Unknown sample shopper.' };
    const d = decide(buildCheckoutTable(ctx.derived.liveOffers, ctx.killed), s);
    // Cart items are returned as data. Product names are never instructions.
    return { shopper: s.name, segment: s.sourceLabel, cart_items: s.cart.map((i) => i.name), cart_value: d.cartInr, group: d.group, group_label: label(ctx.model, d.group), offer: d.offer, offer_label: OFFER_BY_ID[d.offer].label, holdout: d.holdout, saving: d.savingInr, reason: d.reason };
  },
  get_results(ctx: RayCtx, a: { snapshot?: SnapKey } = {}) {
    const key: SnapKey = a.snapshot ?? ctx.derived.today ?? 'day20';
    const s = ctx.derived.snapshots[key];
    return {
      snapshot: key, days: s.days, projection: s.days > ctx.derived.nowDay, spend: M(s.spend), extra_sales: M(s.extraSales), extra_orders: O(s.extraOrders),
      extra_orders_range: [M(s.extraOrdersLow), M(s.extraOrdersHigh)], return_x: R(s.ret), return_range: [R(s.retLow), R(s.retHigh)], profit: M(s.profit),
      return_basis: `${RETURN_LABEL}; break-even ${R(ctx.derived.breakEven)}x`, break_even_x: R(ctx.derived.breakEven),
      cost_per_extra_order: s.metrics.costPerExtraOrder === null ? null : M(s.metrics.costPerExtraOrder), earned_per_extra_order: M(s.metrics.earnedPerExtraOrder),
      proof: s.proof,
      still_learning_groups: s.rows.filter((r) => r.offer !== 'none' && r.stillLearning).map((r) => label(ctx.model, r.group)),
      alpha10_same_period_profit: M(s.alpha10SamePeriod),
    };
  },
  get_creator_code_report(ctx: RayCtx) {
    const c = ctx.derived.creators;
    return { codes: c.rows.map((r) => ({ code: r.code, creator: r.creator, uses: r.uses, returning_uses: r.returningUses, returning_share_pct: M(r.returningSharePct), flag: r.flag })), returning_uses: c.returningUses, monthly_discount_to_returning: c.monthlyDiscountToReturning, first_order_only_net_gain: M(c.firstOrderOnlyNetGain) };
  },
  get_peer_benchmark(_ctx: RayCtx, a: { group_id: GroupId; offer_id: OfferId }) {
    const b = getPeerBenchmark({ groupId: a.group_id, offerId: a.offer_id });
    return b.ok
      ? { ok: true, pool_size: b.poolSize, median_lift_pp: b.medianLiftPp, typical_range_pp: [b.p25LiftPp, b.p75LiftPp], group: a.group_id, offer: a.offer_id }
      : { ok: false, reason: b.reason };
  },
  get_opportunities(ctx: RayCtx) {
    return { signals: ctx.derived.signals, eligibility: ctx.derived.eligibility, alerts: ctx.derived.alerts.map((a) => ({ title: a.title, detail: a.detail })) };
  },
  get_weekly_review(ctx: RayCtx) {
    const r = ctx.derived.reviews[0];
    if (!r) return { available: false, reason: ctx.approved ? 'The first review is one week after go-live.' : 'Smart Offers is not live yet.' };
    return { available: true, week: r.week, date: fmtDate(r.date), data_days: r.dataDays, items: r.items.map((i) => ({ status: i.kind, title: i.title, detail: i.detail, needs_approval: Boolean(i.action) })), next_review: ctx.derived.nextReview ? fmtDate(ctx.derived.nextReview) : null };
  },
  get_prediction_accuracy(ctx: RayCtx) {
    const snap = ctx.derived.snapshots[ctx.derived.today ?? 'day20'];
    const rows = accuracyRows(ctx.model.groups, snap, ctx.model.pool.p25, ctx.model.pool.p75);
    const s = accuracySummary(rows);
    return { day: snap.days, inside_range: s.inside, total: s.total, median_error_pp: O(s.medianAbsErrorPp), groups: rows.map((r) => ({ group: label(ctx.model, r.group), estimate_pp: O(r.priorPp), measured_pp: O(r.measuredPp), range_pp: [O(r.lowPp), O(r.highPp)], inside: r.inside })) };
  },
  get_pilot_decision(ctx: RayCtx) {
    const p = ctx.derived.pilot;
    return { pilot_day: p.days, days_left: ctx.derived.daysLeft, expected_profit_month: M(p.expectedProfitMonth), extra_orders: O(p.extraOrders), proven_extra_orders_at_least: M(p.extraOrdersLow), return_x: R(p.ret), return_range: [R(p.retLow), R(p.retHigh)], fee: M(p.fee.fee), fee_rule: '1% of proven extra sales, capped at 20% of extra profit', verdict: p.verdict };
  },
  get_impact_summary(ctx: RayCtx) {
    const live = ctx.approved && ctx.derived.today !== null;
    const snap = ctx.derived.snapshots[ctx.derived.today ?? 'day20'];
    const acc = accuracySummary(accuracyRows(ctx.model.groups, snap, ctx.model.pool.p25, ctx.model.pool.p75));
    const planCpo = costPerExtraOrder(ctx.derived.live.spend, ctx.derived.live.extraOrders);
    return {
      day: live ? snap.days : null,
      north_star: live ? { metric: 'extra profit after returns vs holdout, per month', value: M(snap.metrics.netProfitMonth) } : { metric: 'planned extra profit after returns per month', value: M(ctx.derived.live.profit) },
      return_x: live ? R(snap.ret) : R(ctx.derived.live.ret), break_even_x: R(ctx.derived.breakEven), return_basis: RETURN_LABEL,
      cost_per_extra_order: live ? (snap.metrics.costPerExtraOrder === null ? null : M(snap.metrics.costPerExtraOrder)) : planCpo === null ? null : M(planCpo),
      earned_per_extra_order: M(ctx.derived.earnedPerOrder),
      estimates_inside_range: live ? `${acc.inside} of ${acc.total}` : null, budget: ctx.derived.live.settings.budget,
    };
  },
  get_next_experiments(ctx: RayCtx) {
    return { experiments: ctx.derived.experiments.map((e) => ({ title: e.title, why: e.why, test: e.design, success_metric: e.metric })) };
  },
  get_why_ai(ctx: RayCtx) {
    return { same_shoppers_monthly_profit: ctx.derived.strategies.map((x) => ({ option: x.label, profit: M(x.profit) })), similar_stores: ctx.model.pool.size,
      basis: `same 90% of shoppers, same ₹${ctx.derived.comparison.budget.toLocaleString('en-IN')} budget cap`, alpha10_last_month_actual_profit: M(ctx.derived.a10.profit),
      capabilities: ['Estimates each group\'s lift from similar stores before the store has data', 'Chooses per group for profit, not ratio', 'Learns from a 10% holdout and leans on measured results over time', 'Re-plans every week; the merchant approves changes'] };
  },
  get_engine_snapshot(ctx: RayCtx) {
    return engineSnapshot(ctx);
  },
  draft_settings_change(ctx: RayCtx, a: SettingsArgs): { draft: Draft; requires_approval: true; diff: string[]; plan: ReturnType<typeof planSummary> } {
    const cur = ctx.settings;
    let menu: OfferId[] | undefined = a.allowed_offers ? [...a.allowed_offers] : undefined;
    if (a.add_offers?.length || a.remove_offers?.length) {
      menu = [...(menu ?? cur.allowedOffers)];
      for (const o of a.add_offers ?? []) if (!menu.includes(o)) menu.push(o);
      menu = menu.filter((o) => !(a.remove_offers ?? []).includes(o));
    }
    const patch: Partial<Settings> = {
      ...(a.budget !== undefined ? { budget: Math.round(a.budget) } : {}),
      ...(a.keep_per_1000 !== undefined ? { keepPer1000: Math.round(a.keep_per_1000) } : {}),
      ...(a.goal ? { goal: a.goal } : {}),
      ...(a.orders_floor_pct !== undefined ? { ordersFloorPct: a.orders_floor_pct } : {}),
      ...(menu ? { allowedOffers: menu } : {}),
      ...(a.max_discount_inr !== undefined ? { maxDiscountInr: Math.round(a.max_discount_inr) } : {}),
      ...(a.min_return !== undefined ? { minReturn: a.min_return && a.min_return > 0 ? a.min_return : null } : {}),
      ...(a.festive_window !== undefined ? { festiveWindow: a.festive_window } : {}),
      ...(a.growth_give_up_inr !== undefined ? { growth: a.growth_give_up_inr > 0 ? { metric: a.growth_metric ?? 'new_customers', giveUpInr: Math.round(a.growth_give_up_inr) } : null } : {}),
    };
    const from = ctx.approved ? ctx.derived.liveSettings : ctx.settings;
    const to = { ...cur, ...patch };
    const fromPlan = ctx.approved ? ctx.derived.live : ctx.derived.draft;
    const plan = simulate(ctx.derived.planGroups, ctx.derived.planSettingsFor(to), fromPlan);
    const diff = [...settingsDiff(from, to), ...planDiff(fromPlan, plan)];
    return { draft: { type: 'settings', patch, summary: diff.join('; ') || 'No change' }, requires_approval: true, diff, plan: planSummary(ctx, plan) };
  },
  get_setup_benchmarks(ctx: RayCtx) {
    const b = ctx.derived.benchmark;
    const pending = pendingInputs(ctx.approved, ctx.confirmed ?? {});
    const be = ctx.derived.draftBreakEven;
    const typical = typicalPatch(b, INPUT_KEYS, be);
    const inputs = INPUT_KEYS.map((k) => ({ input: INPUT_LABEL[k], value: inputValue(k, ctx.settings, be), source: ctx.approved ? 'approved' : ctx.confirmed?.[k] === 'merchant' ? 'merchant' : ctx.confirmed?.[k] === 'typical' ? 'typical, accepted' : 'not confirmed', typical_value: inputValue(k, { ...ctx.settings, ...typical }, be) }));
    if (!b.ok) return { ok: false as const, reason: b.reason, inputs, not_confirmed: pending.map((k) => INPUT_LABEL[k]) };
    return {
      ok: true as const, peers: b.peerLabel, stores: b.stores, note: 'Synthetic network aggregates (20+ stores, no store above 25% of the sample). Typical values are suggestions, never assumed.',
      keep_per_1000: b.keepPer1000, monthly_budget: b.budgetInr, offer_spend_pct_of_sales: b.offerSpendPct, goal_mix_pct: b.goalMixPct,
      offer_menu_pct: b.menuPct, max_discount: b.maxDiscountInr, min_return: { break_even_pct: b.floor.breakEvenPct, higher_pct: b.floor.higherPct, usual_higher: `${b.floor.usualHigherMultiple}× break-even`, break_even_x_at_your_margin: R(be) },
      pause_on_new_drops_pct: b.pausesOnDropsPct, growth_give_up_pct_of_profit: b.growthGiveUpPct,
      inputs, not_confirmed: pending.map((k) => INPUT_LABEL[k]),
    };
  },
  get_tradeoffs(ctx: RayCtx, a: { metric?: GrowthMetric; give_up_inr?: number; extra_customers?: number; keep_per_1000?: number; view?: 'growth' | 'margin' } = {}) {
    const metric = a.metric ?? 'new_customers';
    const base = ctx.derived.planSettingsFor({ ...ctx.settings, growth: null });
    const f = growthFrontier(ctx.derived.planGroups, base, metric, exploreBudget(ctx.settings.budget));
    const unit = metric === 'orders' ? 'orders' : 'new customers';
    const pt = (p: (typeof f)[number], i: number) => ({
      step: i, growth_give_up_setting: p.growth?.giveUpInr ?? 0, option: i === 0 ? 'Most profit (no trade-off)' : p.changes.map((c) => `${groupLabel(c.group)}: ${offerLabel(c.from)} → ${offerLabel(c.to)}${c.belowBreakEven ? ' (below break-even)' : ''}`).join('; '),
      profit_month: M(p.profit), profit_given_up: M(p.giveUp), budget_needed: p.budget, needs_bigger_budget: p.budget > ctx.settings.budget,
      new_customers_month: M(p.newCustomers), extra_new_customers: M(p.extraNewCustomers), orders_month: M(p.orders), extra_orders: M(p.extraOrders), orders_change_pct: O(p.ordersChangePct),
      cost_per_extra: p.costPerExtra === null ? null : M(p.costPerExtra),
    });
    const frontier = f.map(pt);
    // ₹1 tolerance: amounts come back rounded to the rupee and must pick the same option.
    const within = a.give_up_inr !== undefined ? pt(pointWithin(f, a.give_up_inr + 1), f.indexOf(pointWithin(f, a.give_up_inr + 1))) : null;
    const reach = a.extra_customers !== undefined ? (() => { const i = f.findIndex((p) => M(metric === 'orders' ? p.extraOrders : p.extraNewCustomers) >= a.extra_customers!); return i >= 0 ? pt(f[i], i) : null; })() : null;
    const keep = a.keep_per_1000 ?? ctx.settings.keepPer1000;
    const squeeze = marginSqueeze(ctx.derived.planGroups, ctx.derived.planSettingsFor(ctx.settings), ctx.settings.keepPer1000, [...new Set([-200, -150, -100, -50, 0, 50, keep - ctx.settings.keepPer1000])].sort((x, y) => x - y))
      .map((r) => ({ keep_per_1000: r.keepPer1000, margin_pct: O(r.margin * 100), break_even_x: R(r.breakEven), groups_with_offer: r.offersOn, profit_month: M(r.profit), new_customers_month: M(r.newCustomers),
        offers_lost: r.lost.map((l) => `${groupLabel(l.group)}: ${offerLabel(l.from)} → ${offerLabel(l.to)}`), profit_to_give_up_to_keep_todays_new_customers: r.keepGrowthCost === null ? 'not reachable within budget' : M(r.keepGrowthCost), yours: r.current }));
    const m = ctx.settings.keepPer1000 / 1000;
    const repeat = ctx.model.profile.repeat.rate * ctx.model.profile.repeat.aovInr * m * ctx.derived.kept;
    return { metric: unit, note: 'Every option is a real engine plan (same menu, max discount and minimum return). Choosing one is a draft the merchant approves.', current_setting: ctx.settings.growth ?? null,
      repeat_profit_per_new_customer_180d: M(repeat), repeat_basis: `${M(ctx.model.profile.repeat.rate * 100)}% of new customers reorder within 180 days at about ₹${M(ctx.model.profile.repeat.aovInr).toLocaleString('en-IN')}, after returns`, frontier, within_give_up: within, reaches_extra: reach, margin_squeeze: squeeze, view: a.view ?? (a.keep_per_1000 !== undefined ? 'margin' : 'growth') };
  },
  get_recommended_offers(ctx: RayCtx) {
    const recs = recommendOffers(ctx.derived.planGroups, ctx.derived.planSettingsFor(ctx.settings));
    return {
      note: 'Offers not on the merchant\'s menu, scored by the plan engine at their numbers. Evidence: stores-like-yours playbook (synthetic, 20+ stores). Adding one is a draft (draft_settings_change add_offers).',
      offers: recs.map((r) => ({ offer_id: r.offer, offer: r.label,
        status: (ctx.derived.learning?.rows.find((x) => x.group === r.group && x.challenger === r.offer && ['running', 'waiting', 'proposed'].includes(x.status))?.status === 'running' ? 'being tested by the agent now' : ctx.derived.learning?.rows.find((x) => x.group === r.group && x.challenger === r.offer && ['waiting', 'proposed'].includes(x.status)) ? 'waiting on your decision in the weekly review' : null), for_groups: (r.groups.length ? r.groups : [r.group]).map(groupLabel), verdict: r.verdict, profit_change_month: M(r.profitDelta), new_customers_change_month: M(r.newCustomersDelta),
        return_after_returns_x: r.offer === 'early_access' ? null : R(r.ret), group_profit_month_if_used: M(r.groupProfit), evidence: { stores_tested: r.evidence.storesTested, beat_no_offer_pct: r.evidence.beatNoOfferPct, median_lift_pp: r.evidence.medianLiftPp, note: r.evidence.note ?? null } })),
    };
  },
  request_resume(ctx: RayCtx): { draft: Draft; requires_approval: true } | { error: string } {
    return ctx.killed ? { draft: { type: 'resume' }, requires_approval: true } : { error: 'Smart Offers is not paused.' };
  },
  request_pause(_ctx: RayCtx, a: { scope: string }): { draft: Draft; requires_approval: true } {
    return { draft: { type: 'pause', scope: isGroupId(a.scope) ? a.scope : 'all' }, requires_approval: true };
  },
} satisfies Record<ToolName, (ctx: RayCtx, args: never) => unknown>;

export type ToolCall = { name: ToolName; args: Record<string, unknown>; result: unknown };

const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const goalOf = (x: unknown): Goal | undefined => (['most_profit', 'new_customers', 'orders_steady'].includes(x as string) ? (x as Goal) : undefined);
const offers = (x: unknown): OfferId[] | undefined => (Array.isArray(x) ? (x as unknown[]).filter((o): o is OfferId => isOfferId(o) && o !== 'none') : undefined);
const overridesOf = (x: unknown): Partial<Record<GroupId, OfferId>> | undefined => {
  if (!x || typeof x !== 'object') return undefined;
  const out: Partial<Record<GroupId, OfferId>> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (isGroupId(k) && isOfferId(v)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
};

/** Validated dispatcher used by live mode (model-provided args are untrusted). */
export function runTool(ctx: RayCtx, name: string, args: Record<string, unknown>): unknown {
  const a = args ?? {};
  switch (name) {
    case 'get_payments_summary': return tools.get_payments_summary(ctx, { days: a.days as number, end_days_ago: num(a.end_days_ago) });
    case 'get_daily_payments': return tools.get_daily_payments(ctx, { days: a.days as number });
    case 'list_payments': return tools.list_payments(ctx, {
      status: ['captured', 'failed', 'refunded'].includes(a.status as string) ? (a.status as string) : undefined,
      method: ['upi', 'card', 'netbanking', 'wallet'].includes(a.method as string) ? (a.method as string) : undefined,
      limit: typeof a.limit === 'number' ? a.limit : undefined,
    });
    case 'get_settlements': return tools.get_settlements(ctx, { days: a.days as number });
    case 'get_refunds_and_disputes': return tools.get_refunds_and_disputes(ctx, { days: a.days as number });
    case 'get_store_summary': return tools.get_store_summary(ctx);
    case 'get_offer_waste': return tools.get_offer_waste(ctx, { code: typeof a.code === 'string' ? a.code : undefined });
    case 'simulate_plan': {
      const budget = num(a.budget);
      const keep = num(a.keep_per_1000), margin = num(a.margin_pct);
      if (keep !== undefined && (keep < 50 || keep > 950)) return { error: 'keep_per_1000 must be between ₹50 and ₹950.' };
      if (margin !== undefined && (margin < 5 || margin > 95)) return { error: 'margin_pct must be between 5 and 95.' };
      const md = num(a.max_discount_inr);
      if (md !== undefined && md > MAX_DISCOUNT_PER_ORDER) return { error: `Guardrail: max discount per order is ₹${MAX_DISCOUNT_PER_ORDER}.` };
      const give = num(a.growth_give_up_inr);
      return tools.simulate_plan(ctx, {
        budget: budget === undefined ? undefined : Math.min(Math.max(budget, 5000), 1000000),
        margin_pct: margin, keep_per_1000: keep, orders_floor_pct: num(a.orders_floor_pct), floor_return: num(a.floor_return),
        goal: goalOf(a.goal), allowed_offers: offers(a.allowed_offers), add_offers: offers(a.add_offers), remove_offers: offers(a.remove_offers),
        max_discount_inr: md, overrides: overridesOf(a.overrides),
        growth_metric: a.growth_metric === 'orders' ? 'orders' : 'new_customers', growth_give_up_inr: give === undefined ? undefined : Math.max(0, give),
      });
    }
    case 'get_current_plan': return tools.get_current_plan(ctx);
    case 'draft_plan_change':
      if (!isGroupId(a.group_id) || !isOfferId(a.offer_id)) return { error: 'Unknown group or offer.' };
      return tools.draft_plan_change(ctx, { group_id: a.group_id, offer_id: a.offer_id });
    case 'explain_group': return isGroupId(a.group_id) ? tools.explain_group(ctx, { group_id: a.group_id }) : { error: 'Unknown group.' };
    case 'explain_shopper': return tools.explain_shopper(ctx, { example_id: String(a.example_id ?? '') });
    case 'get_results': return tools.get_results(ctx, { snapshot: typeof a.snapshot === 'string' && a.snapshot in SNAP_DAYS ? (a.snapshot as SnapKey) : undefined });
    case 'get_creator_code_report': return tools.get_creator_code_report(ctx);
    case 'get_peer_benchmark':
      if (!isGroupId(a.group_id) || !isOfferId(a.offer_id)) return { ok: false, reason: 'Unknown group or offer.' };
      return tools.get_peer_benchmark(ctx, { group_id: a.group_id, offer_id: a.offer_id });
    case 'get_opportunities': return tools.get_opportunities(ctx);
    case 'get_weekly_review': return tools.get_weekly_review(ctx);
    case 'get_prediction_accuracy': return tools.get_prediction_accuracy(ctx);
    case 'get_pilot_decision': return tools.get_pilot_decision(ctx);
    case 'get_impact_summary': return tools.get_impact_summary(ctx);
    case 'get_next_experiments': return tools.get_next_experiments(ctx);
    case 'get_why_ai': return tools.get_why_ai(ctx);
    case 'request_pause': return tools.request_pause(ctx, { scope: String(a.scope ?? 'all') });
    case 'get_engine_snapshot': return tools.get_engine_snapshot(ctx);
    case 'draft_settings_change': {
      const budget = num(a.budget), keep = num(a.keep_per_1000), md = num(a.max_discount_inr), mr = a.min_return === null ? null : num(a.min_return), give = num(a.growth_give_up_inr);
      if (budget !== undefined && (budget < 5000 || budget > 1000000)) return { error: 'Budget guardrail: a monthly budget must be between ₹5,000 and ₹10,00,000 (no uncapped budgets).' };
      if (keep !== undefined && (keep < 50 || keep > 950)) return { error: 'Margin must be what you keep from a ₹1,000 sale, between ₹50 and ₹950.' };
      if (md !== undefined && (md < 0 || md > MAX_DISCOUNT_PER_ORDER)) return { error: `Guardrail: max discount per order is ₹${MAX_DISCOUNT_PER_ORDER}.` };
      if (mr !== undefined && mr !== null && (mr < 0.5 || mr > 20)) return { error: 'Minimum return must be between 0.5x and 20x (or null for break-even).' };
      return tools.draft_settings_change(ctx, {
        budget, keep_per_1000: keep, goal: goalOf(a.goal), orders_floor_pct: num(a.orders_floor_pct), allowed_offers: offers(a.allowed_offers), add_offers: offers(a.add_offers), remove_offers: offers(a.remove_offers),
        max_discount_inr: md, ...(a.min_return !== undefined ? { min_return: mr ?? null } : {}), festive_window: typeof a.festive_window === 'boolean' ? a.festive_window : undefined,
        growth_metric: a.growth_metric === 'orders' ? 'orders' : 'new_customers', growth_give_up_inr: give === undefined ? undefined : Math.max(0, give),
      });
    }
    case 'get_setup_benchmarks': return tools.get_setup_benchmarks(ctx);
    case 'get_tradeoffs': return tools.get_tradeoffs(ctx, { metric: a.metric === 'orders' ? 'orders' : 'new_customers', give_up_inr: num(a.give_up_inr), extra_customers: num(a.extra_customers), keep_per_1000: num(a.keep_per_1000), view: a.view === 'margin' ? 'margin' : a.view === 'growth' ? 'growth' : undefined });
    case 'get_recommended_offers': return tools.get_recommended_offers(ctx);
    case 'request_resume': return tools.request_resume(ctx);
    default: return { error: `Unknown tool ${name}.` };
  }
}

export const MAX_DISCOUNT = MAX_DISCOUNT_PER_ORDER;
