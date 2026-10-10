import { generateLedger, LEDGER_FROM, LEDGER_TO, istDay, FEE_RATE } from '../generator/ledger';
import { ledgerView, paymentSummary, lastDays, settlementSummary, unsettledBalance } from '../ledgerQueries';
import { generateAlpha } from '../generator/alpha';
import { toUnix } from '../../lib/dates';

const L = generateLedger();
const captured = L.payments.filter((p) => p.captured);

describe('six-month ledger', () => {
  it('covers 11 Apr – 10 Oct 2026', () => {
    expect(istDay(L.payments[0].created_at)).toBeLessThanOrEqual(istDay(toUnix(LEDGER_FROM)) + 1);
    expect(L.payments[L.payments.length - 1].created_at).toBeLessThan(toUnix(LEDGER_TO) + 86400);
  });
  it('method mix: UPI ~50%, card 30–40%, netbanking + wallet ~10%', () => {
    const share = (m: string) => captured.filter((p) => p.method === m).length / captured.length;
    expect(share('upi')).toBeGreaterThan(0.46); expect(share('upi')).toBeLessThan(0.54);
    expect(share('card')).toBeGreaterThan(0.3); expect(share('card')).toBeLessThan(0.44);
    expect(share('netbanking') + share('wallet')).toBeGreaterThan(0.07); expect(share('netbanking') + share('wallet')).toBeLessThan(0.13);
  });
  it('fees are 2% plus 18% GST on the fee', () => {
    for (const p of captured.slice(0, 200)) { expect(p.fee).toBe(Math.round(p.amount * FEE_RATE)); expect(p.tax).toBe(Math.round(p.fee! * 0.18)); }
  });
  it('has a few failed payments, refunds and disputes', () => {
    const failed = L.payments.filter((p) => p.status === 'failed').length / L.payments.length;
    expect(failed).toBeGreaterThan(0.03); expect(failed).toBeLessThan(0.09);
    expect(L.refunds.length / captured.length).toBeLessThan(0.05);
    expect(L.refunds.length).toBeGreaterThan(20);
    expect(L.disputes.length).toBe(6);
  });
  it('T+1 settlements net fees, GST and refunds exactly', () => {
    const total = L.settlements.reduce((a, s) => a + s.amount, 0);
    const expected = captured.reduce((a, p) => a + p.amount - p.fee! - p.tax!, 0) - L.refunds.reduce((a, f) => a + f.amount, 0);
    expect(total).toBe(expected);
    for (const s of L.settlements.slice(0, 20)) expect(s.created_at - s.covers.from).toBe(86400 + 10 * 3600);
  });
  it('reuses the exact-count Alpha orders for 22 Aug – 10 Oct', () => {
    const ids = new Set(L.orders.map((o) => o.id));
    expect(generateAlpha().orders.every((o) => ids.has(o.id))).toBe(true);
  });
  it('the demo date hides the future', () => {
    const before = ledgerView('before');
    expect(before.payments.every((p) => p.created_at < toUnix('2026-09-21'))).toBe(true);
    expect(before.payments.some((p) => p.offer_id)).toBe(false);
    const after = ledgerView('day20');
    expect(after.payments.some((p) => p.offer_id)).toBe(true);
    const s = paymentSummary(after, lastDays(after, 5));
    expect(s.capturedCount).toBeGreaterThan(100);
    expect(settlementSummary(after, lastDays(after, 5)).count).toBe(5);
    expect(unsettledBalance(after, [])).toBeGreaterThan(0);
  });
});
