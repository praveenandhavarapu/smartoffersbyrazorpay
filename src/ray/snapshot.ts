/**
 * v2 §11: Ray's context is ONE engine snapshot. Ray (Live or Demo) quotes only numbers present here;
 * the engine computes every figure. Rounded for reading; compact on purpose (it is sent to the model).
 */
import { roundHalfEven } from '../lib/format';
import { DEMO_DATES, fmtDate, pilotDayDate, toUnix } from '../lib/dates';
import { groupLabel, offerLabel, GOAL_LABEL } from '../lib/labels';
import { costPerExtraOrder } from '../engine/net';
import { playbook } from '../data/network/playbook';
import { generateRequests } from '../data/generator/agentDecisions';
import { answer, brainSummary } from '../engine/discountBrain';
import { blanketPrepaid } from '../engine/paymentAware';
import { pendingActions } from '../state/derived';
import { FEATURES } from '../config/features';
import { INPUT_LABEL, type Settings } from '../state/store';
import { inputValue, pendingInputs } from '../state/inputs';
import type { RayCtx } from './tools';

const M = (x: number) => roundHalfEven(x);
const R = (x: number) => roundHalfEven(x, 2);
const O = (x: number) => roundHalfEven(x, 1);
const cpo = (spend: number, orders: number) => { const c = costPerExtraOrder(spend, orders); return c === null ? null : M(c); };
const settingsView = (s: Settings) => ({ budget: s.budget, keep_per_1000: s.keepPer1000, margin_pct: s.keepPer1000 / 10, goal: GOAL_LABEL[s.goal], offer_menu: s.allowedOffers.map(offerLabel), festive_window: s.festiveWindow, max_discount: s.maxDiscountInr, min_return: s.minReturn ? `${s.minReturn}x` : 'break-even', growth_trade_off: s.growth ? `give up up to ₹${s.growth.giveUpInr} a month for more ${s.growth.metric === 'orders' ? 'orders' : 'new customers'}` : null });

