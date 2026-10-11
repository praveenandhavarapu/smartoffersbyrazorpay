/**
 * v2 §14 (stretch) — leak radar for public codes. Real ALPHA10 uses from last month's generated checkouts;
 * the referrer of each use is SYNTHETIC (seeded): after a code lands on a coupon site, more first-time
 * shoppers arrive from deal channels. Alert rule: 7-day coupon-site share above 15%, or first-time uses
 * at 1.5× their earlier level.
 */
import { generateAlpha } from '../data/generator/alpha';
import { mulberry32 } from '../lib/rng';
import { BASELINE, addDays, toUnix } from '../lib/dates';

export const LEAK = { listedOn: '2026-09-08', shareBefore: 0.04, shareAfter: 0.31, alertShare: 0.15, spike: 1.5 } as const;

export type LeakDay = { date: string; uses: number; firstTime: number; fromDeals: number };

export function leakRadar(code = 'ALPHA10') {
  const r = mulberry32(20261012);
  const uses = generateAlpha().baseline.filter((s) => s.typed_code === code && s.converted).sort((a, b) => a.created_at - b.created_at);
  const days: LeakDay[] = [];
  for (let d = BASELINE.from; d <= BASELINE.to; d = addDays(d, 1)) days.push({ date: d, uses: 0, firstTime: 0, fromDeals: 0 });
  for (const s of uses) {
    const date = new Date((s.created_at + 19800) * 1000).toISOString().slice(0, 10);
    const day = days.find((x) => x.date === date);
    if (!day) continue;
    const p = date >= LEAK.listedOn && s.is_first_order ? LEAK.shareAfter : LEAK.shareBefore;
    day.uses++;
    if (s.is_first_order) day.firstTime++;
    if (r() < p) day.fromDeals++;
  }
  const sum = (xs: LeakDay[], k: keyof Omit<LeakDay, 'date'>) => xs.reduce((a, x) => a + x[k], 0);
  const last7 = days.slice(-7), before = days.filter((x) => x.date < LEAK.listedOn);
  const share7 = sum(last7, 'uses') ? sum(last7, 'fromDeals') / sum(last7, 'uses') : 0;
  const shareBefore = sum(before, 'uses') ? sum(before, 'fromDeals') / sum(before, 'uses') : 0;
  const firstPerDayBefore = before.length ? sum(before, 'firstTime') / before.length : 0;
  const firstPerDay7 = sum(last7, 'firstTime') / 7;
  const fired = share7 > LEAK.alertShare || firstPerDay7 >= LEAK.spike * firstPerDayBefore;
  const firstDay = days.find((x) => x.date >= LEAK.listedOn && x.uses && x.fromDeals / x.uses > LEAK.alertShare)?.date ?? null;
  return { code, days, share7, shareBefore, firstPerDay7, firstPerDayBefore, fired, firstDay, totalUses: uses.length, fromDeals: sum(days, 'fromDeals'), endsUnix: toUnix(BASELINE.to) };
}
