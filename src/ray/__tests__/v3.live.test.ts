/** v3 Live-mode contract: tools cover what Ray offers; every scenario run shows as a card; untrusted args are safe. */
import { runTool, tools, type RayCtx, type ToolCall } from '../tools';
import { cardsFromCalls } from '../useRay';
import { TOOL_SCHEMAS } from '../toolSchemas';
import { systemPrompt } from '../systemPrompt';
import { testCtx } from '../../test/ctx';
import { buildPlan } from '../../engine/plan';

let ctx: RayCtx;
beforeAll(async () => { ctx = await testCtx(); });

describe('per-group what-ifs (the "yes please" → "I couldn\'t run that" bug)', () => {
  it('simulate_plan runs a per-group override and reports its cost', () => {
    const r = runTool(ctx, 'simulate_plan', { overrides: { returning: 'flat_100' } }) as ReturnType<typeof tools.simulate_plan>;
    expect(r.rows.find((x) => x.group === 'returning')!.offer).toBe('flat_100');
    expect(r.vs_current_profit).toBeLessThan(0);
    expect(r.scenario).toMatch(/Returning.*₹100 off/);
  });
  it('adds playbook offers to the menu in a scenario', () => {
    const r = runTool(ctx, 'simulate_plan', { add_offers: ['flat_150'] }) as ReturnType<typeof tools.simulate_plan>;
    expect(r.rows.find((x) => x.group === 'new_ads_big')!.offer).toBe('flat_150');
  });
  it('the system prompt lists overrides and forbids offering steps the tools can\'t do', () => {
    const p = systemPrompt('Alpha Apparel');
    expect(p).toMatch(/per-group overrides/);
    expect(p).toMatch(/Never say you can't run a scenario/);
    expect(p).toMatch(/Never assume the merchant's numbers/);
  });
  it('every tool Ray is told about exists in the schemas', () => {
    const names = TOOL_SCHEMAS.map((t) => t.name);
    for (const n of ['simulate_plan', 'get_tradeoffs', 'get_recommended_offers', 'get_setup_benchmarks', 'draft_settings_change', 'draft_plan_change', 'request_pause', 'request_resume']) expect(names).toContain(n);
  });
});

describe('scenario cards match what Ray ran (the ₹33,062 vs ₹94,665 mismatch)', () => {
  it('several simulate_plan calls become one comparison card, in order, titled by what changed', () => {
    const calls: ToolCall[] = [
      { name: 'simulate_plan', args: { margin_pct: 30 }, result: runTool(ctx, 'simulate_plan', { margin_pct: 30 }) },
      { name: 'simulate_plan', args: { margin_pct: 30, floor_return: 1 }, result: runTool(ctx, 'simulate_plan', { margin_pct: 30, floor_return: 1 }) },
      { name: 'simulate_plan', args: { margin_pct: 50 }, result: runTool(ctx, 'simulate_plan', { margin_pct: 50 }) },
    ];
    const { cards } = cardsFromCalls(calls);
    expect(cards[0].kind).toBe('scenarios');
    if (cards[0].kind !== 'scenarios') return;
    expect(cards[0].items.map((x) => x.title)).toEqual(['margin 30%', 'margin 30% · 1x minimum return', 'margin 50%']);
    expect(cards[0].items.map((x) => x.sim.spend)).toEqual(calls.map((c) => (c.result as { spend: number }).spend));
  });
  it('one scenario shows one card titled with its settings', () => {
    const { cards } = cardsFromCalls([{ name: 'simulate_plan', args: { budget: 50000 }, result: runTool(ctx, 'simulate_plan', { budget: 50000 }) }]);
    // The title says what was asked and what happened (the plan doesn't need all of a ₹50,000 budget).
    expect(cards[0]).toMatchObject({ kind: 'sim', title: expect.stringMatching(/^Scenario: budget ₹50,000 \(uses ₹[\d,]+\) \(not applied\)$/) });
  });
});

describe('growth, recommendations and benchmarks for Live mode', () => {
  it('get_tradeoffs returns reproducible options with profit given up and budget needed', () => {
    const r = runTool(ctx, 'get_tradeoffs', { metric: 'new_customers', give_up_inr: 10000 }) as ReturnType<typeof tools.get_tradeoffs>;
    expect(r.frontier.length).toBeGreaterThan(2);
    expect(r.within_give_up!.profit_given_up).toBeLessThanOrEqual(10000);
    const p = r.within_give_up!;
    const plan = buildPlan(ctx.derived.planGroups, { ...ctx.derived.planSettingsFor(ctx.settings), budget: p.budget_needed, growth: p.growth_give_up_setting ? { metric: 'new_customers', giveUpInr: p.growth_give_up_setting } : null });
    expect(Math.round(plan.profit)).toBe(p.profit_month);
  });
  it('get_recommended_offers lists off-menu offers with engine deltas', () => {
    const r = runTool(ctx, 'get_recommended_offers', {}) as ReturnType<typeof tools.get_recommended_offers>;
    expect(r.offers.some((o) => o.offer_id === 'flat_150' && o.verdict === 'adds_profit')).toBe(true);
  });
  it('get_setup_benchmarks marks unconfirmed inputs before approval', () => {
    const r = runTool(ctx, 'get_setup_benchmarks', {}) as ReturnType<typeof tools.get_setup_benchmarks>;
    expect(r.not_confirmed.length).toBe(6);
    expect(r.inputs.every((i) => i.source === 'not confirmed')).toBe(true);
  });
  it('draft_settings_change can add playbook offers and set a minimum return; never applies', () => {
    const r = runTool(ctx, 'draft_settings_change', { add_offers: ['flat_150'], min_return: 2.2 }) as ReturnType<typeof tools.draft_settings_change>;
    expect(r.requires_approval).toBe(true);
    expect(r.draft).toMatchObject({ type: 'settings', patch: { allowedOffers: ['free_shipping', 'flat_100', 'flat_200', 'flat_150'], minReturn: 2.2 } });
    expect(ctx.settings.allowedOffers).not.toContain('flat_150');
  });
});

describe('untrusted Live-mode arguments never crash or break guardrails', () => {
  const junk: unknown[] = [undefined, null, 'x', -1, 1e12, NaN, Infinity, [], {}, ['flat_999'], { returning: 'flat_500' }, { hacker: 'flat_100' }, true];
  it('every tool returns data or an error for junk args', () => {
    for (const t of TOOL_SCHEMAS) {
      for (const v of junk) {
        const args = Object.fromEntries(Object.keys((t.input_schema as { properties: object }).properties).map((k) => [k, v]));
        const out = JSON.stringify(runTool(ctx, t.name, args as Record<string, unknown>));
        expect(out, `${t.name} ${JSON.stringify(v)}`).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
  it('a pause for an unknown group is refused, never widened to "all"', () => {
    expect(runTool(ctx, 'request_pause', { scope: 'big carts' })).toMatchObject({ error: expect.stringMatching(/Unknown scope/) });
  });
  it('an override draft reports the whole plan and whether it breaks the budget', () => {
    const r = runTool(ctx, 'draft_plan_change', { group_id: 'returning', offer_id: 'flat_100' }) as { plan_after: { over_budget: boolean; budget_needed: number | null; spend: number } };
    expect(r.plan_after.over_budget).toBe(true);
    expect(r.plan_after.budget_needed).toBeGreaterThanOrEqual(r.plan_after.spend);
  });
  it('plans with playbook offers get a range that contains their own estimate', () => {
    for (const add of [['flat_150'], ['free_shipping_prepaid'], ['free_shipping_999'], ['flat_150', 'free_shipping_prepaid']]) for (const m of [30, 40, 50, 60]) {
      const r = runTool(ctx, 'simulate_plan', { add_offers: add, margin_pct: m }) as ReturnType<typeof tools.simulate_plan>;
      if (!r.spend) continue;
      expect(r.profit_range[0]).toBeLessThanOrEqual(r.profit + 1);
      expect(r.profit_range[1]).toBeGreaterThanOrEqual(r.profit - 1);
      expect(r.return_range[0]).toBeLessThanOrEqual(r.return_x + 0.01);
      expect(r.return_range[1]).toBeGreaterThanOrEqual(r.return_x - 0.01);
    }
  });
  it('a tight budget uses leftover room for profitable offers (refill after greedy downgrades)', () => {
    const r = runTool(ctx, 'simulate_plan', { budget: 80000 }) as ReturnType<typeof tools.simulate_plan>;
    const lower = runTool(ctx, 'simulate_plan', { budget: 61000 }) as ReturnType<typeof tools.simulate_plan>;
    expect(r.profit).toBeGreaterThan(lower.profit);
    expect(r.spend).toBeLessThanOrEqual(80000);
  });
  it('max discount above ₹250 and uncapped budgets are refused', () => {
    expect(runTool(ctx, 'simulate_plan', { max_discount_inr: 400 })).toMatchObject({ error: expect.stringMatching(/Guardrail/) });
    expect(runTool(ctx, 'draft_settings_change', { budget: 50_00_000 })).toMatchObject({ error: expect.stringMatching(/Budget guardrail/) });
    expect(runTool(ctx, 'draft_settings_change', { max_discount_inr: 300 })).toMatchObject({ error: expect.stringMatching(/Guardrail/) });
  });
});
