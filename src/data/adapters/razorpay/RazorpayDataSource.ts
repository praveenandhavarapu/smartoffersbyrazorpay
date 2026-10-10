/**
 * RazorpayDataSource — stub. This is the "swap the connector" seam.
 * Each method names the Razorpay API it would call. Verify endpoints and fields against
 * Razorpay's API docs before building; nothing here makes network calls.
 *
 * How raw data becomes engine input: fetch checkout sessions/orders for the baseline window,
 * classify each into a GroupId with the same rules as checkoutTable.classify(), then run
 * aggregate.ts -> per-group checkouts, conversion and AOV (mean cart value of converted checkouts,
 * before discount, excluding shipping, paise -> rupees). Prior lifts still come from the network pool.
 */
import type { DataSource } from '../../source';
import { NotConnectedError } from '../../types';
import type { CheckoutSession, CreatorCode, GroupStats, MerchantProfile, PeerBenchmark, PeerQuery, PeerRefusal, RzpOrder, RzpPayment } from '../../types';

export class RazorpayDataSource implements DataSource {
  readonly name = 'Razorpay adapter';
  // GET /v1/accounts/me (VERIFY) -> merchant profile; margin is asked from the merchant, never inferred.
  async getMerchant(): Promise<MerchantProfile> { throw new NotConnectedError('getMerchant (Accounts API)'); }
  // Orders API (GET /v1/orders?from&to, paginated) + Magic Checkout session export (VERIFY) -> aggregate.ts -> GroupStats.
  async getGroupStats(): Promise<GroupStats[]> { throw new NotConnectedError('getGroupStats (Orders API + aggregate.ts)'); }
  // Magic Checkout checkout-session data (VERIFY: available via reports/webhooks, not a public list endpoint).
  async getCheckouts(): Promise<CheckoutSession[]> { throw new NotConnectedError('getCheckouts (Magic Checkout sessions)'); }
  // GET /v1/orders with expand of offers/promotions (VERIFY field names: line_items_total, promotions).
  async getOrders(): Promise<RzpOrder[]> { throw new NotConnectedError('getOrders (Orders API)'); }
  // GET /v1/payments?from&to.
  async getPayments(): Promise<RzpPayment[]> { throw new NotConnectedError('getPayments (Payments API)'); }
  // Magic Checkout promotions: Get Promotions / Apply Promotions endpoints (VERIFY) or Offers API.
  async getCreatorCodes(): Promise<CreatorCode[]> { throw new NotConnectedError('getCreatorCodes (Magic Checkout promotions)'); }
  // Network benchmarks would be a Razorpay-side aggregate service, never raw merchant data.
  async getPeerBenchmark(_q: PeerQuery): Promise<PeerBenchmark | PeerRefusal> { throw new NotConnectedError('getPeerBenchmark (aggregate service)'); }
}
