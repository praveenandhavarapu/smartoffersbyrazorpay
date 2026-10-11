/** Predicted (similar-store prior) vs measured lift, per offer group. */
import type { GroupStats } from '../data/types';
import type { LiftTable } from '../data/network/peers';
import type { Snapshot } from './measure';

export type AccuracyRow = {
  group: GroupStats['id']; offer: string; priorPp: number; poolLowPp: number | null; poolHighPp: number | null;
  measuredPp: number; lowPp: number; highPp: number; inside: boolean; errorPp: number; proven: boolean;
};

export function accuracyRows(groups: GroupStats[], snap: Snapshot, p25: LiftTable, p75: LiftTable): AccuracyRow[] {
  return snap.rows.filter((r) => r.offer !== 'none').map((r) => {
    const g = groups.find((x) => x.id === r.group)!;
    const prior = g.priorLiftsPp[r.offer] ?? 0;
    const lo = r.liftLow * 100, hi = r.liftHigh * 100;
    return {
      group: r.group, offer: r.offer, priorPp: prior, poolLowPp: p25[r.group]?.[r.offer] ?? null, poolHighPp: p75[r.group]?.[r.offer] ?? null,
      measuredPp: r.lift * 100, lowPp: lo, highPp: hi, inside: prior >= lo && prior <= hi, errorPp: r.lift * 100 - prior, proven: !r.stillLearning,
    };
  });
}

export function accuracySummary(rows: AccuracyRow[]) {
  const errs = rows.map((r) => Math.abs(r.errorPp)).sort((a, b) => a - b);
  const mid = errs.length ? (errs.length % 2 ? errs[(errs.length - 1) / 2] : (errs[errs.length / 2 - 1] + errs[errs.length / 2]) / 2) : 0;
  return { inside: rows.filter((r) => r.inside).length, total: rows.length, medianAbsErrorPp: mid, proven: rows.filter((r) => r.proven).length };
}
