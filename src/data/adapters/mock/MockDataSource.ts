import type { DataSource } from '../../source';
import type { DateRange } from '../../../lib/dates';
import { toUnix } from '../../../lib/dates';
import { CREATOR_CODES, PROFILE, fixtureGroupStats } from '../../fixtures';
import { generateAlpha } from '../../generator/alpha';
import { getPeerBenchmark, poolLifts } from '../../network/peers';
import type { CheckoutSession, CreatorCode, GroupStats, MerchantProfile, PeerBenchmark, PeerQuery, PeerRefusal, RzpOrder, RzpPayment } from '../../types';

const inRange = (t: number, r: DateRange) => t >= toUnix(r.from) && t < toUnix(r.to) + 86400;

/** Fixtures + seeded generator. GroupStats come from the fixture exactly; priors from the network pool. */
export class MockDataSource implements DataSource {
  readonly name = 'Mock (Alpha Apparel, synthetic)';
  async getMerchant(): Promise<MerchantProfile> { return PROFILE; }
  async getGroupStats(): Promise<GroupStats[]> { return fixtureGroupStats(poolLifts().median); }
  async getCheckouts(range: DateRange): Promise<CheckoutSession[]> {
    const d = generateAlpha();
    return [...d.baseline, ...d.pilot20].filter((s) => inRange(s.created_at, range));
  }
  async getOrders(range: DateRange): Promise<RzpOrder[]> { return generateAlpha().orders.filter((o) => inRange(o.created_at, range)); }
  async getPayments(range: DateRange): Promise<RzpPayment[]> { return generateAlpha().payments.filter((p) => inRange(p.created_at, range)); }
  async getCreatorCodes(): Promise<CreatorCode[]> { return CREATOR_CODES; }
  async getPeerBenchmark(q: PeerQuery): Promise<PeerBenchmark | PeerRefusal> { return getPeerBenchmark(q); }
}
