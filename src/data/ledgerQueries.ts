/** Read-side helpers over the ledger, always cut at the demo date (nothing from the "future" shows). */
import { generateLedger, istDay, dayStart, INSTANT_FEE_RATE, type Ledger } from './generator/ledger';
import type { RzpPayment, RzpSettlement } from './types';
import { DEMO_DATES, toUnix, type Moment } from '../lib/dates';

const DAY = 86400;

/** Exclusive cut-off: before approval the demo is on the morning of 21 Sep; afterwards the end of 10 Oct. */
export const cutoffFor = (m: Moment): number => (m === 'before' ? toUnix(DEMO_DATES.before) : toUnix(DEMO_DATES.day20) + DAY);

export type InstantSettlement = { id: string; at: number; amount: number; fee: number };

export type LedgerView = Ledger & { cutoff: number; now: number };

export function ledgerView(m: Moment, instant: InstantSettlement[] = []): LedgerView {
  const L = generateLedger();
  const cutoff = Math.min(cutoffFor(m), L.to);
  const instantRows: RzpSettlement[] = instant.filter((s) => s.at < cutoff + DAY).map((s) => ({
    id: s.id as `setl_${string}`, entity: 'settlement', amount: s.amount - s.fee, fees: s.fee, tax: Math.round(s.fee * 0.18), utr: `INST${s.id.slice(-8)}`,
    status: 'processed', created_at: s.at, covers: { from: s.at, to: s.at, payments: 0, refunds: 0 }, type: 'instant',
  }));
  return {
    ...L,
    cutoff,
    now: cutoff - 1,
    orders: L.orders.filter((o) => o.created_at < cutoff),
    payments: L.payments.filter((p) => p.created_at < cutoff),
    refunds: L.refunds.filter((f) => f.created_at < cutoff),
    disputes: L.disputes.filter((d) => d.created_at < cutoff),
    // A settlement is visible once the day it covers has ended; it is "scheduled" until its payout time passes.
    settlements: [...L.settlements.filter((s) => s.covers.to <= cutoff).map((s) => (s.created_at >= cutoff ? { ...s, status: 'scheduled' as const } : s)), ...instantRows]
      .sort((a, b) => b.created_at - a.created_at),
  };
}

export type Range = { from: number; to: number };

/** "last 5 days" etc., ending at the demo date. */
export function lastDays(v: LedgerView, days: number): Range {
  const endDay = istDay(v.now);
  return { from: dayStart(endDay - days + 1), to: dayStart(endDay + 1) };
}

export const inRange = (t: number, r: Range) => t >= r.from && t < r.to;

export function paymentSummary(v: LedgerView, r: Range) {
  const ps = v.payments.filter((p) => inRange(p.created_at, r));
  const captured = ps.filter((p) => p.captured);
  const failed = ps.filter((p) => p.status === 'failed');
  const refunds = v.refunds.filter((f) => inRange(f.created_at, r));
  const byMethod: Record<RzpPayment['method'], { count: number; amount: number }> = { upi: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, netbanking: { count: 0, amount: 0 }, wallet: { count: 0, amount: 0 } };
  for (const p of captured) { byMethod[p.method].count++; byMethod[p.method].amount += p.amount; }
  const collected = captured.reduce((a, p) => a + p.amount, 0);
  return {
    range: r,
    capturedCount: captured.length,
    collected, // paise
    fees: captured.reduce((a, p) => a + (p.fee ?? 0), 0),
    tax: captured.reduce((a, p) => a + (p.tax ?? 0), 0),
    failedCount: failed.length,
    successRate: ps.length ? captured.length / ps.length : 0,
    refundsCount: refunds.length,
    refunded: refunds.reduce((a, f) => a + f.amount, 0),
    byMethod,
    smartOfferPayments: captured.filter((p) => p.offer_id).length,
  };
}

export function settlementSummary(v: LedgerView, r: Range) {
  const ss = v.settlements.filter((s) => inRange(s.created_at, r));
  const processed = ss.filter((s) => s.status === 'processed');
  const next = v.settlements.filter((s) => s.status === 'scheduled').sort((a, b) => a.created_at - b.created_at)[0] ?? null;
  return { count: processed.length, amount: processed.reduce((a, s) => a + s.amount, 0), fees: processed.reduce((a, s) => a + s.fees + s.tax, 0), settlements: ss, next };
}

/** Captured today, not yet in any settlement (what an instant settlement could pay out now). */
export function unsettledBalance(v: LedgerView, instant: InstantSettlement[]): number {
  const today = dayStart(istDay(v.now));
  const todays = v.payments.filter((p) => p.captured && p.created_at >= today).reduce((a, p) => a + p.amount - (p.fee ?? 0) - (p.tax ?? 0), 0);
  const refundsToday = v.refunds.filter((f) => f.created_at >= today).reduce((a, f) => a + f.amount, 0);
  const alreadyInstant = instant.filter((s) => s.at >= today && s.at < v.cutoff).reduce((a, s) => a + s.amount, 0);
  return Math.max(0, todays - refundsToday - alreadyInstant);
}

export const instantFee = (amountPaise: number): number => Math.round(amountPaise * INSTANT_FEE_RATE);

/** Monthly totals for the six-month chart. */
export function monthly(v: LedgerView) {
  const out = new Map<string, { month: string; collected: number; count: number }>();
  for (const p of v.payments) {
    if (!p.captured) continue;
    const d = new Date((p.created_at + 19800) * 1000);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const m = out.get(k) ?? { month: k, collected: 0, count: 0 };
    m.collected += p.amount; m.count++;
    out.set(k, m);
  }
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export const paise = (p: number): number => p / 100;

/** Day-by-day captured payments for the last N days (IST days, oldest first). */
export function dailySeries(v: LedgerView, days: number) {
  const r = lastDays(v, days);
  const out: { day: number; collected: number; count: number; failed: number; refunded: number }[] = [];
  for (let d = istDay(r.from); d < istDay(r.to); d++) out.push({ day: d, collected: 0, count: 0, failed: 0, refunded: 0 });
  const at = (t: number) => out[istDay(t) - istDay(r.from)];
  for (const p of v.payments) {
    if (!inRange(p.created_at, r)) continue;
    const b = at(p.created_at);
    if (p.captured) { b.collected += p.amount; b.count++; } else if (p.status === 'failed') b.failed++;
  }
  for (const f of v.refunds) if (inRange(f.created_at, r)) at(f.created_at).refunded += f.amount;
  return out;
}
