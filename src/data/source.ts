import type { DateRange } from '../lib/dates';
import type {
  CheckoutSession, CreatorCode, GroupStats, MerchantProfile, PeerBenchmark, PeerQuery, PeerRefusal, RzpOrder, RzpPayment,
} from './types';

/** The "swap the connector" seam: the UI, engine and Ray only ever talk to this interface. */
export interface DataSource {
  readonly name: string;
  getMerchant(): Promise<MerchantProfile>;
  /** Engine input for the baseline period (22 Aug – 20 Sep 2026). */
  getGroupStats(period: 'baseline'): Promise<GroupStats[]>;
  getCheckouts(range: DateRange): Promise<CheckoutSession[]>;
  getOrders(range: DateRange): Promise<RzpOrder[]>;
  getPayments(range: DateRange): Promise<RzpPayment[]>;
  getCreatorCodes(): Promise<CreatorCode[]>;
  /** Aggregates only (privacy rules in network/peers.ts). */
  getPeerBenchmark(q: PeerQuery): Promise<PeerBenchmark | PeerRefusal>;
}
