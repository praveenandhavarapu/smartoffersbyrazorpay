/** v2 Phase 4 QA: playbook keeps the plan's priors exactly; aggregates only; off-menu offers need approval. */
import { playbook, playbookFor, MIN_STORES, PEER_DEFINITION } from '../network/playbook';
import { poolLifts } from '../network/peers';
import { generateNetwork } from '../generator/network';

describe('playbook (§8)', () => {
  it('keeps the existing prior estimates exactly (median and typical range)', () => {
    const { p25, p75 } = poolLifts();
    const expect3 = (g: Parameters<typeof playbookFor>[0], o: Parameters<typeof playbookFor>[1], med: number, lo: number, hi: number) => {
      expect(playbookFor(g, o)!.medianLiftPp).toBe(med);
      expect(p25[g]?.[o as never]).toBe(lo);
      expect(p75[g]?.[o as never]).toBe(hi);
    };
    expect3('new_ads_small', 'free_shipping', 7.0, 5.5, 8.5);
    expect3('new_ads_big', 'flat_200', 9.0, 7.5, 10.0);
    expect3('new_organic', 'free_shipping', 6.0, 4.5, 7.0);
    expect3('lapsed', 'flat_100', 10.0, 8.5, 11.0);
  });
  it('aggregates of at least 20 stores, no store names, worked-in-tests framing', () => {
    expect(playbook().every((r) => r.storesTested >= MIN_STORES)).toBe(true);
    const text = JSON.stringify(playbook()) + PEER_DEFINITION;
    for (const m of generateNetwork().slice(0, 200)) expect(text).not.toContain(m.name);
    expect(PEER_DEFINITION).toMatch(/not what others charge/);
  });
  it('offers not on the menu are marked for approval', () => {
    expect(playbookFor('new_organic', 'free_shipping_999')!.inMenu).toBe(false);
    expect(playbookFor('new_ads_small', 'free_shipping_prepaid')!.inMenu).toBe(false);
    expect(playbookFor('returning', 'early_access')!.inMenu).toBe(false);
    expect(playbookFor('new_ads_big', 'flat_150')!.inMenu).toBe(true);
  });
});
