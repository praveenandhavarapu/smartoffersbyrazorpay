/** v2 Phase 6 QA: payment-aware offers. */
import { testCtx } from '../../test/ctx';
import { derive } from '../../state/derived';
import { DEFAULT_USER_SETTINGS } from '../../state/store';
import { blanketPrepaid, valuePerSwitch, PREPAID, rtoSavedPer100 } from '../paymentAware';
import { KEYS } from '../learning';
import { AFTER_DELIVERY } from '../../data/fixtures';

describe('payment-aware offers (§10)', () => {
  it('uses the store failed-COD rate and the spec formula', () => {
    expect(PREPAID.rtoCod).toBe(AFTER_DELIVERY.rtoRateOfCod);
    expect(valuePerSwitch(1525, 0.5)).toBeCloseTo((PREPAID.rtoCod - 0.04) * (160 + 0.5 * 1525 * 0.5), 9);
  });
  it('a blanket ₹50 prepaid discount loses money in most groups', async () => {
    const ctx = await testCtx();
    const b = blanketPrepaid(ctx.model.groups, 0.5);
    expect(b.losing.length).toBeGreaterThanOrEqual(5);
    for (const r of b.rows) expect(r.net).toBeCloseTo(r.benefit - r.cost, 9);
    expect(b.rows.find((r) => r.group === 'returning')!.pays).toBe(false);
  });
  it('the prepaid-only challenger keeps one offer per order and only runs after approval', async () => {
    const ctx = await testCtx();
    const base = { settings: DEFAULT_USER_SETTINGS, approved: true, approvedSettings: DEFAULT_USER_SETTINGS, overrides: {}, killed: false, moment: 'day30' as const };
    const off = derive(ctx.model, base);
    expect(off.learning!.rows.find((r) => r.group === 'new_ads_small')!.challenger).toBeNull();
    const on = derive(ctx.model, { ...base, learningDecisions: { [KEYS.prepaidTest]: 'approved' }, learningDecidedOn: { [KEYS.prepaidTest]: 20 } });
    const row = on.learning!.rows.find((r) => r.group === 'new_ads_small')!;
    expect(row.challenger).toBe('free_shipping_prepaid');
    expect(row.startedOn).toBe('2026-10-11');
    expect(row.rto!.challenger).toBeCloseTo(rtoSavedPer100('new_ads_small', true), 9);
    expect(row.rto!.champion).toBe(0);
    expect(on.learning!.segments.new_ads_small.filter((s) => s.from <= 25 && s.to >= 25).reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 9);
  });
});
