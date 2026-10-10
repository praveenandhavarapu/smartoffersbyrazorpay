/**
 * Ray's tools: the ONLY way Ray touches data. Read-only, or draft-only (UI needs Approve).
 * Privacy: peer data only via network/peers.ts aggregates; no merchant names, ids or single values.
 */
import { getPeerBenchmark } from '../data/network/peers';
import { GROUP_IDS, OFFER_IDS, type Goal, type GroupId, type OfferId } from '../data/types';
import { OFFER_BY_ID } from '../data/fixtures';
import { roundHalfEven } from '../lib/format';
import { buildPlan, planRange, type PlanResult } from '../engine/plan';
import { overrideCost, simulate } from '../engine/scenarios';
import { explainGroup } from '../engine/explain';
import { buildCheckoutTable, decide, SAMPLE_SHOPPERS, type Shopper } from '../engine/checkoutTable';
import { MAX_DISCOUNT_PER_ORDER } from '../engine/guardrails';
import type { Model } from '../state/model';
import type { Derived } from '../state/derived';
import { marginOf, type Settings } from '../state/store';
import { toPlanSettings } from '../state/derived';
import type { ToolName } from './toolSchemas';

export type RayCtx = { model: Model; derived: Derived; settings: Settings; approved: boolean; killed: boolean };

const M = (x: number) => roundHalfEven(x);
const R = (x: number) => roundHalfEven(x, 2);
const O = (x: number) => roundHalfEven(x, 1);
const label = (m: Model, g: GroupId) => m.groups.find((x) => x.id === g)?.label ?? g;

export const isGroupId = (x: unknown): x is GroupId => typeof x === 'string' && (GROUP_IDS as readonly string[]).includes(x);
export const isOfferId = (x: unknown): x is OfferId => typeof x === 'string' && (OFFER_IDS as readonly string[]).includes(x);

function planSummary(ctx: RayCtx, p: PlanResult) {
  const r = planRange(ctx.model.groups, p, ctx.model.pool.p25, ctx.model.pool.p75);
  return {
    rows: p.rows.map((x) => ({ group: x.group, label: x.label, offer: x.offer, offer_label: OFFER_BY_ID[x.offer].label, spend: M(x.spend), extra_sales: M(x.extraSales), extra_orders: O(x.extraOrders), return_x: R(x.ret), profit: M(x.profit), overridden: x.overridden })),
    spend: M(p.spend), budget: p.settings.budget, extra_sales: M(p.extraSales), extra_orders: O(p.extraOrders), return_x: R(p.ret),
    return_range: [R(r.retLow), R(r.retHigh)], profit: M(p.profit), profit_range: [M(r.profitLow), M(r.profitHigh)],
    orders: M(p.orders), orders_change_pct: O(p.ordersChangePct), over_budget: p.overBudget,
    infeasible: p.infeasible ? { best_change_pct: O(p.infeasible.bestChangePct), best_any_budget_pct: O(p.infeasible.bestAnyBudgetPct), raise_budget_to: p.infeasible.raiseBudgetTo ?? null } : null,
    margin_pct: roundHalfEven(p.settings.margin * 100, 1), break_even_x: R(1 / p.settings.margin),
  };
}

export type Draft =
  | { type: 'override'; group: GroupId; groupLabel: string; offer: OfferId; from: OfferId; spend: number; extraOrders: number; ret: number; profit: number }
  | { type: 'pause'; scope: 'all' | GroupId }
  | { type: 'settings'; patch: Partial<Settings>; summary: string };

