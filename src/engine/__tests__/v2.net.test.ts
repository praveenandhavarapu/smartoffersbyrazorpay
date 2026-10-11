/** v2 Phase 1 QA (spec §15: 1, 4, 5, 7) — net-of-returns money model. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { testCtx } from '../../test/ctx';
import { derive, SNAP_DAYS, type SnapKey } from '../../state/derived';
import { DEFAULT_USER_SETTINGS } from '../../state/store';
import { KEPT_RATE_DATA, keptRate, costPerExtraOrder, netProfit, netReturn, earnedPerExtraOrder } from '../net';
import { compareStrategies } from '../compare';
import { inr, inrSigned, xr } from '../../lib/format';
import type { RayCtx } from '../../ray/tools';

let ctx: RayCtx;
beforeAll(async () => { ctx = await testCtx(); });
const live = (moment: 'day20' | 'day30' = 'day20') => derive(ctx.model, { settings: DEFAULT_USER_SETTINGS, approved: true, approvedSettings: DEFAULT_USER_SETTINGS, overrides: {}, killed: false, moment, creatorFix: 'pending' });
const DAYS = Object.keys(SNAP_DAYS) as SnapKey[];

describe('v2 formulas (§3.1) and the §3.2 sanity checks', () => {
  it('kept rate comes from the data (returns, COD share, failed COD) and is 81%', () => {
    expect(KEPT_RATE_DATA).toBe(0.81);
    expect(keptRate()).toBe(0.81);
    expect(DEFAULT_USER_SETTINGS.keepPer1000).toBe(500);
  });
  it('ALPHA10 last month: 1.66x after returns vs 2.00x break-even, about −₹31,900', () => {
    const d = live();
    expect(d.breakEven).toBeCloseTo(2, 9);
    expect(Number(d.a10.ret.toFixed(2))).toBe(1.66);
    expect(Math.round(d.a10.profit)).toBe(-31943);
    expect(d.a10.profit).toBeCloseTo(netProfit(d.a10.extraSales, d.a10.spend, 0.5), 6);
    expect(d.a10.ret).toBeCloseTo(netReturn(d.a10.extraSales, d.a10.spend), 9);
  });
  it('plan v1 keeps the same offers and makes about +₹22,600 a month', () => {
    const d = live();
    expect(d.live.rows.map((r) => r.offer)).toEqual(['free_shipping', 'flat_200', 'none', 'free_shipping', 'none', 'flat_100']);
    expect(Math.round(d.live.spend)).toBe(94665);
    expect(Math.round(d.live.profit)).toBe(22595);
  });
  it('day 20: about +₹20,100, 2.63x after returns, ₹473 per extra order; organic near break-even', () => {
    const s = live().snapshots.day20;
    expect(Math.round(s.profit)).toBe(20071);
    expect(Number(s.ret.toFixed(2))).toBe(2.63);
    expect(Math.round(s.metrics.costPerExtraOrder!)).toBe(473);
    const org = s.rows.find((r) => r.group === 'new_organic')!;
    expect(Math.round(org.extraSales * 0.81 * 0.5 - org.spend)).toBe(314);
    expect(s.nearBreakEven.map((r) => r.group)).toContain('new_organic');
  });
  it('earned per extra order uses the store AOV after returns', () => {
    const d = live();
    expect(d.earnedPerOrder).toBeCloseTo(earnedPerExtraOrder(d.store.aov, 0.5), 9);
    expect(Math.round(d.earnedPerOrder)).toBe(614);
    expect(Math.round(d.a10CostPerOrder!)).toBe(730);
    expect(costPerExtraOrder(100, 0)).toBeNull();
  });
});

describe('QA 1: group sums equal totals on every day view', () => {
  it.each(DAYS)('%s', (k) => {
    const s = live('day30').snapshots[k];
    const offerRows = s.rows.filter((r) => r.offer !== 'none');
    expect(offerRows.reduce((a, r) => a + r.spend, 0)).toBeCloseTo(s.spend, 6);
    expect(offerRows.reduce((a, r) => a + r.extraSales, 0)).toBeCloseTo(s.extraSales, 6);
    expect(s.rows.filter((r) => r.offer === 'none').every((r) => r.spend === 0 && r.extraSales === 0)).toBe(true);
  });
});

describe('QA 4: ALPHA10, simple rule and Smart Offers on the same basis', () => {
  it('same kept rate, margin, budget cap and 90% of shoppers', () => {
    const d = live();
    const c = compareStrategies(ctx.model.groups, d.live);
    expect(c.coverage).toBe(0.9);
    expect(c.budget).toBe(d.liveSettings.budget);
    for (const r of c.rows) expect(r.spend).toBeLessThanOrEqual(c.budget + 1e-6);
    // Rebuild each row's profit from its own spend and return with the same margin: identical basis.
    for (const r of c.rows) expect(r.profit).toBeCloseTo((r.ret * r.spend * 0.5) - r.spend, 4);
  });
  it('copy turns honest when a rule ties or wins (thin margin)', () => {
    const thin = derive(ctx.model, { settings: { ...DEFAULT_USER_SETTINGS, keepPer1000: 380 }, approved: false, approvedSettings: null, overrides: {}, killed: false, moment: 'before' });
    expect(['ai_wins', 'tie', 'rule_wins']).toContain(thin.draftComparison.verdict);
  });
});

describe('QA 5: no-offer control groups stay within ±3 pp', () => {
  it.each(DAYS)('%s', (k) => {
    for (const r of live('day30').snapshots[k].rows.filter((x) => x.offer === 'none')) {
      expect(Math.abs(r.treatedRate - r.holdoutRate) * 100).toBeLessThanOrEqual(3);
    }
  });
  it('in every weekly review', () => {
    for (const rv of live('day30').reviews) {
      for (const i of rv.items.filter((x) => x.kind === 'control')) {
        const [a, b] = (i.detail.match(/(\d+\.\d)% vs (\d+\.\d)%/) ?? []).slice(1).map(Number);
        expect(Math.abs(a - b)).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('QA 7: no hard-coded engine figures in UI, Ray copy or tour captions', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
    return /\.(tsx?|ts)$/.test(f) ? [p] : [];
  });
  it('engine outputs never appear as literals', () => {
    const d = live();
    const s = d.snapshots.day20;
    const figures = [
      inr(Math.abs(d.a10.profit)), inrSigned(d.live.profit), inrSigned(s.profit), inr(s.metrics.costPerExtraOrder!), inr(d.a10CostPerOrder!),
      inr(d.earnedPerOrder), xr(d.a10.ret), xr(s.ret), xr(d.live.ret), '33,845', '21,147', '19,034',
    ].map((x) => x.replace(/^[+−]/, ''));
    const offenders: string[] = [];
    for (const f of [...files('src/ui'), ...files('src/ray')]) {
      const text = readFileSync(f, 'utf8');
      for (const fig of figures) if (text.includes(fig)) offenders.push(`${f}: ${fig}`);
    }
    expect(offenders).toEqual([]);
  });
});
