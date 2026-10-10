import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { CONCEPT_LABEL } from '../components/bits';

describe('app shell', () => {
  it.each(['/', '/ray', '/transactions', '/settlements', '/reports', '/offers', '/offers/smart', '/offers/smart?tab=checkout', '/studio', '/studio/smart-offers', '/settings', '/banking', '/payroll', '/products/invoices'])('renders %s with the concept label and engine numbers', async (path) => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    expect(screen.getAllByText(CONCEPT_LABEL, { exact: false }).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText(/Loading Alpha Apparel/)).toBeNull(), { timeout: 10000 });
  });
  it('home shows the ALPHA10 insight from the engine', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByText(/ALPHA10 lost you ₹33,845 last month/, {}, { timeout: 10000 })).toBeTruthy();
  });
  it('Smart Offers overview shows the insight card', async () => {
    render(<MemoryRouter initialEntries={['/offers/smart']}><App /></MemoryRouter>);
    expect((await screen.findAllByText(/ALPHA10 lost you ₹33,845 last month/, {}, { timeout: 10000 })).length).toBeGreaterThan(0);
  });
});
