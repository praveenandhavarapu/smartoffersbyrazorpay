/** v2 Phase 10 (stretch): leak radar is deterministic and fires on the synthetic ALPHA10 example. */
import { leakRadar, LEAK } from '../leakRadar';

describe('leak radar (§14)', () => {
  it('fires on ALPHA10 last month and is deterministic', () => {
    const a = leakRadar(), b = leakRadar();
    expect(a).toEqual(b);
    expect(a.fired).toBe(true);
    expect(a.share7).toBeGreaterThan(LEAK.alertShare);
    expect(a.shareBefore).toBeLessThan(LEAK.alertShare);
    expect(a.days.reduce((t, d) => t + d.uses, 0)).toBe(a.totalUses);
  });
});
