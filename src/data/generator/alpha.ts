/**
 * Alpha Apparel generator (seeded, deterministic). Produces Razorpay-shaped raw records for
 * the baseline month (22 Aug – 20 Sep 2026) and pilot days 1–20 (21 Sep – 10 Oct 2026).
 * Counts are exact by construction (see SPEC 5.3) so aggregate.ts reproduces the fixtures.
 */
import { AFTER_DELIVERY, CREATOR_CODES, PILOT_TRUTH, PROFILE, fixtureGroupStats } from '../fixtures';
import { VISIBLE_CATALOG, type Sku } from './catalog';
import { SEED, hashId, mulberry32, normal, pick, randInt, rid, type Rng } from '../../lib/rng';
import { roundHalfUp } from '../../lib/format';
import { BASELINE, PILOT_DAY20, toUnix } from '../../lib/dates';
import type { Arm, CheckoutSession, GroupId, GroupStats, LineItem, OfferId, RzpOrder, RzpPayment } from '../types';

/** Cart value bounds per group (rupees). Keeps generated carts consistent with the group rules. */
const CART_BOUNDS: Record<GroupId, [number, number]> = {
  new_ads_small: [999, 1499],
  new_ads_big: [1500, 3600],
  new_creator: [800, 2400],
  new_organic: [800, 2200],
  returning: [900, 2900],
  lapsed: [800, 2500],
};

export type AlphaData = {
  baseline: CheckoutSession[];
  pilot20: CheckoutSession[];
  orders: RzpOrder[];
  payments: RzpPayment[];
};

function sourceFor(g: GroupId, r: Rng, creatorCode?: string): CheckoutSession['source'] {
  if (g === 'new_ads_small' || g === 'new_ads_big') return { utm_source: r() < 0.72 ? 'instagram' : 'facebook', utm_medium: 'paid' };
  if (g === 'new_creator') return { utm_source: 'creator', creator_code: creatorCode ?? pick(r, CREATOR_CODES).code };
  if (g === 'new_organic') {
    const x = r();
    return x < 0.4 ? { referrer: 'direct' } : x < 0.8 ? { utm_source: 'google', utm_medium: 'organic', referrer: 'search' } : {};
  }
  const x = r();
  return x < 0.35 ? { utm_source: 'instagram', utm_medium: 'paid' } : x < 0.5 ? { utm_source: 'creator' } : x < 0.8 ? { referrer: 'direct' } : { utm_source: 'whatsapp', utm_medium: 'crm' };
}

function daysSince(g: GroupId, r: Rng): number | null {
  if (g === 'returning') return randInt(r, 8, 120);
  if (g === 'lapsed') return randInt(r, 121, 365);
  return null;
}

/** n integer cart values in bounds whose mean is exactly `aov` (rupees). */
function cartValuesWithMean(n: number, aov: number, [lo, hi]: [number, number], r: Rng): number[] {
  const sd = Math.min(aov - lo, hi - aov) / 2;
  const vals = Array.from({ length: n }, () => Math.max(lo, Math.min(hi, Math.round(normal(r, aov, sd)))));
  let diff = aov * n - vals.reduce((a, b) => a + b, 0);
  for (let pass = 0; diff !== 0 && pass < 50; pass++) {
    for (let i = 0; i < n && diff !== 0; i++) {
      const room = diff > 0 ? hi - vals[i] : vals[i] - lo;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), room, 25);
      vals[i] += step;
      diff -= step;
    }
  }
  return vals;
}

function randomCartValue(g: GroupId, aov: number, r: Rng): number {
  const [lo, hi] = CART_BOUNDS[g];
  return Math.max(lo, Math.min(hi, Math.round(normal(r, aov, (hi - lo) / 5))));
}

/** Line items (paise) that add up exactly to `valueInr`. */
function lineItemsFor(valueInr: number, r: Rng): LineItem[] {
  const pool: Sku[] = VISIBLE_CATALOG.filter((s) => s.priceInr <= valueInr + 200);
  const items: Sku[] = [];
  let sum = 0;
  while (items.length < 3) {
    const s = pick(r, pool.length ? pool : VISIBLE_CATALOG);
    items.push(s);
    sum += s.priceInr;
    if (sum >= valueInr * 0.85) break;
  }
  const scale = valueInr / sum;
  let left = valueInr;
  return items.map((s, i) => {
    const price = i === items.length - 1 ? left : Math.round(s.priceInr * scale);
    left -= price;
    return { sku: s.sku, name: s.name, category: s.category, price: price * 100, qty: 1 };
  });
}