export function engineSnapshot(ctx: RayCtx) {
  const d = ctx.derived;
  const L = d.learning;
  const key = ctx.day ?? d.today ?? 'day20';
  const s = d.snapshots[key];
  const live = ctx.approved && d.today !== null;
  const demoDate = d.nowDay > 0 ? pilotDayDate(d.nowDay) : DEMO_DATES.before;
  const brain = (() => {
    if (!FEATURES.discountBrain || !ctx.approved) return null;
    const ans = generateRequests(ctx.model.groups, toUnix(demoDate) + 6 * 3600).map((r) => answer(r, L?.groupsV2 ?? ctx.model.groups, d.liveOffers, d.margin, d.kept, groupLabel, ctx.killed));
    const sum = brainSummary(ans, L?.groupsV2 ?? ctx.model.groups);
    const neha = ans.find((a) => a.shopper === 'Neha');
    return { agent: 'Cart Abandonment (simulated)', requests_this_month: sum.requests, no_discount_share_pct: M(sum.noDiscountShare * 100), discount_avoided: M(sum.discountAvoided), expected_recoveries: M(sum.recoveries), example: neha ? { shopper: 'Neha', group: groupLabel(neha.group), asked: offerLabel(neha.asked), answer: offerLabel(neha.decision), reason: neha.reason } : null };
  })();
  const prepaid = FEATURES.paymentAware ? blanketPrepaid(ctx.model.groups, d.margin) : null;
  return {
    note: 'Synthetic demo data. Every number is engine output; quote only numbers in this snapshot. Returns are "after returns" (net of returns and failed COD).',
    as_of: { demo_date: fmtDate(demoDate), pilot_day: d.nowDay, selected_day: s.days, selected_day_is_projection: s.days > d.nowDay },
    status: !ctx.approved ? 'not approved yet (plan is a draft)' : ctx.killed ? 'paused (kill switch)' : 'live',
    money_basis: { holdout_pct: ctx.model.profile.holdoutPct, margin_pct: O(d.margin * 100), kept_after_returns_pct: M(d.kept * 100), break_even_x: R(d.breakEven), earned_per_extra_order: M(d.earnedPerOrder) },
    approved_settings: ctx.approved ? settingsView(d.liveSettings) : null,
    draft_settings: d.hasDraft || !ctx.approved ? settingsView(ctx.settings) : null,
    draft_diff_not_live: d.draftDiff,
    inputs_not_confirmed: pendingInputs(ctx.approved, ctx.confirmed ?? {}).map((k) => ({ input: INPUT_LABEL[k], value_in_use: inputValue(k, ctx.settings, d.draftBreakEven), note: 'typical for stores this size; ask the merchant to confirm or give theirs' })),
    plan: {
      offers: Object.fromEntries(d.live.rows.map((r) => [groupLabel(r.group), offerLabel(r.offer)])),
      spend_month: M(d.live.spend), budget: d.liveSettings.budget, profit_after_returns_month: M(d.live.profit), return_after_returns_x: R(d.live.ret),
      extra_orders_month: M(d.live.extraOrders), cost_per_extra_order: cpo(d.live.spend, d.live.extraOrders),
    },
    results: live ? {
      day: s.days, spend: M(s.spend), extra_orders: M(s.extraOrders), extra_orders_range: [M(s.extraOrdersLow), M(s.extraOrdersHigh)],
      return_after_returns_x: R(s.ret), return_range: [R(s.retLow), R(s.retHigh)], profit_after_returns: M(s.profit), profit_month: M(s.metrics.netProfitMonth),
      cost_per_extra_order: s.metrics.costPerExtraOrder === null ? null : M(s.metrics.costPerExtraOrder), discount_to_buyers_who_would_buy_anyway: M(s.metrics.leaked), proof: s.proof,
    } : null,
    alpha10_last_month: { spend: M(d.a10.spend), extra_orders: M(d.a10.extraOrders), cost_per_extra_order: d.a10CostPerOrder === null ? null : M(d.a10CostPerOrder), return_after_returns_x: R(d.a10.ret), profit_after_returns: M(d.a10.profit), discount_to_buyers_who_would_buy_anyway: M(d.a10Leaked) },
    why_ai_same_budget: { verdict: d.comparison.verdict, monthly_profit: d.comparison.rows.map((r) => ({ option: r.label, profit: M(r.profit), capped_at_budget: r.capped })) },
    experiments: (L?.rows ?? []).map((r) => ({
      group: groupLabel(r.group), mode: r.mode.mode, champion: offerLabel(r.champion), challenger: r.challenger ? offerLabel(r.challenger) : null, note: r.reason ?? null, status: r.status,
      days_running: r.daysRunning, decision_date: r.decisionDate ? fmtDate(r.decisionDate, false) : null, traffic_share_pct: M(r.trafficShare * 100),
      read: r.read ? { days: r.read.days, champion_lift_pp: O(r.read.champion.liftPp), challenger_lift_pp: O(r.read.challenger.liftPp), spend_cut_pct: M(r.read.spendCutPct), profit_change_month: M(r.read.gainMonth), verdict: r.read.verdict } : null,
      failed_deliveries_avoided_per_100_orders: r.rto ? O(r.rto.challenger) : undefined,
    })),
    timeline: (L?.events ?? []).map((e) => ({ date: fmtDate(e.date, false), actor: e.actor, summary: e.summary, needs_approval: e.needsApproval, decision: e.decision ?? null, projected: e.projected })),
    waiting_on_you: [...pendingActions(d.reviews, ctx.reviewDecisions ?? {}).map((i) => i.title), ...(d.hasDraft ? ['Plan changes (draft, not live)'] : [])],
    playbook_stores_like_yours: FEATURES.playbook ? { stores: ctx.model.pool.size, rows: playbook().map((r) => ({ group: groupLabel(r.group), offer: r.label, stores_tested: r.storesTested, beat_no_offer_pct: r.beatNoOfferPct, median_lift_pp: r.medianLiftPp, on_your_menu: r.inMenu })) } : null,
    decisions_served_to_other_agents: brain,
    prepaid_insight: prepaid ? { blanket_discount: 50, losing_groups: prepaid.losing.map(groupLabel), paying_groups: prepaid.paying.map(groupLabel), net_month: M(prepaid.net) } : null,
  };
}
