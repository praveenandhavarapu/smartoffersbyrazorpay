/** v2 Phase 7 QA: Ray reads one engine snapshot; changes are drafts; what-ifs are scenarios; named guardrails. */
import { route } from '../demoRouter';
import { tools, type RayCtx } from '../tools';
import { testCtx } from '../../test/ctx';
import { derive } from '../../state/derived';
import { DEFAULT_USER_SETTINGS } from '../../state/store';
import { inr } from '../../lib/format';

let ctx: RayCtx;
let live: RayCtx;
beforeAll(async () => {
  ctx = await testCtx();
  const d = derive(ctx.model, { settings: DEFAULT_USER_SETTINGS, approved: true, approvedSettings: DEFAULT_USER_SETTINGS, overrides: {}, killed: false, moment: 'day20', creatorFix: 'pending' });
  live = { ...ctx, derived: d, approved: true, day: 'day20' };
});

describe('engine snapshot (§11.1)', () => {
  it('carries the engine numbers for the selected day, plan, ALPHA10, experiments, playbook, brain and prepaid insight', () => {
    const s = tools.get_engine_snapshot(live);
    const d = live.derived;
    expect(s.results!.profit_after_returns).toBe(Math.round(d.snapshots.day20.profit));
    expect(s.results!.cost_per_extra_order).toBe(Math.round(d.snapshots.day20.metrics.costPerExtraOrder!));
    expect(s.plan.profit_after_returns_month).toBe(Math.round(d.live.profit));
    expect(s.alpha10_last_month.cost_per_extra_order).toBe(Math.round(d.a10CostPerOrder!));
    expect(s.experiments.some((e) => e.challenger === '₹150 off')).toBe(true);
    expect(s.playbook_stores_like_yours!.rows.length).toBeGreaterThan(5);
    expect(s.decisions_served_to_other_agents!.example!.answer).toBe('No offer');
    expect(s.prepaid_insight!.losing_groups.length).toBeGreaterThanOrEqual(5);
    expect(s.waiting_on_you.length).toBe(2);
  });
});

describe('new chips (§11.5)', () => {
  it('ALPHA10 cost per order', () => {
    const r = route('What does ALPHA10 cost me per order?', ctx);
    expect(r.intent).toBe('alpha10_per_order');
    expect(r.text).toContain(inr(ctx.derived.a10CostPerOrder!));
    expect(r.text).toContain(inr(ctx.derived.earnedPerOrder));
  });
  it('what the agent is testing', () => {
    const r = route('What is the agent testing right now?', live);
    expect(r.intent).toBe('testing');
    expect(r.text).toMatch(/₹200 off.*₹150 off/);
  });
  it('the abandoned-cart agent', () => {
    const r = route('Should the abandoned-cart agent offer discounts?', live);
    expect(r.intent).toBe('cart_agent');
    expect(r.text).toMatch(/no discount needed/);
  });
  it('stores like mine: what worked, never what they charge', () => {
    const r = route('What do stores like mine run?', ctx);
    expect(r.intent).toBe('stores_like_mine');
    expect(r.text).toMatch(/not what they charge/);
  });
});

describe('drafts, scenarios and guardrails (§11.3–4)', () => {
  it('a budget change is a draft with a diff, not applied', () => {
    const r = route('Set my budget to ₹50,000', live);
    expect(r.intent).toBe('settings_draft');
    expect(r.card).toMatchObject({ kind: 'draft', draft: { type: 'settings', patch: { budget: 50000 } } });
    expect(r.card?.kind === 'draft' && r.card.draft.type === 'settings' && r.card.draft.summary).toMatch(/Budget ₹1,00,000 → ₹50,000/);
    expect(live.settings.budget).toBe(100000);
  });
  it('a goal change is a draft', () => {
    expect(route('Switch my goal to keep orders steady', live).intent).toBe('settings_draft');
  });
  it('what-ifs are scenarios, titled as not applied', () => {
    const r = route('What if my margin is 30%?', ctx);
    expect(r.card).toMatchObject({ kind: 'sim', title: 'Scenario: margin 30% (not applied)' });
  });
  it.each([
    ['Remove the budget limit', /monthly budget hard stop/],
    ['Send a WhatsApp to all my customers with a coupon', /no shopper messaging/],
    ['Raise prices by 10% for big carts', /no price changes/],
    ['Give lapsed shoppers ₹500 off', /max discount ₹250 per order/],
  ])('declines "%s" and names the guardrail', (msg, re) => {
    const r = route(msg, live);
    expect(r.refused).toBe(true);
    expect(r.text).toMatch(re);
  });
});