function shuffle<T>(xs: T[], r: Rng): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

function customerId(r: Rng, arm: Arm): `cust_${string}` {
  // Rejection sampling so the live hash rule and the exact arm counts agree.
  for (;;) {
    const id = `cust_${rid(r, 14)}` as const;
    const h = hashId(id) % 10 === 0;
    if (arm === 'pre_pilot' || (arm === 'holdout') === h) return id;
  }
}

const phoneMasked = (r: Rng): string => `+91 ${pick(r, ['98', '97', '99', '88', '90', '70', '81'])}••• ••${String(randInt(r, 0, 999)).padStart(3, '0')}`;

function promoFor(code: string | undefined, offer: OfferId, cartInr: number): RzpOrder['promotions'] {
  if (code === 'ALPHA10') return [{ code, type: 'percent', value: 10, discount: Math.min(Math.round(cartInr * 0.1), 200) * 100 }];
  if (code) return [{ code, type: 'percent', value: 15, discount: Math.min(Math.round(cartInr * 0.15), 250) * 100 }];
  if (offer === 'free_shipping') return [{ code: 'SMART_FREESHIP', type: 'free_shipping', value: 0, discount: PROFILE.shippingFeeInr * 100 }];
  if (offer === 'flat_100') return [{ code: 'SMART_100', type: 'flat', value: 10000, discount: 10000 }];
  if (offer === 'flat_200') return [{ code: 'SMART_200', type: 'flat', value: 20000, discount: 20000 }];
  return [];
}

type Slice = { count: number; converted: number; code?: string; arm: Arm; offer: OfferId };

function buildSessions(
  g: GroupStats, slices: Slice[], range: { from: string; to: string }, r: Rng,
  codeQueue: string[], out: { sessions: CheckoutSession[]; orders: RzpOrder[]; payments: RzpPayment[] },
): void {
  const totalConverted = slices.reduce((a, s) => a + s.converted, 0);
  const convertedValues = shuffle(cartValuesWithMean(totalConverted, g.aovInr, CART_BOUNDS[g.id], r), r);
  const t0 = toUnix(range.from);
  const span = toUnix(range.to) + 86400 - t0;
  let ci = 0;
  for (const s of slices) {
    for (let i = 0; i < s.count; i++) {
      const converted = i < s.converted;
      const valueInr = converted ? convertedValues[ci++] : randomCartValue(g.id, g.aovInr, r);
      const creatorCode = s.code && s.code !== 'ALPHA10' && converted ? codeQueue.shift() : undefined;
      const typed = s.code === 'ALPHA10' ? 'ALPHA10' : creatorCode;
      const created = t0 + Math.floor(r() * span);
      const cust = customerId(r, s.arm);
      const session: CheckoutSession = {
        id: `chk_${rid(r)}`,
        created_at: created,
        customer_id: cust,
        is_first_order: g.id.startsWith('new_'),
        days_since_last_order: daysSince(g.id, r),
        source: sourceFor(g.id, r, g.id === 'new_creator' ? creatorCode : undefined),
        cart: { line_items: lineItemsFor(valueInr, r), value: valueInr * 100 },
        group_id: g.id,
        arm: s.arm,
        offer_shown: s.offer,
        converted,
        ...(typed ? { typed_code: typed } : {}),
      };
      if (converted) {
        const promos = promoFor(typed, s.offer, valueInr);
        const discount = promos.reduce((a, p) => a + p.discount, 0);
        const freeShip = promos.some((p) => p.type === 'free_shipping');
        const shipping = valueInr < PROFILE.freeShippingThresholdInr && !freeShip ? PROFILE.shippingFeeInr * 100 : 0;
        const cod = r() < PROFILE.codSharePct / 100;
        const rto = cod && r() < AFTER_DELIVERY.rtoRateOfCod;
        const returned = !rto && r() < AFTER_DELIVERY.returnRate;
        const amount = valueInr * 100 - (freeShip ? 0 : discount) + shipping;
        const orderId = `order_${rid(r)}` as const;
        out.orders.push({
          id: orderId, entity: 'order', amount, amount_paid: cod ? 0 : amount, currency: 'INR',
          receipt: `AA-${created}`, status: cod ? 'created' : 'paid', created_at: created,
          notes: { group_id: g.id, offer_id: s.offer, arm: s.arm, cod, returned, rto },
          line_items_total: valueInr * 100, shipping_fee: shipping, cod_fee: 0, promotions: promos,
          customer: { id: cust, contact_masked: phoneMasked(r) },
        });
        if (!cod) {
          out.payments.push({
            id: `pay_${rid(r)}`, entity: 'payment', amount, currency: 'INR', status: 'captured', order_id: orderId,
            method: pick(r, ['upi', 'upi', 'upi', 'card', 'netbanking', 'wallet'] as const), created_at: created + 30,
          });
        }
        session.order_id = orderId;
      }
      out.sessions.push(session);
    }
  }
}

