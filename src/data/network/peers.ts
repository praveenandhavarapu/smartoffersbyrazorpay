/**
 * Privacy-guarded peer benchmarks. The ONLY public door to the network data.
 * Rules (SPEC 8.3): aggregates only; pool >= 20 merchants; no member > 25% of the pooled sample;
 * values rounded to 0.5 pp. Never returns names, ids, sales or any single-merchant value.
 */
import { generateNetwork, isSimilarToAlpha, roundToHalf, weightedPercentile, NETWORK_SIZE } from '../generator/network';
import { FIXTURE_LIFTS } from '../fixtures';
import type { GroupId, OfferId, PeerBenchmark, PeerQuery, PeerRefusal } from '../types';

export const MIN_POOL = 20;
export const MAX_SHARE = 0.25;

export type PeerMember = { sampleSize: number; liftPp: number };

export function peerPrivacyCheck(members: PeerMember[]): { ok: true } | { ok: false; reason: string } {
  if (members.length < MIN_POOL) return { ok: false, reason: `Only ${members.length} similar stores match; at least ${MIN_POOL} are needed to share an average.` };
  const total = members.reduce((a, m) => a + m.sampleSize, 0);
  const top = Math.max(...members.map((m) => m.sampleSize));
  if (total <= 0 || top / total > MAX_SHARE) return { ok: false, reason: 'One store would make up more than 25% of the sample, so the average could reveal it.' };
  return { ok: true };
}

function membersFor(q: PeerQuery): PeerMember[] {
  return generateNetwork()
    .filter(isSimilarToAlpha)
    .filter((m) => (q.filters?.minAgeMonths === undefined || m.ageMonths >= q.filters.minAgeMonths)
      && (q.filters?.checkout === undefined || m.checkout === q.filters.checkout))
    .flatMap((m) => m.tests.filter((t) => t.groupId === q.groupId && t.offerId === q.offerId).map((t) => ({ sampleSize: t.sampleSize, liftPp: t.liftPp })));
}

/** Pure benchmark from members (exported for tests that force small or dominated pools). */
export function benchmarkFromMembers(groupId: GroupId, offerId: OfferId, members: PeerMember[]): PeerBenchmark | PeerRefusal {
  const check = peerPrivacyCheck(members);
  if (!check.ok) return check;
  const xs = members.map((m) => ({ v: m.liftPp, w: m.sampleSize }));
  return {
    ok: true, groupId, offerId,
    poolSize: members.length,
    medianLiftPp: roundToHalf(weightedPercentile(xs, 0.5)),
    p25LiftPp: roundToHalf(weightedPercentile(xs, 0.25)),
    p75LiftPp: roundToHalf(weightedPercentile(xs, 0.75)),
    totalSample: Math.round(members.reduce((a, m) => a + m.sampleSize, 0) / 100) * 100,
  };
}

export function getPeerBenchmark(q: PeerQuery): PeerBenchmark | PeerRefusal {
  if (q.offerId === 'none') return { ok: false, reason: 'No offer means no lift to benchmark.' };
  return benchmarkFromMembers(q.groupId, q.offerId, membersFor(q));
}

/** Count of stores in Alpha's similar pool (aggregate, safe to show). */
export const similarPoolSize = (): number => generateNetwork().filter(isSimilarToAlpha).length;
export const networkSize = (): number => NETWORK_SIZE;

export type LiftTable = Record<GroupId, Partial<Record<OfferId, number>>>;

/** Pool medians / percentiles for every Alpha group x offer (aggregates only). */
export function poolLifts(): { median: LiftTable; p25: LiftTable; p75: LiftTable } {
  const median = {} as LiftTable, p25 = {} as LiftTable, p75 = {} as LiftTable;
  for (const [g, lifts] of Object.entries(FIXTURE_LIFTS) as [GroupId, Partial<Record<OfferId, number>>][]) {
    median[g] = {}; p25[g] = {}; p75[g] = {};
    for (const o of Object.keys(lifts) as OfferId[]) {
      const b = getPeerBenchmark({ groupId: g, offerId: o });
      if (b.ok) { median[g][o] = b.medianLiftPp; p25[g][o] = b.p25LiftPp; p75[g][o] = b.p75LiftPp; }
    }
  }
  return { median, p25, p75 };
}
