/**
 * Net-of-returns money model (v2 spec §3.1). Implemented once; every surface reads these.
 *   marginRate          = keepPer1000 / 1000
 *   keptRate            = share of extra sales kept after returns and failed COD
 *   netReturn           = extraSales × keptRate / spend          ("Return after returns")
 *   breakEven           = 1 / marginRate
 *   netProfit           = extraSales × keptRate × marginRate − spend
 *   earnedPerExtraOrder = aov × keptRate × marginRate
 *   costPerExtraOrder   = spend / extraOrders                     (the hero metric)
 *   leakedRupees        = spend × baselineConv / treatedConv      (discount paid to buyers who'd buy anyway)
 * Discounts on returned orders are still counted as spend (conservative).
 */
import { AFTER_DELIVERY, PROFILE } from '../data/fixtures';
import { FEATURES } from '../config/features';
import { roundHalfEven } from '../lib/format';

/** Alpha's last 90 days: (1 − COD share × failed-COD rate) × (1 − return rate), to 2 dp (0.81). */
export const KEPT_RATE_DATA = roundHalfEven((1 - (PROFILE.codSharePct / 100) * AFTER_DELIVERY.rtoRateOfCod) * (1 - AFTER_DELIVERY.returnRate), 2);

/** 1 when the netReturns flag is off (v1 maths). */
export const keptRate = (): number => (FEATURES.netReturns ? KEPT_RATE_DATA : 1);

/** Default "what you keep from a ₹1,000 sale": ₹500 in v2 (apparel gross margin 50–70% minus ~10% costs), ₹400 in v1. */
export const DEFAULT_KEEP_PER_1000 = FEATURES.netReturns ? 500 : 400;

export const marginRate = (keepPer1000: number): number => keepPer1000 / 1000;
export const breakEvenNet = (margin: number): number => 1 / margin;
export const netReturn = (extraSales: number, spend: number, kept = keptRate()): number => (spend ? (extraSales * kept) / spend : 0);
export const netProfit = (extraSales: number, spend: number, margin: number, kept = keptRate()): number => extraSales * kept * margin - spend;
export const earnedPerExtraOrder = (aov: number, margin: number, kept = keptRate()): number => aov * kept * margin;
/** null when there are no extra orders (nothing to divide by). */
export const costPerExtraOrder = (spend: number, extraOrders: number): number | null => (extraOrders > 1e-9 ? spend / extraOrders : null);
export const leakedRupees = (spend: number, baselineConv: number, treatedConv: number): number => (treatedConv > 0 ? (spend * baselineConv) / treatedConv : 0);

/** Label for returns everywhere ("Return after returns" in v2). */
export const RETURN_LABEL = FEATURES.netReturns ? 'Return after returns' : 'Return';

/** One day's money view, shared by Results, Home, Agent Studio, Impact, weekly reviews and Ray (single source). */
export type DayMetrics = {
  days: number;
  spend: number;
  extraSales: number;
  keptSales: number;
  extraOrders: number;
  extraOrdersLow: number;
  extraOrdersHigh: number;
  netReturn: number;
  netReturnLow: number;
  netReturnHigh: number;
  netProfit: number;
  netProfitMonth: number;
  costPerExtraOrder: number | null;
  earnedPerExtraOrder: number;
  leaked: number;
};

type SnapLike = {
  days: number; spend: number; extraSales: number; extraOrders: number; extraOrdersLow: number; extraOrdersHigh: number;
  ret: number; retLow: number; retHigh: number; profit: number;
  rows: { offer: string; spend: number; treatedRate: number; holdoutRate: number }[];
};

/** Snapshots from measure() are already net of keptRate; this adds the per-order view. */
export function dayMetrics(s: SnapLike, aov: number, margin: number, kept = keptRate()): DayMetrics {
  const leaked = s.rows.reduce((a, r) => a + (r.offer === 'none' ? 0 : leakedRupees(r.spend, r.holdoutRate, r.treatedRate)), 0);
  return {
    days: s.days, spend: s.spend, extraSales: s.extraSales, keptSales: s.extraSales * kept,
    extraOrders: s.extraOrders, extraOrdersLow: s.extraOrdersLow, extraOrdersHigh: s.extraOrdersHigh,
    netReturn: s.ret, netReturnLow: s.retLow, netReturnHigh: s.retHigh,
    netProfit: s.profit, netProfitMonth: (s.profit * 30) / s.days,
    costPerExtraOrder: costPerExtraOrder(s.spend, s.extraOrders), earnedPerExtraOrder: earnedPerExtraOrder(aov, margin, kept), leaked,
  };
}
