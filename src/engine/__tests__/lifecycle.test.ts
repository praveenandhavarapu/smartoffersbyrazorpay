import { testCtx } from '../../test/ctx';
import { derive } from '../../state/derived';
import { DEFAULT_USER_SETTINGS } from '../../state/store';
import { daysToProve } from '../review';
import { accuracyRows, accuracySummary } from '../accuracy';
import type { RayCtx } from '../../ray/tools';
import { inr } from '../../lib/format';

let ctx: RayCtx;
beforeAll(async () => { ctx = await testCtx(); });
const live = (moment: 'day20' | 'day30', extra = {}) => derive(ctx.model, { settings: DEFAULT_USER_SETTINGS, approved: true, approvedSettings: DEFAULT_USER_SETTINGS, overrides: {}, killed: false, moment, creatorFix: 'pending', ...extra });

describe('lifecycle: weekly reviews, alerts, pilot decision', () => {
  it('two reviews by day 20 (Mon 28 Sep, Mon 5 Oct), four by day 30; next review is the following Monday', () => {
    const d20 = live('day20');
    expect(d20.reviews.map((r) => r.date)).toEqual(['2026-10-05', '2026-09-28']);
    expect(d20.nextReview).toBe('2026-10-12');
    expect(live('day30').reviews).toHaveLength(4);
    const before = derive(ctx.model, { settings: DEFAULT_USER_SETTINGS, approved: false, approvedSettings: null, overrides: {}, killed: false, moment: 'before' });
    expect(before.reviews).toHaveLength(0);
  });
  it('reviews come from measured data and offer the creator fix as an approvable change', () => {
    const w2 = live('day20').reviews[0];
    expect(w2.dataDays).toBe(14);
    expect(w2.items.some((i) => i.kind === 'creator' && i.action?.type === 'creator')).toBe(true);
    expect(w2.items.some((i) => i.kind === 'budget')).toBe(true);
    expect(w2.items.filter((i) => i.group).length).toBe(6);
    const fixed = live('day20', { creatorFix: 'limited' }).reviews[0];
    expect(fixed.items.some((i) => i.kind === 'creator')).toBe(false);
  });
  it('no verdicts before day 14 (week 1 is an early read)', () => {
    const w1 = live('day20').reviews.find((r) => r.week === 1)!;
    expect(w1.items.filter((i) => i.group && i.kind !== 'control').every((i) => i.kind === 'early')).toBe(true);
    expect(w1.items.every((i) => !/\d{3,} more days/.test(i.detail))).toBe(true);
  });
  it('week 3 review (12 Oct) flags the festive drop starting 16 Oct', () => {
    const w3 = live('day30').reviews.find((r) => r.week === 3)!;
    expect(w3.items.some((i) => i.kind === 'festive')).toBe(true);
  });
  it('days to prove shrinks as data grows and is null without lift', () => {
    expect(daysToProve(-0.02, 0.1, 20)).toBeGreaterThan(0);
    expect(daysToProve(0.01, 0.1, 20)).toBe(0);
    expect(daysToProve(-0.1, -0.01, 20)).toBeNull();
  });
  it('alerts: opportunity before approval; review, pilot and festive prompts after', () => {
    const before = derive(ctx.model, { settings: DEFAULT_USER_SETTINGS, approved: false, approvedSettings: null, overrides: {}, killed: false, moment: 'before' });
    expect(before.alerts[0].title).toContain(inr(Math.abs(before.a10.profit)));
    const ids = live('day20').alerts.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['review-w2', 'festive', 'pilot-10', 'nearbe-new_organic']));
    expect(live('day30').alerts.map((a) => a.id)).toContain('pilot-decision');
  });
  it('pilot decision at day 30 uses the lower bound for the fee', () => {
    const p = live('day30').pilot;
    expect(p.days).toBe(30);
    expect(p.fee.fee).toBeLessThanOrEqual(p.fee.cap + 1e-9);
    expect(p.extraOrdersLow).toBeLessThan(p.extraOrders);
  });
  it('signals, eligibility, strategies and experiments are computed', () => {
    const d = live('day20');
    expect(d.signals.filter((s) => s.breached).length).toBeGreaterThanOrEqual(3);
    expect(d.eligibility.every((e) => e.ok)).toBe(true);
    // v2: same shoppers (90%), same budget cap, same kept rate and margin; Smart Offers wins at the default margin.
    expect(d.strategies.map((s) => Math.round(s.profit))).toEqual([-17174, 5915, 22595]);
    expect(d.comparison.verdict).toBe('ai_wins');
    for (const s of d.comparison.rows) expect(s.spend).toBeLessThanOrEqual(d.comparison.budget + 1e-6);
    expect(d.experiments.length).toBeGreaterThanOrEqual(3);
    expect(Math.round(d.holdoutCostMonth)).toBe(Math.round(d.draft.profit / 9));
  });
  it('prediction accuracy compares similar-store priors with measured ranges', () => {
    const d = live('day20');
    const rows = accuracyRows(ctx.model.groups, d.snapshots.day20, ctx.model.pool.p25, ctx.model.pool.p75);
    expect(rows).toHaveLength(4);
    const s = accuracySummary(rows);
    expect(s.inside).toBe(4);
  });
});
