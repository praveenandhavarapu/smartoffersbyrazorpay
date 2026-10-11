/**
 * v2 §10 — payment-aware offers. A blanket prepaid discount pays everyone who'd prepay anyway;
 * value comes only from shoppers it moves from COD to prepaid (fewer failed deliveries).
 *   valuePerSwitch = (rtoCod − rtoPrepaid) × (rtoCost + recoveredSaleShare × aov × marginRate)
 *   cost = nudge × p1 × orders ;  benefit = (p1 − p0) × orders × valuePerSwitch
 */
import { AFTER_DELIVERY } from '../data/fixtures';
import type { GroupId, GroupStats } from '../data/types';

/** Failed-COD rate is the store's own (fixture); the rest are labelled assumptions; p0 → p1 are synthetic. */
export const PREPAID = {
  nudgeInr: 50,
  rtoCod: AFTER_DELIVERY.rtoRateOfCod,
  rtoPrepaid: 0.04,
  rtoCostInr: 160,
  recoveredSaleShare: 0.5,
  share: {
    new_ads_small: [0.2, 0.4], new_ads_big: [0.45, 0.58], new_creator: [0.4, 0.52],
    new_organic: [0.5, 0.6], returning: [0.65, 0.7], lapsed: [0.35, 0.5],
  } as Record<GroupId, [number, number]>,
};

export const valuePerSwitch = (aov: number, margin: number): number =>
  (PREPAID.rtoCod - PREPAID.rtoPrepaid) * (PREPAID.rtoCostInr + PREPAID.recoveredSaleShare * aov * margin);

export type PrepaidRow = { group: GroupId; orders: number; p0: number; p1: number; valuePerSwitch: number; cost: number; benefit: number; net: number; pays: boolean };

/** A blanket ₹50 prepaid discount, group by group, for a month of orders. */
export function blanketPrepaid(groups: GroupStats[], margin: number): { rows: PrepaidRow[]; net: number; paying: GroupId[]; losing: GroupId[] } {
  const rows = groups.map((g) => {
    const [p0, p1] = PREPAID.share[g.id];
    const orders = g.checkouts * g.baseConversion;
    const vps = valuePerSwitch(g.aovInr, margin);
    const cost = PREPAID.nudgeInr * p1 * orders;
    const benefit = (p1 - p0) * orders * vps;
    return { group: g.id, orders, p0, p1, valuePerSwitch: vps, cost, benefit, net: benefit - cost, pays: benefit > cost };
  });
  return { rows, net: rows.reduce((a, r) => a + r.net, 0), paying: rows.filter((r) => r.pays).map((r) => r.group), losing: rows.filter((r) => !r.pays).map((r) => r.group) };
}

/** Failed deliveries avoided per 100 orders when a variant moves shoppers from p0 to p1 prepaid. */
export const rtoSavedPer100 = (g: GroupId, prepaidOnly: boolean): number => {
  if (!prepaidOnly) return 0;
  const [p0, p1] = PREPAID.share[g];
  return (p1 - p0) * (PREPAID.rtoCod - PREPAID.rtoPrepaid) * 100;
};

/** Prepaid share of buyers under a prepaid-only offer (the cost share of "Free shipping, prepaid only"). */
export const prepaidShareWithNudge = (g: GroupId): number => PREPAID.share[g][1];
