/** v2 Phase 3 QA (spec §7, §15 item 8): Suggest → Test → Prove → Promote. */
import { testCtx } from '../../test/ctx';
import { derive, pendingActions, type DerivedInput } from '../../state/derived';
import { DEFAULT_USER_SETTINGS } from '../../state/store';
import { KEYS, LEARNING_DAYS, evidenceMode } from '../learning';
import { tools, type RayCtx } from '../../ray/tools';
import type { Model } from '../../state/model';

let ctx: RayCtx;
let model: Model;
beforeAll(async () => { ctx = await testCtx(); model = ctx.model; });
const at = (moment: DerivedInput['moment'], extra: Partial<DerivedInput> = {}) => derive(model, { settings: DEFAULT_USER_SETTINGS, approved: true, approvedSettings: DEFAULT_USER_SETTINGS, overrides: {}, killed: false, moment, creatorFix: 'pending', experimentSpace: true, learningDecisions: {}, undone: [], ...extra });
const PROMOTE = { [KEYS.promoteBig]: 'approved' as const };
const DECLINE = { [KEYS.promoteBig]: 'declined' as const };

describe('timeline (§7.3)', () => {
  it('week 1 starts the ₹150 vs ₹200 challenger without approval; week 2 suggests the playbook test; week 3 proposes promotion', () => {
    const d = at('day30');
    const ev = d.learning!.events;
    const start = ev.find((e) => e.type === 'challenger_started')!;
    expect(start.day).toBe(LEARNING_DAYS.startBig);
    expect(start.needsApproval).toBe(false);
    expect(start.undoable).toBe(true);
    expect(ev.find((e) => e.type === 'playbook_suggestion')!.needsApproval).toBe(true);
    const prop = ev.find((e) => e.type === 'promotion_proposed')!;
    expect(prop.day).toBe(LEARNING_DAYS.promoteBig);
    expect(d.learning!.proposal.verdict).toBe('promote');
    expect(d.learning!.proposal.gapLowPp).toBeLessThan(0); // within noise
    expect(d.learning!.proposal.spendCutPct).toBeGreaterThan(20); // less spend
    expect(d.learning!.proposal.gainMonth).toBeGreaterThan(0);
  });
  it('reviews carry the learning items and approvals', () => {
    const d = at('day30');
    const w3 = d.reviews.find((r) => r.week === 3)!;
    expect(w3.items.some((i) => i.action?.type === 'learning' && i.action.key === KEYS.promoteBig)).toBe(true);
    const w2 = d.reviews.find((r) => r.week === 2)!;
    expect(w2.items.some((i) => i.action?.type === 'learning' && i.action.key === KEYS.organicTest)).toBe(true);
  });
  it('day 20 shows "waiting on you: 2" items (MEERA15 fix and the organic test)', () => {
    const d = at('day20');
    const pending = pendingActions(d.reviews, {});
    expect(pending.map((i) => i.kind).sort()).toEqual(['creator', 'experiment']);
  });
});

