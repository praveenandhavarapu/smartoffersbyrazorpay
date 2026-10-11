import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { CONCEPT_LABEL } from '../components/bits';
import { loadModel } from '../../state/model';
import { derive } from '../../state/derived';
import { DEFAULT_USER_SETTINGS } from '../../state/store';
import { inr } from '../../lib/format';

/** The headline loss, from the engine (v2 counts returns, so no hard-coded figure here). */
const alpha10Loss = async () => {
  const d = derive(await loadModel(), { settings: DEFAULT_USER_SETTINGS, approved: false, approvedSettings: null, overrides: {}, killed: false, moment: 'before' });
  return new RegExp(`ALPHA10 lost you ${inr(Math.abs(d.a10.profit))} last month`);
};

describe('app shell', () => {
  it.each(['/', '/ray', '/transactions', '/settlements', '/reports', '/offers', '/offers/smart', '/offers/smart?tab=checkout', '/studio', '/studio/smart-offers', '/settings', '/banking', '/payroll', '/products/invoices', '/about', '/studio/smart-offers?tab=reviews', '/studio/smart-offers?tab=impact'])('renders %s with the concept label and engine numbers', async (path) => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    expect(screen.getAllByText(CONCEPT_LABEL, { exact: false }).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText(/Loading Alpha Apparel/)).toBeNull(), { timeout: 10000 });
  });
  it('home shows the ALPHA10 insight from the engine', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByText(await alpha10Loss(), {}, { timeout: 10000 })).toBeTruthy();
  });
  it('Smart Offers overview shows the insight card', async () => {
    render(<MemoryRouter initialEntries={['/offers/smart']}><App /></MemoryRouter>);
    expect((await screen.findAllByText(await alpha10Loss(), {}, { timeout: 10000 })).length).toBeGreaterThan(0);
  });
});

describe('concept brief', () => {
  it('shows how the problem was chosen', async () => {
    render(<MemoryRouter initialEntries={['/about']}><App /></MemoryRouter>);
    expect(await screen.findByText(/How we chose it/, {}, { timeout: 10000 })).toBeTruthy();
    expect(screen.getByText(/What we deliberately did not build/)).toBeTruthy();
  });
});