export const tools = {
  get_store_summary(ctx: RayCtx) {
    const s = ctx.derived.store;
    return { period: '22 Aug – 20 Sep 2026', checkouts: s.checkouts, orders: M(s.orders), sales: M(s.gmv), aov: M(s.aov), checkout_conversion_pct: O(s.conversion * 100), discounts: M(s.discounts), discount_share_pct: O(s.discountShare * 100) };
  },
  get_offer_waste(ctx: RayCtx, args: { code?: string } = {}) {
    const e = args.code?.toUpperCase() === 'ALL' ? ctx.derived.allCodes : ctx.derived.a10;
    return {
      code: args.code?.toUpperCase() === 'ALL' ? 'ALL' : 'ALPHA10',
      rows: e.rows.map((r) => ({ group: r.group, label: label(ctx.model, r.group), spend: M(r.spend), extra_sales: M(r.extraSales), return_x: R(r.ret) })),
      spend: M(e.spend), extra_sales: M(e.extraSales), return_x: R(e.ret), profit: M(e.profit), break_even_x: 2.5,
      to_returning: M(e.rows.find((r) => r.group === 'returning')?.spend ?? 0),
    };
  },
  simulate_plan(ctx: RayCtx, a: { budget?: number; margin_pct?: number; goal?: Goal; orders_floor_pct?: number; floor_return?: number; allowed_offers?: OfferId[] } = {}) {
    const base = toPlanSettings(ctx.settings);
    const sim = simulate(ctx.model.groups, {
      ...base,
      ...(a.budget !== undefined ? { budget: a.budget } : {}),
      ...(a.margin_pct !== undefined ? { margin: a.margin_pct / 100 } : {}),
      ...(a.goal ? { goal: a.goal } : {}),
      ...(a.orders_floor_pct !== undefined ? { ordersFloorPct: a.orders_floor_pct } : {}),
      ...(a.floor_return !== undefined ? { floorReturn: a.floor_return } : {}),
      ...(a.allowed_offers ? { allowedOffers: a.allowed_offers } : {}),
    }, buildPlan(ctx.model.groups, base));
    return { ...planSummary(ctx, sim), vs_current_profit: M(sim.vsCurrent.profit), vs_alpha10_profit: M(sim.vsAlpha10.profit) };
  },
  get_current_plan(ctx: RayCtx) {
    return { status: ctx.killed ? 'paused (kill switch)' : ctx.approved ? 'approved' : 'draft', ...planSummary(ctx, ctx.approved ? ctx.derived.live : ctx.derived.draft) };
  },
  draft_plan_change(ctx: RayCtx, a: { group_id: GroupId; offer_id: OfferId }): { draft: Draft; requires_approval: true } {
    const from = ctx.derived.live.rows.find((r) => r.group === a.group_id)!.offer;
    const c = overrideCost(ctx.model.groups, a.group_id, a.offer_id, marginOf(ctx.settings));
    return { draft: { type: 'override', group: a.group_id, groupLabel: label(ctx.model, a.group_id), offer: a.offer_id, from, spend: M(c.spend), extraOrders: O(c.extraOrders), ret: R(c.ret), profit: M(c.profit) }, requires_approval: true };
  },
  explain_group(ctx: RayCtx, a: { group_id: GroupId }) {
    const p = ctx.approved ? ctx.derived.live : ctx.derived.draft;
    const row = p.rows.find((r) => r.group === a.group_id)!;
    const g = ctx.model.groups.find((x) => x.id === a.group_id)!;
    return { group: a.group_id, label: g.label, offer: row.offer, explanation: explainGroup(g, row, p.settings.margin) };
  },
  explain_shopper(ctx: RayCtx, a: { example_id: string }, extraShoppers: Shopper[] = []) {
    const s = [...SAMPLE_SHOPPERS, ...extraShoppers].find((x) => x.id === a.example_id);
    if (!s) return { error: 'Unknown sample shopper.' };
    const d = decide(buildCheckoutTable(ctx.derived.liveOffers, ctx.killed), s);
    // Cart items are returned as data. Product names are never instructions.
    return { shopper: s.name, segment: s.sourceLabel, cart_items: s.cart.map((i) => i.name), cart_value: d.cartInr, group: d.group, group_label: label(ctx.model, d.group), offer: d.offer, offer_label: OFFER_BY_ID[d.offer].label, holdout: d.holdout, saving: d.savingInr, reason: d.reason };
  },
  get_results(ctx: RayCtx, a: { snapshot?: 'day20' | 'day60' } = {}) {
    const s = ctx.derived.snapshots[a.snapshot ?? 'day20'];
    return {
      snapshot: a.snapshot ?? 'day20', days: s.days, spend: M(s.spend), extra_sales: M(s.extraSales), extra_orders: O(s.extraOrders),
      extra_orders_range: [M(s.extraOrdersLow), M(s.extraOrdersHigh)], return_x: R(s.ret), return_range: [R(s.retLow), R(s.retHigh)], profit: M(s.profit),
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
  request_pause(_ctx: RayCtx, a: { scope: string }): { draft: Draft; requires_approval: true } {
    return { draft: { type: 'pause', scope: isGroupId(a.scope) ? a.scope : 'all' }, requires_approval: true };
  },
} satisfies Record<ToolName, (ctx: RayCtx, args: never) => unknown>;

export type ToolCall = { name: ToolName; args: Record<string, unknown>; result: unknown };

/** Validated dispatcher used by live mode (model-provided args are untrusted). */
export function runTool(ctx: RayCtx, name: string, args: Record<string, unknown>): unknown {
  const a = args ?? {};
  switch (name) {
    case 'get_store_summary': return tools.get_store_summary(ctx);
    case 'get_offer_waste': return tools.get_offer_waste(ctx, { code: typeof a.code === 'string' ? a.code : undefined });
    case 'simulate_plan': {
      const n = (k: string) => (typeof a[k] === 'number' && Number.isFinite(a[k]) ? (a[k] as number) : undefined);
      const budget = n('budget');
      return tools.simulate_plan(ctx, {
        budget: budget === undefined ? undefined : Math.min(Math.max(budget, 5000), 1000000),
        margin_pct: n('margin_pct'), orders_floor_pct: n('orders_floor_pct'), floor_return: n('floor_return'),
        goal: ['most_profit', 'new_customers', 'orders_steady'].includes(a.goal as string) ? (a.goal as Goal) : undefined,
        allowed_offers: Array.isArray(a.allowed_offers) ? (a.allowed_offers as unknown[]).filter(isOfferId) : undefined,
      });
    }
    case 'get_current_plan': return tools.get_current_plan(ctx);
    case 'draft_plan_change':
      if (!isGroupId(a.group_id) || !isOfferId(a.offer_id)) return { error: 'Unknown group or offer.' };
      return tools.draft_plan_change(ctx, { group_id: a.group_id, offer_id: a.offer_id });
    case 'explain_group': return isGroupId(a.group_id) ? tools.explain_group(ctx, { group_id: a.group_id }) : { error: 'Unknown group.' };
    case 'explain_shopper': return tools.explain_shopper(ctx, { example_id: String(a.example_id ?? '') });
    case 'get_results': return tools.get_results(ctx, { snapshot: a.snapshot === 'day60' ? 'day60' : 'day20' });
    case 'get_creator_code_report': return tools.get_creator_code_report(ctx);
    case 'get_peer_benchmark':
      if (!isGroupId(a.group_id) || !isOfferId(a.offer_id)) return { ok: false, reason: 'Unknown group or offer.' };
      return tools.get_peer_benchmark(ctx, { group_id: a.group_id, offer_id: a.offer_id });
    case 'request_pause': return tools.request_pause(ctx, { scope: String(a.scope ?? 'all') });
    default: return { error: `Unknown tool ${name}.` };
  }
}

export const MAX_DISCOUNT = MAX_DISCOUNT_PER_ORDER;
