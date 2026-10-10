/**
 * Six months of Razorpay-style money movement for Alpha Apparel (seeded, display only):
 * orders, payments (with failed attempts), refunds, disputes and settlements.
 * 22 Aug – 10 Oct 2026 reuses the exact-count orders from alpha.ts so the dashboard and the
 * Smart Offers engine describe the same store. Earlier months are generated with a growth trend.
 * Assumptions agreed with the owner: UPI 50%, card 40%, netbanking + wallet 10%; fee 2% (+18% GST
 * on the fee); settlements T+1, with on-demand instant settlement as an option; a few refunds,
 * failed payments and disputes.
 */
import { generateAlpha, methodFor } from './alpha';
import { CREATOR_CODES, PROFILE } from '../fixtures';
import { mulberry32, normal, pick, randInt, rid, type Rng } from '../../lib/rng';
import { toUnix } from '../../lib/dates';
import type { RzpDispute, RzpOrder, RzpPayment, RzpRefund, RzpSettlement } from '../types';

export const LEDGER_FROM = '2026-04-11';
export const LEDGER_TO = '2026-10-10';
const OLD_TO = '2026-08-21';
export const FEE_RATE = 0.02;
export const GST_ON_FEE = 0.18;
export const INSTANT_FEE_RATE = 0.0025; // demo pricing for on-demand instant settlement
const FAIL_ATTEMPT_RATE = 0.065;
const REFUND_SHARE_OF_RETURNS = 0.3;
const DAY = 86400;
const IST = 19800;

export const istDay = (t: number): number => Math.floor((t + IST) / DAY);
export const dayStart = (d: number): number => d * DAY - IST;

export type Ledger = {
  orders: RzpOrder[];
  payments: RzpPayment[];
  refunds: RzpRefund[];
  disputes: RzpDispute[];
  settlements: RzpSettlement[];
  from: number;
  to: number; // exclusive
};

const BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank'];
const WALLETS = ['Paytm', 'PhonePe', 'Amazon Pay', 'MobiKwik'];
const UPI_HANDLES = ['okhdfcbank', 'okicici', 'oksbi', 'ybl', 'paytm', 'axl'];
const NETWORKS = ['Visa', 'Mastercard', 'RuPay'];
const FAILURES: [string, string][] = [
  ['BAD_REQUEST_ERROR', 'Payment was cancelled by the customer'],
  ['BAD_REQUEST_ERROR', 'UPI collect request expired'],
  ['GATEWAY_ERROR', 'Payment failed: bank server unavailable'],
  ['BAD_REQUEST_ERROR', 'Payment declined: insufficient balance'],
  ['BAD_REQUEST_ERROR', 'Card authentication (OTP) failed'],
];
const DISPUTE_REASONS = ['product_not_received', 'fraudulent', 'duplicate_charge', 'product_unacceptable'];

const maskContact = (r: Rng) => `+91 ${pick(r, ['98', '97', '99', '88', '90', '70', '81'])}••• ••${String(randInt(r, 0, 999)).padStart(3, '0')}`;
const maskEmail = (r: Rng) => `${pick(r, ['a', 'k', 'p', 'r', 's', 'n', 'v', 'm'])}${pick(r, ['a', 'i', 'o', 'e'])}•••@${pick(r, ['gmail.com', 'yahoo.in', 'outlook.com'])}`;

function methodDetails(r: Rng, method: RzpPayment['method']): Partial<RzpPayment> {
  if (method === 'upi') return { vpa: `${pick(r, ['a', 'k', 'p', 'r', 's'])}•••@${pick(r, UPI_HANDLES)}` };
  if (method === 'card') return { card: { network: pick(r, NETWORKS), last4: String(randInt(r, 1000, 9999)), type: r() < 0.55 ? 'debit' : 'credit' } };
  if (method === 'netbanking') return { bank: pick(r, BANKS) };
  return { wallet: pick(r, WALLETS) };
}

/** Older months: orders per month grow from about 1,300 (April) to about 1,780 (August). */
function oldOrders(r: Rng): RzpOrder[] {
  const out: RzpOrder[] = [];
  const d0 = istDay(toUnix(LEDGER_FROM));
  const d1 = istDay(toUnix(OLD_TO));
  for (let d = d0; d <= d1; d++) {
    const progress = (d - d0) / (d1 - d0);
    const monthly = 1300 + 480 * progress;
    const weekday = new Date((d * DAY) * 1000).getUTCDay();
    const factor = weekday === 0 || weekday === 6 ? 1.15 : weekday === 1 ? 0.92 : 1;
    const n = Math.max(0, Math.round((monthly / 30) * factor * (1 + normal(r, 0, 0.08))));
    for (let i = 0; i < n; i++) {
      const created = dayStart(d) + Math.floor(r() * DAY);
      const valueInr = Math.max(299, Math.min(4500, Math.round(normal(r, 1500, 430))));
      const cod = r() < PROFILE.codSharePct / 100;
      const rto = cod && r() < 0.22;
      const returned = !rto && r() < 0.12;
      const x = r();
      const promotions: RzpOrder['promotions'] = x < 0.55
        ? [{ code: 'ALPHA10', type: 'percent', value: 10, discount: Math.min(Math.round(valueInr * 0.1), 200) * 100 }]
        : x < 0.65 ? [{ code: pick(r, CREATOR_CODES).code, type: 'percent', value: 15, discount: Math.min(Math.round(valueInr * 0.15), 250) * 100 }] : [];
      const discount = promotions.reduce((a, p) => a + p.discount, 0);
      const shipping = valueInr < PROFILE.freeShippingThresholdInr ? PROFILE.shippingFeeInr * 100 : 0;
      const amount = valueInr * 100 - discount + shipping;
      out.push({
        id: `order_${rid(r)}`, entity: 'order', amount, amount_paid: cod ? 0 : amount, currency: 'INR', receipt: `AA-${created}`,
        status: cod ? 'created' : 'paid', created_at: created, notes: { cod, returned, rto },
        line_items_total: valueInr * 100, shipping_fee: shipping, cod_fee: 0, promotions,
        customer: { id: `cust_${rid(r)}`, contact_masked: maskContact(r) },
      });
    }
  }
  return out;
}

