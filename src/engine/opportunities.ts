/** Opportunity detection: the signals Ray watches, each with its value and threshold. */
import type { CodeEconomics } from './scenarios';

export type Signal = { label: string; value: string; threshold: string; breached: boolean };
export type Eligibility = { label: string; value: string; ok: boolean };

export const THRESHOLDS = { returningShareOfSpend: 0.15, creatorReturningShare: 0.3, minCheckouts: 1000, minPool: 20 };

export function couponSignals(a10: CodeEconomics, breakEven: number, creator: { code: string; share: number } | null): Signal[] {
  const ret = a10.rows.find((r) => r.group === 'returning');
  const below = a10.rows.filter((r) => r.ret < breakEven).length;
  const share = ret ? ret.spend / a10.spend : 0;
  const out: Signal[] = [
    { label: 'ALPHA10 return on discount spend', value: `${a10.ret.toFixed(2)}x`, threshold: `break-even ${breakEven.toFixed(2)}x`, breached: a10.ret < breakEven },
    { label: 'Share of ALPHA10 spend on returning buyers', value: `${Math.round(share * 100)}%`, threshold: `alert above ${Math.round(THRESHOLDS.returningShareOfSpend * 100)}%`, breached: share > THRESHOLDS.returningShareOfSpend },
    { label: 'Shopper groups where ALPHA10 is below break-even', value: `${below} of ${a10.rows.length}`, threshold: 'alert at 1 or more', breached: below > 0 },
  ];
  if (creator) out.push({ label: `${creator.code} uses by returning buyers`, value: `${Math.round(creator.share * 100)}%`, threshold: `alert above ${Math.round(THRESHOLDS.creatorReturningShare * 100)}%`, breached: creator.share > THRESHOLDS.creatorReturningShare });
  return out;
}

export function eligibility(opts: { magicCheckout: boolean; checkouts: number; alwaysOnCoupon: boolean; poolSize: number }): Eligibility[] {
  return [
    { label: 'Uses Magic Checkout', value: opts.magicCheckout ? 'Yes' : 'No', ok: opts.magicCheckout },
    { label: 'Checkouts a month', value: opts.checkouts.toLocaleString('en-IN'), ok: opts.checkouts >= THRESHOLDS.minCheckouts },
    { label: 'Runs an always-on coupon', value: opts.alwaysOnCoupon ? 'Yes (ALPHA10)' : 'No', ok: opts.alwaysOnCoupon },
    { label: 'Similar stores to learn from', value: `${opts.poolSize}`, ok: opts.poolSize >= THRESHOLDS.minPool },
  ];
}