/** Creator-code uses by new vs returning buyers, from fixtures/creator_codes.json. */
function creatorQueues(r: Rng): { forNew: string[]; forReturning: string[] } {
  const forNew: string[] = [];
  const forReturning: string[] = [];
  for (const c of CREATOR_CODES) {
    for (let i = 0; i < c.uses - c.returningUses; i++) forNew.push(c.code);
    for (let i = 0; i < c.returningUses; i++) forReturning.push(c.code);
  }
  return { forNew: shuffle(forNew, r), forReturning: shuffle(forReturning, r) };
}

/** Exact pilot counts for a group (also used by measure.ts for day 60). */
export function pilotCounts(g: GroupStats, offer: OfferId, actualLiftPp: number, days: number) {
  const n = (g.checkouts * days) / 30;
  const nt = roundHalfUp(n * 0.9);
  const nh = roundHalfUp(n * 0.1);
  const lift = offer === 'none' ? 0 : actualLiftPp / 100;
  return { treatedCheckouts: nt, treatedOrders: roundHalfUp(nt * (g.baseConversion + lift)), holdoutCheckouts: nh, holdoutOrders: roundHalfUp(nh * g.baseConversion) };
}

let cache: AlphaData | null = null;

export function generateAlpha(): AlphaData {
  if (cache) return cache;
  const r = mulberry32(SEED);
  const groups = fixtureGroupStats();
  const base = { sessions: [] as CheckoutSession[], orders: [] as RzpOrder[], payments: [] as RzpPayment[] };
  const queues = creatorQueues(r);

  for (const g of groups) {
    const slices: Slice[] = [];
    let used = 0;
    for (const t of g.today) {
      const count = roundHalfUp(g.checkouts * t.share);
      used += count;
      slices.push({ count, converted: roundHalfUp(count * (g.baseConversion + t.liftPp / 100)), code: t.code, arm: 'pre_pilot', offer: 'none' });
    }
    const rest = g.checkouts - used;
    if (rest > 0) slices.push({ count: rest, converted: roundHalfUp(rest * g.baseConversion), arm: 'pre_pilot', offer: 'none' });
    const q = g.id === 'returning' ? queues.forReturning : queues.forNew;
    buildSessions(g, slices, BASELINE, r, q, base);
  }

  const pilot = { sessions: [] as CheckoutSession[], orders: base.orders, payments: base.payments };
  for (const g of groups) {
    const offer = PILOT_TRUTH.planOffers[g.id];
    const c = pilotCounts(g, offer, PILOT_TRUTH.actualLiftPp[g.id] ?? 0, PILOT_TRUTH.daysElapsed);
    buildSessions(g, [
      { count: c.treatedCheckouts, converted: c.treatedOrders, arm: 'treated', offer },
      { count: c.holdoutCheckouts, converted: c.holdoutOrders, arm: 'holdout', offer: 'none' },
    ], PILOT_DAY20, r, [], pilot);
  }

  cache = { baseline: base.sessions, pilot20: pilot.sessions, orders: base.orders, payments: base.payments };
  return cache;
}
