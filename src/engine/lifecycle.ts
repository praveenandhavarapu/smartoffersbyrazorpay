/** Pilot decision (day 30), alerts that bring the merchant back, and the strategy comparison for "why AI". */
import type { Snapshot } from './measure';
import { feeBasis } from './measure';

export function pilotDecision(snap: Snapshot, breakEven: number) {
  const fee = feeBasis(snap);
  const monthly = (x: number) => (x * 30) / snap.days;
  const verdict = snap.retLow >= breakEven ? 'profitable_proven' : snap.extraOrdersLow > 0 ? 'orders_proven' : 'not_proven';
  return {
    days: snap.days, fee, verdict,
    expectedProfitMonth: monthly(snap.profit), extraOrders: snap.extraOrders, extraOrdersLow: snap.extraOrdersLow, extraOrdersHigh: snap.extraOrdersHigh,
    ret: snap.ret, retLow: snap.retLow, retHigh: snap.retHigh, spendMonth: monthly(snap.spend),
    feeMonth: monthly(fee.fee),
  };
}

export type Alert = { id: string; tone: 'info' | 'warn' | 'good'; title: string; detail: string; to?: string; ask?: string };

export function strategies(a10Profit: number, ruleProfit: number, planProfit: number, coverage = 0.9) {
  return [
    { id: 'blanket', label: 'ALPHA10 for everyone (today)', profit: a10Profit * coverage },
    { id: 'rule', label: 'Simple rule: ALPHA10 for first orders only', profit: ruleProfit },
    { id: 'ai', label: 'Smart Offers: offer or none per group', profit: planProfit },
  ];
}