describe('QA 8: approving the ₹150 promotion updates day 30/60 everywhere; not approving keeps plan v1', () => {
  it('plan v2 vs plan v1', () => {
    const v1 = at('day30'), no = at('day30', { learningDecisions: DECLINE }), v2 = at('day30', { learningDecisions: PROMOTE });
    expect(v1.live.rows.find((r) => r.group === 'new_ads_big')!.offer).toBe('flat_200');
    expect(no.live.rows.find((r) => r.group === 'new_ads_big')!.offer).toBe('flat_200');
    expect(v2.live.rows.find((r) => r.group === 'new_ads_big')!.offer).toBe('flat_150');
    expect(v2.live.profit).toBeGreaterThan(v1.live.profit);
    expect(v2.live.spend / v2.live.extraOrders).toBeLessThan(v1.live.spend / v1.live.extraOrders);
    expect(v2.liveOffers.new_ads_big).toBe('flat_150');
  });
  it('day 30 and 60 change; day 7–20 do not', () => {
    const no = at('day30', { learningDecisions: DECLINE }), v2 = at('day30', { learningDecisions: PROMOTE });
    for (const k of ['day7', 'day14', 'day20'] as const) expect(v2.snapshots[k].profit).toBeCloseTo(no.snapshots[k].profit, 6);
    for (const k of ['day30', 'day60'] as const) {
      expect(v2.snapshots[k].rows.find((r) => r.group === 'new_ads_big')!.offer).toBe('flat_150');
      expect(v2.snapshots[k].profit).not.toBeCloseTo(no.snapshots[k].profit, 0);
      expect(no.snapshots[k].rows.find((r) => r.group === 'new_ads_big')!.offer).toBe('flat_200');
    }
    expect(v2.pilot.expectedProfitMonth).toBeCloseTo((v2.snapshots.day30.profit * 30) / 30, 6);
  });
  it('every surface reads the same snapshot (Ray included)', () => {
    const v2 = at('day30', { learningDecisions: PROMOTE });
    const c = { ...ctx, derived: v2, approved: true };
    expect(tools.get_results(c, {}).profit).toBe(Math.round(v2.snapshots.day30.profit));
    expect(tools.get_pilot_decision(c).expected_profit_month).toBe(Math.round(v2.pilot.expectedProfitMonth));
  });
  it('the 10% holdout is never used for challengers', () => {
    const no = at('day30', { learningDecisions: DECLINE }), v2 = at('day30', { learningDecisions: PROMOTE });
    for (const k of ['day30', 'day60'] as const) {
      for (const g of no.snapshots[k].rows) {
        const r2 = v2.snapshots[k].rows.find((x) => x.group === g.group)!;
        expect(r2.holdoutCheckouts).toBe(g.holdoutCheckouts);
        expect(r2.holdoutOrders).toBe(g.holdoutOrders);
      }
    }
  });
});

describe('merchant control', () => {
  it('experiment space off, or Undo, means no challenger and no promotion proposal', () => {
    for (const d of [at('day30', { experimentSpace: false }), at('day30', { undone: [KEYS.startBig] })]) {
      expect(d.learning!.events.some((e) => e.type === 'challenger_started' && !d.learning!.flags.bigRunning)).toBe(d.learning!.events.some((e) => e.type === 'challenger_started'));
      expect(d.learning!.events.some((e) => e.type === 'promotion_proposed')).toBe(false);
      expect(d.live.rows.find((r) => r.group === 'new_ads_big')!.offer).toBe('flat_200');
    }
  });
  it('the organic playbook test only runs after approval (not on the menu)', () => {
    expect(at('day30').snapshots.day60.rows.find((r) => r.group === 'new_organic')!.offer).toBe('free_shipping');
    expect(at('day30', { learningDecisions: { [KEYS.organicTest]: 'approved' } }).snapshots.day60.rows.find((r) => r.group === 'new_organic')!.offer).toBe('free_shipping_999');
  });
});

describe('proof mode vs playbook mode (§7.7)', () => {
  it('lapsed and organic run on the playbook; the big ad groups can be proven within 60 days', () => {
    const g = (id: string) => model.groups.find((x) => x.id === id)!;
    expect(evidenceMode(g('lapsed'), 'flat_100').mode).toBe('playbook');
    expect(evidenceMode(g('new_organic'), 'free_shipping').mode).toBe('playbook');
    expect(evidenceMode(g('new_ads_small'), 'free_shipping').mode).toBe('proof');
    expect(evidenceMode(g('new_ads_big'), 'flat_200').mode).toBe('proof');
  });
  it('day 60 flags lapsed lift decay above 40% and schedules a re-test', () => {
    const d = at('day30');
    const decay = d.learning!.events.find((e) => e.type === 'lift_decay')!;
    expect(decay.projected).toBe(true);
    expect(1 - d.learning!.decay.toPp / d.learning!.decay.fromPp).toBeGreaterThan(0.4);
    expect(d.learning!.triggers.find((t) => t.id === 'decay')!.fired).toBe(true);
  });
});
