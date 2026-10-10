/** Loads everything the screens need from the DataSource once, then derives engine results. */
import type { DataSource } from '../data/source';
import { MockDataSource } from '../data/adapters/mock/MockDataSource';
import { poolLifts, similarPoolSize, networkSize, type LiftTable } from '../data/network/peers';
import { pilotCountsFromSessions } from '../data/aggregate';
import { PILOT_DAY20 } from '../lib/dates';
import type { CheckoutSession, CreatorCode, GroupId, GroupStats, MerchantProfile } from '../data/types';
import type { ArmCounts } from '../engine/measure';

export type Model = {
  source: string;
  profile: MerchantProfile;
  groups: GroupStats[];
  creators: CreatorCode[];
  pool: { size: number; network: number; p25: LiftTable; p75: LiftTable };
  pilot20Counts: Record<GroupId, ArmCounts>;
  pilotSessions: CheckoutSession[];
};

export const dataSource: DataSource = new MockDataSource();

let pending: Promise<Model> | null = null;

export function loadModel(ds: DataSource = dataSource): Promise<Model> {
  if (pending) return pending;
  pending = (async () => {
    const [profile, groups, creators, pilot] = await Promise.all([
      ds.getMerchant(), ds.getGroupStats('baseline'), ds.getCreatorCodes(), ds.getCheckouts(PILOT_DAY20),
    ]);
    const pl = poolLifts();
    return {
      source: ds.name, profile, groups, creators,
      pool: { size: similarPoolSize(), network: networkSize(), p25: pl.p25, p75: pl.p75 },
      pilot20Counts: pilotCountsFromSessions(pilot.filter((s) => s.arm !== 'pre_pilot')),
      pilotSessions: pilot.filter((s) => s.arm !== 'pre_pilot'),
    };
  })();
  pending.catch(() => { pending = null; });
  return pending;
}
