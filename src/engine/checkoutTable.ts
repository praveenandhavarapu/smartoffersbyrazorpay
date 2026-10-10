/**
 * Precomputed checkout lookup (SPEC 6.6). No LLM and no optimisation at checkout time:
 * classify -> holdout hash -> table lookup -> eligibility check.
 */
import { OFFER_BY_ID, PROFILE } from '../data/fixtures';
import type { GroupId, GroupStats, OfferId } from '../data/types';
import { isHoldout } from '../lib/rng';
import { perCheckout } from './economics';

export type Source = 'paid_social' | 'creator' | 'organic';
export type Shopper = {
  id: string;
  name: string;
  customerId: string;
  isFirstOrder: boolean;
  daysSinceLastOrder: number | null;
  source: Source;
  sourceLabel: string;
  creatorCode?: string;
  cart: { name: string; priceInr: number }[];
  typedCode?: string;
};

export type CheckoutTable = { offers: Record<GroupId, OfferId>; paused: boolean };

export type CheckoutDecision = {
  group: GroupId;
  offer: OfferId;
  holdout: boolean;
  savingInr: number;
  reason: string;
  cartInr: number;
  shippingInr: number;
};

export const cartValue = (s: Shopper): number => s.cart.reduce((a, i) => a + i.priceInr, 0);

/** Same rules as the generator. Only allowed signals: first order, recency, source, creator code, cart value. */
export function classify(s: Pick<Shopper, 'isFirstOrder' | 'daysSinceLastOrder' | 'source'>, cartInr: number): GroupId {
  if (!s.isFirstOrder) return (s.daysSinceLastOrder ?? 0) > 120 ? 'lapsed' : 'returning';
  if (s.source === 'paid_social') return cartInr < 1500 ? 'new_ads_small' : 'new_ads_big';
  if (s.source === 'creator') return 'new_creator';
  return 'new_organic';
}

export function eligible(offer: OfferId, cartInr: number): boolean {
  if (offer === 'free_shipping') return cartInr < PROFILE.freeShippingThresholdInr;
  if (offer === 'flat_100') return cartInr >= 999;
  if (offer === 'flat_200') return cartInr >= 1500;
  return true;
}

export function buildCheckoutTable(offers: Record<GroupId, OfferId>, paused = false): CheckoutTable {
  return { offers: { ...offers }, paused };
}

export function decide(table: CheckoutTable, s: Shopper): CheckoutDecision {
  const cartInr = cartValue(s);
  const group = classify(s, cartInr);
  const shipping = cartInr < PROFILE.freeShippingThresholdInr ? PROFILE.shippingFeeInr : 0;
  const base = { group, cartInr, shippingInr: shipping };
  if (isHoldout(s.customerId)) {
    return { ...base, offer: 'none', holdout: true, savingInr: 0, reason: '1 in 10 shoppers sees no offer so we can measure what offers add.' };
  }
  if (table.paused) return { ...base, offer: 'none', holdout: false, savingInr: 0, reason: 'Smart Offers is paused (kill switch). Store default checkout.' };
  if (s.typedCode) return { ...base, offer: 'none', holdout: false, savingInr: 0, reason: `Shopper typed ${s.typedCode}; one offer per order, so the code replaces the Smart Offer.` };
  const offer = table.offers[group];
  if (offer === 'none') return { ...base, offer, holdout: false, savingInr: 0, reason: 'No offer for this group: an offer would not pay back.' };
  if (!eligible(offer, cartInr)) return { ...base, offer: 'none', holdout: false, savingInr: 0, reason: `${OFFER_BY_ID[offer].label} needs ${OFFER_BY_ID[offer].eligibleIf}; this cart does not qualify.` };
  const saving = offer === 'free_shipping' ? shipping : OFFER_BY_ID[offer].costPerOrderInr;
  return { ...base, offer, holdout: false, savingInr: saving, reason: `Group plan: ${OFFER_BY_ID[offer].label}.` };
}

/** Numbers for the "Why" panel. */
export function whyNumbers(g: GroupStats, offer: OfferId, margin: number) {
  const e = perCheckout(g, offer, margin);
  return { withoutRate: g.baseConversion, withRate: offer === 'none' ? g.baseConversion : e.p, costPerOrder: OFFER_BY_ID[offer].costPerOrderInr, ret: e.ret };
}

/** First deterministic id in a series that hashes into the holdout (or not). */
export function idWithHoldout(prefix: string, holdout: boolean): string {
  for (let i = 1; ; i++) {
    const id = `cust_${prefix}${String(i).padStart(4, '0')}`;
    if (isHoldout(id) === holdout) return id;
  }
}

const item = (name: string, priceInr: number) => ({ name, priceInr });

/** Fictional sample shoppers for the simulator. */
export const SAMPLE_SHOPPERS: Shopper[] = [
  { id: 'priya', name: 'Priya', customerId: idWithHoldout('PRIYA', false), isFirstOrder: true, daysSinceLastOrder: null, source: 'paid_social', sourceLabel: 'New · Instagram ad', cart: [item('Oversized Graphic Tee', 1099)] },
  { id: 'rohan', name: 'Rohan', customerId: idWithHoldout('ROHAN', false), isFirstOrder: true, daysSinceLastOrder: null, source: 'paid_social', sourceLabel: 'New · Instagram ad', cart: [item('Cargo Joggers', 1799), item('Drop Shoulder Tee', 699)] },
  { id: 'aisha', name: 'Aisha', customerId: idWithHoldout('AISHA', false), isFirstOrder: true, daysSinceLastOrder: null, source: 'creator', sourceLabel: 'New · via @stylewithmeera link', creatorCode: 'MEERA15', cart: [item('Linen Blend Shirt', 1449)] },
  { id: 'kavya', name: 'Kavya', customerId: idWithHoldout('KAVYA', false), isFirstOrder: true, daysSinceLastOrder: null, source: 'organic', sourceLabel: 'New · organic search', cart: [item('Cropped Boxy Shirt', 1249)] },
  { id: 'neha', name: 'Neha', customerId: idWithHoldout('NEHA', false), isFirstOrder: false, daysSinceLastOrder: 41, source: 'organic', sourceLabel: 'Returning · last order 41 days ago', cart: [item('Parachute Pants', 1699)] },
  { id: 'vikram', name: 'Vikram', customerId: idWithHoldout('VIKRAM', false), isFirstOrder: false, daysSinceLastOrder: 160, source: 'organic', sourceLabel: 'Lapsed · last order 160 days ago', cart: [item('Cuban Collar Shirt', 1399)] },
  { id: 'sameer', name: 'Sameer', customerId: idWithHoldout('SAMEER', true), isFirstOrder: true, daysSinceLastOrder: null, source: 'paid_social', sourceLabel: 'New · Instagram ad · in the holdout', cart: [item('Waffle Knit Henley', 1149)] },
];
