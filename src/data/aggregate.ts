/** Raw checkout sessions -> per-group, per-arm counts, conversion and AOV (rupees). */
import type { Arm, CheckoutSession, GroupId } from './types';

export type ArmStats = { checkouts: number; orders: number; conversion: number; aovInr: number };
export type GroupArmStats = Record<GroupId, Partial<Record<Arm, ArmStats>>>;

export function aggregate(sessions: CheckoutSession[]): GroupArmStats {
  const acc = {} as Record<GroupId, Partial<Record<Arm, { n: number; o: number; v: number }>>>;
  for (const s of sessions) {
    const g = (acc[s.group_id] ??= {});
    const a = (g[s.arm] ??= { n: 0, o: 0, v: 0 });
    a.n++;
    if (s.converted) {
      a.o++;
      a.v += s.cart.value / 100;
    }
  }
  const out = {} as GroupArmStats;
  for (const [gid, arms] of Object.entries(acc) as [GroupId, Partial<Record<Arm, { n: number; o: number; v: number }>>][]) {
    out[gid] = {};
    for (const [arm, a] of Object.entries(arms) as [Arm, { n: number; o: number; v: number }][]) {
      out[gid][arm] = { checkouts: a.n, orders: a.o, conversion: a.n ? a.o / a.n : 0, aovInr: a.o ? a.v / a.o : 0 };
    }
  }
  return out;
}

/** Per-group counts in the shape measure.ts takes. */
export function pilotCountsFromSessions(sessions: CheckoutSession[]) {
  const agg = aggregate(sessions);
  return Object.fromEntries(
    Object.entries(agg).map(([g, arms]) => [g, {
      treatedCheckouts: arms.treated?.checkouts ?? 0,
      treatedOrders: arms.treated?.orders ?? 0,
      holdoutCheckouts: arms.holdout?.checkouts ?? 0,
      holdoutOrders: arms.holdout?.orders ?? 0,
    }]),
  ) as Record<GroupId, { treatedCheckouts: number; treatedOrders: number; holdoutCheckouts: number; holdoutOrders: number }>;
}
