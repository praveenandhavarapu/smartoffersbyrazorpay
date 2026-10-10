import { tools, runTool, type RayCtx } from '../tools';
import { TOOL_SCHEMAS } from '../toolSchemas';
import { testCtx } from '../../test/ctx';
import { generateNetwork } from '../../data/generator/network';

let ctx: RayCtx;
beforeAll(async () => { ctx = await testCtx(); });

describe('Ray tool privacy', () => {
  it('no tool output contains network merchant names, ids or single-merchant sales', () => {
    const net = generateNetwork();
    const outputs = TOOL_SCHEMAS.map((s) => JSON.stringify(runTool(ctx, s.name, { group_id: 'new_ads_small', offer_id: 'free_shipping', example_id: 'priya', scope: 'all' })));
    const blob = outputs.join('\n');
    for (const m of net.slice(0, 200)) {
      expect(blob).not.toContain(m.name);
      expect(blob).not.toContain(m.id);
    }
  });
  it('peer benchmark returns only aggregates', () => {
    const b = tools.get_peer_benchmark(ctx, { group_id: 'lapsed', offer_id: 'flat_100' });
    expect(Object.keys(b).sort()).toEqual(['group', 'median_lift_pp', 'offer', 'ok', 'pool_size', 'typical_range_pp']);
  });
  it('shopper outputs never include contacts', () => {
    const r = JSON.stringify(tools.explain_shopper(ctx, { example_id: 'neha' }));
    expect(r).not.toMatch(/\+91|\d{10}|@/);
  });
  it('draft tools never apply changes (they only return drafts needing approval)', () => {
    const d = runTool(ctx, 'draft_plan_change', { group_id: 'returning', offer_id: 'flat_100' }) as { requires_approval: boolean };
    expect(d.requires_approval).toBe(true);
    expect(ctx.derived.live.rows.find((r) => r.group === 'returning')!.offer).toBe('none');
  });
  it('rejects malformed model arguments', () => {
    expect(runTool(ctx, 'draft_plan_change', { group_id: 'iphone_users', offer_id: 'flat_900' })).toEqual({ error: 'Unknown group or offer.' });
    expect(runTool(ctx, 'nope', {})).toEqual({ error: 'Unknown tool nope.' });
  });
});
