import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { benchmarkFromMembers, getPeerBenchmark, peerPrivacyCheck } from '../network/peers';

describe('peer privacy guard', () => {
  it('refuses below 20 merchants', () => {
    const members = Array.from({ length: 19 }, () => ({ sampleSize: 500, liftPp: 5 }));
    expect(peerPrivacyCheck(members).ok).toBe(false);
    expect(benchmarkFromMembers('new_ads_small', 'free_shipping', members).ok).toBe(false);
  });
  it('refuses when one merchant is more than 25% of the sample', () => {
    const members = [...Array.from({ length: 24 }, () => ({ sampleSize: 100, liftPp: 5 })), { sampleSize: 1000, liftPp: 9 }];
    const r = peerPrivacyCheck(members);
    expect(r.ok).toBe(false);
  });
  it('answers the default pool with aggregates only', () => {
    const b = getPeerBenchmark({ groupId: 'new_ads_small', offerId: 'free_shipping' });
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.poolSize).toBeGreaterThanOrEqual(20);
      expect(Object.keys(b).sort()).toEqual(['groupId', 'medianLiftPp', 'offerId', 'ok', 'p25LiftPp', 'p75LiftPp', 'poolSize', 'totalSample'].sort());
      expect(b.medianLiftPp * 2).toBe(Math.round(b.medianLiftPp * 2));
    }
  });
  it('refuses a forced small pool', () => {
    const b = getPeerBenchmark({ groupId: 'lapsed', offerId: 'flat_100', filters: { minAgeMonths: 36 } });
    expect(b.ok).toBe(false);
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe('raw network data is not importable from ui/ or ray/', () => {
  it('no import of generator/network', () => {
    const root = join(__dirname, '..', '..');
    for (const f of [...files(join(root, 'ui')), ...files(join(root, 'ray'))].filter((p) => !p.includes('__tests__'))) {
      const src = readFileSync(f, 'utf8');
      expect(/from\s+['"][^'"]*generator\/network['"]/.test(src), f).toBe(false);
    }
  });
});
