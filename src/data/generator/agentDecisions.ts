/**
 * v2 §9 — SYNTHETIC, seeded requests from other Razorpay agents (Cart Abandonment) asking Smart Offers
 * whether to offer a discount. Recovery rates are illustrative assumptions for this concept, labelled as such.
 */
import { mulberry32, hashId, pick, type Rng } from '../../lib/rng';
import type { GroupId, OfferId } from '../types';

/** Abandoned-cart recovery within 72 h: without a discount vs with the group's offer (illustrative). */
export const RECOVERY: Record<GroupId, { without: number; withOffer: number }> = {
  new_ads_small: { without: 0.12, withOffer: 0.17 },
  new_ads_big: { without: 0.14, withOffer: 0.19 },
  new_creator: { without: 0.2, withOffer: 0.22 },
  new_organic: { without: 0.16, withOffer: 0.2 },
  returning: { without: 0.38, withOffer: 0.4 },
  lapsed: { without: 0.15, withOffer: 0.21 },
};
/** Share of abandoned carts the Cart Abandonment agent can reach (has consent to message). */
export const REACHABLE_SHARE = 0.6;

export type AgentRequest = {
  id: string; at: number; agent: 'Cart Abandonment'; group: GroupId; customerId: string; shopper?: string;
  cartInr: number; asked: OfferId; askedText: string; holdout: boolean;
};

const ASK: Record<GroupId, { offer: OfferId; text: string }> = {
  new_ads_small: { offer: 'free_shipping', text: 'Free shipping to come back?' },
  new_ads_big: { offer: 'flat_200', text: '₹200 off to come back?' },
  new_creator: { offer: 'flat_100', text: '₹100 off to come back?' },
  new_organic: { offer: 'free_shipping', text: 'Free shipping to come back?' },
  returning: { offer: 'flat_100', text: '₹100 loyalty discount?' },
  lapsed: { offer: 'flat_100', text: '₹100 off to win back?' },
};

const rid = (r: Rng) => Array.from({ length: 10 }, () => pick(r, 'abcdefghjkmnpqrstuvwxyz23456789'.split(''))).join('');

/** One month of requests ending at `endUnix`, sized from each group's abandoned checkouts. */
export function generateRequests(groups: { id: GroupId; checkouts: number; baseConversion: number; aovInr: number }[], endUnix: number): AgentRequest[] {
  const r = mulberry32(20261011);
  const out: AgentRequest[] = [];
  for (const g of groups) {
    const n = Math.round(g.checkouts * (1 - g.baseConversion) * REACHABLE_SHARE);
    for (let i = 0; i < n; i++) {
      const customerId = `cust_${rid(r)}`;
      const cart = Math.max(399, Math.round((g.aovInr * (0.6 + r() * 0.8)) / 10) * 10 - 1);
      out.push({ id: `req_${rid(r)}`, at: endUnix - Math.floor(r() * 30 * 86400), agent: 'Cart Abandonment', group: g.id, customerId, cartInr: cart, asked: ASK[g.id].offer, askedText: ASK[g.id].text, holdout: hashId(customerId) % 10 === 0 });
    }
  }
  // The example from the spec: Neha (a sample returning shopper), most recent.
  out.push({ id: 'req_n3h4k7q2mx', at: endUnix - 3600, agent: 'Cart Abandonment', group: 'returning', customerId: 'cust_neha_sample', shopper: 'Neha', cartInr: 1699, asked: 'flat_100', askedText: ASK.returning.text, holdout: false });
  return out.sort((a, b) => b.at - a.at);
}