let cache: Ledger | null = null;

export function generateLedger(): Ledger {
  if (cache) return cache;
  const r = mulberry32(20261010 + 6);
  const alpha = generateAlpha();
  const orders = [...oldOrders(r), ...alpha.orders].sort((a, b) => a.created_at - b.created_at);
  const alphaPay = new Map(alpha.payments.map((p) => [p.order_id, p]));
  const end = toUnix(LEDGER_TO) + DAY;

  const payments: RzpPayment[] = [];
  const refunds: RzpRefund[] = [];
  for (const o of orders) {
    if (o.notes.cod) continue;
    const existing = alphaPay.get(o.id);
    const method = existing?.method ?? methodFor(r());
    const created = existing?.created_at ?? o.created_at + 30;
    const contact = o.customer.contact_masked;
    const email = maskEmail(r);
    if (r() < FAIL_ATTEMPT_RATE) {
      const [code, desc] = pick(r, FAILURES);
      const fm = methodFor(r());
      payments.push({
        id: `pay_${rid(r)}`, entity: 'payment', amount: o.amount, currency: 'INR', status: 'failed', order_id: o.id, method: fm,
        created_at: created - randInt(r, 40, 400), captured: false, fee: 0, tax: 0, amount_refunded: 0, refund_status: null,
        email, contact, error_code: code, error_description: desc, ...methodDetails(r, fm),
      });
    }
    const fee = Math.round(o.amount * FEE_RATE);
    const p: RzpPayment = {
      id: existing?.id ?? `pay_${rid(r)}`, entity: 'payment', amount: o.amount, currency: 'INR', status: 'captured', order_id: o.id, method,
      created_at: created, captured: true, fee, tax: Math.round(fee * GST_ON_FEE), amount_refunded: 0, refund_status: null, email, contact,
      ...methodDetails(r, method),
      ...(o.notes.offer_id && o.notes.offer_id !== 'none' ? { offer_id: o.notes.offer_id } : {}),
    };
    payments.push(p);
    const partial = r() < 0.004;
    if ((o.notes.returned && r() < REFUND_SHARE_OF_RETURNS) || partial) {
      const at = created + randInt(r, 3, 10) * DAY + randInt(r, 0, DAY);
      if (at < end) {
        const amount = partial ? Math.round(o.amount * 0.3) : o.amount;
        refunds.push({
          id: `rfnd_${rid(r)}`, entity: 'refund', amount, currency: 'INR', payment_id: p.id, created_at: at,
          status: 'processed', speed_processed: r() < 0.2 ? 'instant' : 'normal', notes: { reason: partial ? 'Partial: one item returned' : 'Return received' },
        });
        p.amount_refunded = amount;
        p.refund_status = partial ? 'partial' : 'full';
        if (!partial) p.status = 'refunded';
      }
    }
  }
  payments.sort((a, b) => a.created_at - b.created_at);
  refunds.sort((a, b) => a.created_at - b.created_at);

  // A handful of disputes on card payments, spread over the six months.
  const cards = payments.filter((p) => p.method === 'card' && p.status === 'captured');
  const statuses: RzpDispute['status'][] = ['won', 'lost', 'won', 'lost', 'under_review', 'open'];
  const disputes: RzpDispute[] = statuses.map((status, i) => {
    const p = cards[Math.floor(((i + 0.5) / statuses.length) * cards.length)];
    const at = p.created_at + randInt(r, 10, 25) * DAY;
    return { id: `disp_${rid(r)}`, entity: 'dispute', payment_id: p.id, amount: p.amount, currency: 'INR', reason_code: pick(r, DISPUTE_REASONS), status, created_at: Math.min(at, end - DAY), respond_by: Math.min(at, end - DAY) + 7 * DAY };
  });

  // Standard T+1 settlements: each day's captured payments (net of fee + GST) minus refunds, paid next day 10:00 IST.
  const byDay = new Map<number, { net: number; fees: number; tax: number; n: number; refunds: number; nr: number }>();
  const bucket = (d: number) => byDay.get(d) ?? byDay.set(d, { net: 0, fees: 0, tax: 0, n: 0, refunds: 0, nr: 0 }).get(d)!;
  for (const p of payments) {
    if (!p.captured) continue;
    const b = bucket(istDay(p.created_at));
    b.net += p.amount - (p.fee ?? 0) - (p.tax ?? 0); b.fees += p.fee ?? 0; b.tax += p.tax ?? 0; b.n++;
  }
  for (const f of refunds) { const b = bucket(istDay(f.created_at)); b.refunds += f.amount; b.nr++; }
  const settlements: RzpSettlement[] = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, b]) => ({
    id: `setl_${rid(r)}`, entity: 'settlement', amount: b.net - b.refunds, fees: b.fees, tax: b.tax, utr: `UTR${randInt(r, 100000000, 999999999)}${randInt(r, 100, 999)}`,
    status: 'processed', created_at: dayStart(d + 1) + 10 * 3600, covers: { from: dayStart(d), to: dayStart(d + 1), payments: b.n, refunds: b.nr }, type: 'standard',
  }));

  cache = { orders, payments, refunds, disputes, settlements, from: toUnix(LEDGER_FROM), to: end };
  return cache;
}
