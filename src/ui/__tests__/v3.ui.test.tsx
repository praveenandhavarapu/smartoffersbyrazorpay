/** v3 UI: inputs are confirmed before Approve; chat Edit opens inputs inline; recommendations and trade-offs render. */
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { useStore, INPUT_KEYS } from '../../state/store';
import { useChat } from '../../ray/chatStore';

async function page(path: string) {
  cleanup();
  useStore.getState().reset();
  useStore.setState({ rayMode: 'demo' });
  useChat.getState().clear();
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText(/Loading Alpha Apparel/)).toBeNull(), { timeout: 10000 });
}

describe('ask, don\'t assume', () => {
  it('Approve stays disabled until every input is confirmed; "Use these typical values" confirms them', async () => {
    await page('/offers/smart?tab=plan');
    const approve = screen.getByRole('button', { name: /Approve & go live/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toMatch(/Before you approve: 6 of your numbers are not confirmed/);
    fireEvent.click(screen.getByRole('button', { name: 'Use these typical values' }));
    await waitFor(() => expect((screen.getByRole('button', { name: /Approve & go live/ }) as HTMLButtonElement).disabled).toBe(false));
    expect(INPUT_KEYS.every((k) => useStore.getState().confirmed[k] === 'typical')).toBe(true);
  }, 30000);
  it('typing a value marks that input as the merchant\'s own', async () => {
    await page('/offers/smart?tab=plan');
    const setup = document.getElementById('setup-card')!;
    fireEvent.change(within(setup).getAllByRole('spinbutton')[0], { target: { value: '80000' } });
    expect(useStore.getState().confirmed.budget).toBe('merchant');
    expect(useStore.getState().settings.budget).toBe(80000);
  }, 30000);
  it('setup shows the typical range for stores this size', async () => {
    await page('/offers/smart?tab=plan');
    expect(document.getElementById('setup-card')!.textContent).toMatch(/Typical for apparel stores with ₹20–35 lakh monthly sales \(150 stores\)/);
  }, 30000);
});

describe('chat plan card', () => {
  it('Edit opens the inputs inline (it used to be a dead anchor)', async () => {
    await page('/ray?ask=' + encodeURIComponent('Show me the most-profit plan'));
    await waitFor(() => expect(document.getElementById('plan-card')).not.toBeNull(), { timeout: 10000 });
    const card = document.getElementById('plan-card')!;
    expect(card.querySelector('.setup.embedded')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    expect(card.querySelector('.setup.embedded')).not.toBeNull();
  }, 30000);
});

describe('recommended offers and trade-offs', () => {
  it('render on Setup & plan and act as drafts of the merchant\'s settings', async () => {
    await page('/offers/smart?tab=plan');
    const rec = document.getElementById('recommend-card')!;
    expect(rec.textContent).toMatch(/₹150 off/);
    fireEvent.click(within(rec).getAllByRole('button', { name: 'Add to my menu' })[0]);
    expect(useStore.getState().settings.allowedOffers.length).toBe(4);
    const tr = document.getElementById('tradeoff-card')!;
    fireEvent.click(within(tr).getAllByRole('button', { name: 'Use this' })[0]);
    expect(useStore.getState().settings.growth ?? useStore.getState().settings.budget).toBeTruthy();
  }, 30000);
});
