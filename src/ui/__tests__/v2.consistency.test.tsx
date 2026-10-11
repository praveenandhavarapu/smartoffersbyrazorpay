/** v2 Phase 1 QA (spec §15: 2, 6) — the same day shows the same numbers everywhere; no fractional orders. */
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { useStore, DEFAULT_USER_SETTINGS } from '../../state/store';
import { loadModel } from '../../state/model';
import { derive } from '../../state/derived';
import { inrSigned, roundHalfEven, xr } from '../../lib/format';
import { tools } from '../../ray/tools';
import { testCtx } from '../../test/ctx';

const liveState = { approved: true, approvedSettings: DEFAULT_USER_SETTINGS, settings: DEFAULT_USER_SETTINGS, moment: 'day20' as const, snapshot: 'day20' as const, killed: false };

async function day20() {
  const d = derive(await loadModel(), { ...liveState, overrides: {}, creatorFix: 'pending' });
  return { d, s: d.snapshots.day20 };
}
async function page(path: string): Promise<string> {
  cleanup();
  useStore.getState().reset();
  useStore.setState(liveState);
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText(/Loading Alpha Apparel/)).toBeNull(), { timeout: 10000 });
  return document.body.textContent ?? '';
}

describe('QA 2: one day, one set of numbers', () => {
  it('Home, Results, Agent Studio and Impact show the engine values for day 20', async () => {
    const { s } = await day20();
    const profit = inrSigned(s.profit), ret = xr(s.ret);
    const home = await page('/');
    expect(home).toContain(profit); expect(home).toContain(ret);
    const results = await page('/offers/smart');
    expect(results).toContain(profit); expect(results).toContain(ret);
    const studio = await page('/studio/smart-offers');
    expect(studio).toContain(profit);
    const impact = await page('/studio/smart-offers?tab=impact');
    expect(impact).toContain(inrSigned(s.metrics.netProfitMonth)); expect(impact).toContain(ret);
  }, 30000);
  it('Ray and the WhatsApp summary read the same snapshot', async () => {
    const { d, s } = await day20();
    const ctx = { ...(await testCtx()), derived: d, approved: true };
    const r = tools.get_results(ctx, {});
    expect(r.days).toBe(20);
    expect(r.profit).toBe(roundHalfEven(s.profit));
    expect(r.return_x).toBe(roundHalfEven(s.ret, 2));
    expect(r.cost_per_extra_order).toBe(roundHalfEven(s.metrics.costPerExtraOrder!));
    expect(s.weekly.profit).toBeCloseTo((s.profit * 7) / s.days, 9);
    const imp = tools.get_impact_summary(ctx);
    expect(imp.north_star.value).toBe(roundHalfEven(s.metrics.netProfitMonth));
  });
  it('weekly reviews read the same day snapshots as the day toggles', async () => {
    const { d } = await day20();
    const w2 = d.reviews.find((r) => r.week === 2)!;
    const budget = w2.items.find((i) => i.kind === 'budget')!;
    expect(budget.title).toContain(inrSigned((d.snapshots.day14.spend * 30) / 14).replace('+', ''));
  });
});

describe('QA 6: no fractional orders rendered', () => {
  it.each(['/', '/offers/smart', '/studio/smart-offers', '/studio/smart-offers?tab=impact', '/studio/smart-offers?tab=reviews'])('%s', async (path) => {
    const text = await page(path);
    expect(text).not.toMatch(/\b\d+\.\d+ (extra |fewer )?orders\b/);
  }, 20000);
});
