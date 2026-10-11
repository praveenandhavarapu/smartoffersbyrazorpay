/** v2 QA 10–11: checkout decision stays a fast lookup; every route and tab (old and new) loads. */
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { useStore, DEFAULT_USER_SETTINGS } from '../../state/store';
import { buildCheckoutTable, decide, SAMPLE_SHOPPERS } from '../../engine/checkoutTable';
import { CHECKOUT_BUDGET_MS } from '../../engine/guardrails';
import { testCtx } from '../../test/ctx';

describe('QA 10: checkout lookup < 50 ms', () => {
  it('decides from the table well inside the budget', async () => {
    const ctx = await testCtx();
    const table = buildCheckoutTable(ctx.derived.liveOffers);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 2000; i++) for (const s of SAMPLE_SHOPPERS) { decide(table, s); n++; }
    expect((performance.now() - t0) / n).toBeLessThan(CHECKOUT_BUDGET_MS);
  });
});

const ROUTES = ['/', '/ray', '/transactions', '/settlements', '/reports', '/offers', '/offers/smart', '/offers/smart?tab=plan', '/offers/smart?tab=checkout', '/offers/smart?tab=creators',
  '/studio', '/studio/smart-offers', '/studio/smart-offers?tab=reviews', '/studio/smart-offers?tab=experiments', '/studio/smart-offers?tab=impact', '/studio/smart-offers?tab=runs',
  '/studio/smart-offers?tab=transactions', '/studio/smart-offers?tab=guardrails', '/studio/smart-offers?tab=activity', '/settings', '/banking', '/payroll', '/products/invoices', '/about'];

describe('QA 11: every route loads, before and after go-live', () => {
  it.each(ROUTES)('%s', async (path) => {
    for (const live of [false, true]) {
      cleanup();
      useStore.getState().reset();
      if (live) useStore.setState({ approved: true, approvedSettings: DEFAULT_USER_SETTINGS, moment: 'day30', snapshot: 'day30' });
      render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
      await waitFor(() => expect(screen.queryByText(/Loading Alpha Apparel/)).toBeNull(), { timeout: 10000 });
      expect(screen.queryByText(/Page not found/)).toBeNull();
    }
  }, 20000);
});
