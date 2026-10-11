/** Economics per eligible checkout (SPEC 6.1). Pure functions; all money in rupees, unrounded. */
import { OFFER_BY_ID } from '../data/fixtures';
import type { GroupStats, OfferId } from '../data/types';

export type Econ = { offer: OfferId; lift: number; p: number; spend: number; extraSales: number; profit: number; ret: number };

export const NONE_ECON: Econ = { offer: 'none', lift: 0, p: 0, spend: 0, extraSales: 0, profit: 0, ret: 0 };

/**
 * liftPp overrides the group's prior (used for ranges and blended lifts).
 * kept = share of extra sales kept after returns and failed COD (v2; 1 = v1 maths). Profit and return are net of it.
 */
export function perCheckout(g: GroupStats, offer: OfferId, margin: number, liftPp?: number, kept = 1): Econ {
  if (offer === 'none') return { ...NONE_ECON, p: g.baseConversion };
  const lift = (liftPp ?? g.priorLiftsPp[offer] ?? 0) / 100;
  const cost = OFFER_BY_ID[offer].costPerOrderInr;
  const p = g.baseConversion + lift; // buy rate with the offer
  const spend = p * cost; // the discount is paid to EVERY buyer
  const extraSales = lift * g.aovInr; // only extra buyers create value
  const profit = extraSales * kept * margin - spend;
  return { offer, lift, p, spend, extraSales, profit, ret: spend ? (extraSales * kept) / spend : 0 };
}

export const breakEven = (margin: number): number => 1 / margin;

/** Offers this group has a prior for (fixture order), filtered by what the merchant allows. */
export function candidateOffers(g: GroupStats, allowed?: readonly OfferId[]): OfferId[] {
  return (Object.keys(g.priorLiftsPp) as OfferId[]).filter((o) => !allowed || allowed.includes(o));
}
