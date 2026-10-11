/** v2 QA 9: storage blocked still renders; Reset returns to defaults; tour v2 is ≤ 14 steps with engine captions. */
import { vi } from 'vitest';
import { tourV2Steps } from '../components/tourV2';

describe('storage and tour (§15 item 9)', () => {
  it('renders with localStorage blocked', async () => {
    vi.resetModules();
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      const { default: App } = await import('../../App');
      const { render, screen, waitFor } = await import('@testing-library/react');
      const { MemoryRouter } = await import('react-router-dom');
      const { useStore } = await import('../../state/store');
      render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
      await waitFor(() => expect(screen.queryByText(/Loading Alpha Apparel/)).toBeNull(), { timeout: 10000 });
      expect(document.body.textContent).toMatch(/ALPHA10/);
      useStore.getState().approve(); // writes are swallowed, the demo keeps working for this visit
      expect(useStore.getState().approved).toBe(true);
    } finally {
      if (orig) Object.defineProperty(window, 'localStorage', orig);
    }
  }, 20000);
  it('Reset returns to defaults', async () => {
    const { useStore, DEFAULT_USER_SETTINGS } = await import('../../state/store');
    useStore.getState().approve();
    useStore.getState().setSettings({ budget: 50000 });
    useStore.getState().jump20();
    useStore.getState().reset();
    const s = useStore.getState();
    expect(s.approved).toBe(false);
    expect(s.settings).toEqual(DEFAULT_USER_SETTINGS);
    expect(s.moment).toBe('before');
    expect(s.audit).toEqual([]);
    expect(s.learningDecisions).toEqual({});
  });
  it('tour v2 has at most 14 steps and every caption is a function of the engine', () => {
    const steps = tourV2Steps({ ask: async () => undefined, setShopper: () => undefined });
    expect(steps.length).toBeLessThanOrEqual(14);
    for (const s of steps) expect(typeof s.caption).toBe('function');
  });
});
