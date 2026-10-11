/**
 * Razorpay-shaped raw entities (money in PAISE) and domain types (money in RUPEES).
 * Field names mirror Razorpay's public Orders / Payments objects where they exist.
 * Fields marked VERIFY are guesses to check against Razorpay's API docs before a real integration.
 */

export type GroupId = 'new_ads_small' | 'new_ads_big' | 'new_creator' | 'new_organic' | 'returning' | 'lapsed';
export type OfferId = 'none' | 'free_shipping' | 'flat_100' | 'flat_200' | VariantId;
/**
 * v2 experiment variants (spec §7, §10). Not in fixtures/offers.json: defined in src/data/fixtures.ts as code.
 * They only enter a plan through the learning loop (a challenger or an approved promotion).
 */
export type VariantId = 'flat_150' | 'free_shipping_999' | 'free_shipping_prepaid';
export type Arm = 'pre_pilot' | 'treated' | 'holdout';
export type Goal = 'most_profit' | 'new_customers' | 'orders_steady';

export const GROUP_IDS: readonly GroupId[] = ['new_ads_small', 'new_ads_big', 'new_creator', 'new_organic', 'returning', 'lapsed'];
export const OFFER_IDS: readonly OfferId[] = ['none', 'free_shipping', 'flat_100', 'flat_200'];
export const NEW_GROUPS: readonly GroupId[] = ['new_ads_small', 'new_ads_big', 'new_creator', 'new_organic'];

// ---------- raw, Razorpay-shaped ----------
export type RzpOrder = {
  id: `order_${string}`;
  entity: 'order';
  amount: number;
  amount_paid: number;
  currency: 'INR';
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  created_at: number;
  notes: { group_id?: GroupId; offer_id?: OfferId; arm?: Arm; cod?: boolean; returned?: boolean; rto?: boolean };
  line_items_total: number; // VERIFY: Magic Checkout field name
  shipping_fee: number; // VERIFY
  cod_fee: number; // VERIFY
  promotions: { code: string; type: 'flat' | 'percent' | 'free_shipping'; value: number; discount: number }[]; // VERIFY
  customer: { id: `cust_${string}`; contact_masked: string };
};

export type RzpPayment = {
  id: `pay_${string}`;
  entity: 'payment';
  amount: number;
  currency: 'INR';
  status: 'captured' | 'failed' | 'refunded';
  order_id: string;
  method: 'upi' | 'card' | 'netbanking' | 'wallet';
  created_at: number;
  // Optional fields below mirror Razorpay's payment object; filled by the ledger generator.
  captured?: boolean;
  fee?: number; // paise, platform fee
  tax?: number; // paise, GST on the fee
  amount_refunded?: number;
  refund_status?: 'partial' | 'full' | null;
  email?: string; // masked
  contact?: string; // masked
  vpa?: string; // masked, UPI
  bank?: string; // netbanking
  wallet?: string;
  card?: { network: string; last4: string; type: 'credit' | 'debit' };
  error_code?: string;
  error_description?: string;
  offer_id?: OfferId; // Smart Offer applied at checkout, if any
};

export type RzpRefund = {
  id: `rfnd_${string}`; entity: 'refund'; amount: number; currency: 'INR'; payment_id: string;
  created_at: number; status: 'processed' | 'pending'; speed_processed: 'normal' | 'instant'; notes: { reason?: string };
};

export type RzpDispute = {
  id: `disp_${string}`; entity: 'dispute'; payment_id: string; amount: number; currency: 'INR';
  reason_code: string; status: 'open' | 'under_review' | 'won' | 'lost'; created_at: number; respond_by: number;
};

export type RzpSettlement = {
  id: `setl_${string}`; entity: 'settlement'; amount: number; fees: number; tax: number; utr: string;
  status: 'processed' | 'scheduled'; created_at: number; // settlement date
  covers: { from: number; to: number; payments: number; refunds: number };
  type: 'standard' | 'instant';
};

export type LineItem = { sku: string; name: string; category: string; price: number; qty: number };

export type CheckoutSession = {
  id: `chk_${string}`;
  created_at: number;
  customer_id: string;
  is_first_order: boolean;
  days_since_last_order: number | null;
  source: { utm_source?: string; utm_medium?: string; creator_code?: string; referrer?: string };
  cart: { line_items: LineItem[]; value: number }; // paise
  group_id: GroupId;
  arm: Arm;
  offer_shown: OfferId;
  converted: boolean;
  order_id?: string;
  typed_code?: string;
};

// ---------- domain ----------
export type TodayCode = { code: string; share: number; discountInr: number; liftPp: number };

export type GroupStats = {
  id: GroupId;
  label: string;
  rule: string;
  checkouts: number;
  aovInr: number;
  baseConversion: number;
  priorLiftsPp: Partial<Record<OfferId, number>>;
  /** v2: share of an offer's nominal cost actually paid per buyer (e.g. free shipping only on ₹999+ carts). Default 1. */
  costShare?: Partial<Record<OfferId, number>>;
  today: TodayCode[];
};

export type Offer = { id: OfferId; label: string; costPerOrderInr: number; eligibleIf?: string };

export type MerchantProfile = {
  merchantId: string;
  legalName: string;
  displayName: string;
  founderName: string;
  category: string;
  story: string;
  marginPct: number;
  shippingFeeInr: number;
  freeShippingThresholdInr: number;
  codSharePct: number;
  holdoutPct: number;
  repeat: { rate: number; aovInr: number };
  upcomingDrop: { name: string; launch: string; fullPriceDays: number; styles: number };
};

export type CreatorCode = { code: string; creator: string; platform: string; uses: number; returningUses: number };

export type PeerQuery = {
  groupId: GroupId;
  offerId: OfferId;
  filters?: { minAgeMonths?: number; checkout?: 'magic_checkout' };
};

export type PeerBenchmark = {
  ok: true;
  groupId: GroupId;
  offerId: OfferId;
  poolSize: number;
  medianLiftPp: number;
  p25LiftPp: number;
  p75LiftPp: number;
  totalSample: number;
};

export type PeerRefusal = { ok: false; reason: string };

export class NotConnectedError extends Error {
  constructor(what: string) {
    super(`Razorpay adapter not connected: ${what}`);
    this.name = 'NotConnectedError';
  }
}
