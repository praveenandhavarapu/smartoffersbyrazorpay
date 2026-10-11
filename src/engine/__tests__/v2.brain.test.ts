/** v2 Phase 5 QA: other agents only get what the plan authorises; holdout applies; Neha gets no offer. */
import { testCtx } from '../../test/ctx';
import { derive } from '../../state/derived';
import { DEFAULT_USER_SETTINGS } from '../../state/store';
import { generateRequests } from '../../data/generator/agentDecisions';
import { answer, brainSummary } from '../discountBrain';
import { groupLabel } from '../../lib/labels';
import { toUnix } from '../../lib/dates';

describe('discount brain (§9)', () => {
  it('authorises only the live plan offer, never for no-offer groups, and holds out ~10%', async () => {
    const ctx = await testCtx();
    const d = derive(ctx.model, { settings: DEFAULT_USER_SETTINGS, approved: true, approvedSettings: DEFAULT_USER_SETTINGS, overrides: {}, killed: false, moment: 'day20' });
    const reqs = generateRequests(ctx.model.groups, toUnix('2026-10-10'));
    expect(generateRequests(ctx.model.groups, toUnix('2026-10-10'))).toEqual(reqs); // deterministic
    const ans = reqs.map((r) => answer(r, ctx.model.groups, d.liveOffers, d.margin, d.kept, groupLabel));
    for (const a of ans) expect(a.decision === 'none' || a.decision === d.liveOffers[a.group]).toBe(true);
    expect(ans.filter((a) => a.holdout).every((a) => a.decision === 'none')).toBe(true);
    const share = ans.filter((a) => a.holdout).length / ans.length;
    expect(share).toBeGreaterThan(0.06); expect(share).toBeLessThan(0.14);
    const neha = ans.find((a) => a.shopper === 'Neha')!;
    expect(neha.decision).toBe('none');
    expect(neha.reason).toMatch(/recover at 38% without a discount/);
    expect(neha.expectedProfitChange).toBeLessThan(0);
    const small = ans.find((a) => a.group === 'new_ads_small' && !a.holdout)!;
    expect(small.decision).toBe('free_shipping');
    expect(small.reason).toMatch(/12% → 17%/);
    const lapsed = ans.find((a) => a.group === 'lapsed' && !a.holdout)!;
    expect(lapsed.reason).toMatch(/15% → 21%/);
    expect(brainSummary(ans, ctx.model.groups).requests).toBe(ans.length);
  });
  it('kill switch: no discounts authorised', async () => {
    const ctx = await testCtx();
    const r = generateRequests(ctx.model.groups, toUnix('2026-10-10')).slice(0, 50);
    expect(r.map((x) => answer(x, ctx.model.groups, ctx.derived.liveOffers, 0.5, 0.81, groupLabel, true)).every((a) => a.decision === 'none')).toBe(true);
  });
});
