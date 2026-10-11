/** Typed access to fixtures/*.json (read-only source of truth). */
import groupsJson from '../../fixtures/alpha_groups_sep2026.json';
import profileJson from '../../fixtures/alpha_profile.json';
import offersJson from '../../fixtures/offers.json';
import creatorsJson from '../../fixtures/creator_codes.json';
import pilotJson from '../../fixtures/pilot_truth.json';
import type { CreatorCode, GroupId, GroupStats, MerchantProfile, Offer, OfferId } from './types';

type RawGroup = (typeof groupsJson.groups)[number];

export const FIXTURE_LIFTS: Record<GroupId, Partial<Record<OfferId, number>>> = Object.fromEntries(
  groupsJson.groups.map((g: RawGroup) => [g.id, g.lifts_pp as Partial<Record<OfferId, number>>]),
) as Record<GroupId, Partial<Record<OfferId, number>>>;

/** GroupStats straight from the fixture (priorLiftsPp = fixture lifts). */
export function fixtureGroupStats(priors: Record<GroupId, Partial<Record<OfferId, number>>> = FIXTURE_LIFTS): GroupStats[] {
  return groupsJson.groups.map((g: RawGroup) => ({
    id: g.id as GroupId,
    label: g.label,
    rule: g.rule,
    checkouts: g.checkouts,
    aovInr: g.aov_inr,
    baseConversion: g.base_conversion,
    priorLiftsPp: { ...priors[g.id as GroupId] },
    today: g.today.map((t) => ({ code: t.code, share: t.share, discountInr: t.discount_inr, liftPp: t.lift_pp })),
  }));
}

export const OFFERS: Offer[] = offersJson.ladder.map((o) => ({
  id: o.id as OfferId,
  label: o.label,
  costPerOrderInr: o.cost_per_order_inr,
  eligibleIf: (o as { eligible_if?: string }).eligible_if,
}));
/** v2 experiment variants (not in fixtures/offers.json; defined here as code, used only by the learning loop). */
export const VARIANT_OFFERS: Offer[] = [
  { id: 'flat_150', label: '₹150 off', costPerOrderInr: 150, eligibleIf: 'cart_value >= 1500' },
  { id: 'free_shipping_999', label: 'Free shipping on ₹999+', costPerOrderInr: profileJson.shipping_fee_inr, eligibleIf: 'cart_value >= 999' },
  { id: 'free_shipping_prepaid', label: 'Free shipping, prepaid only', costPerOrderInr: profileJson.shipping_fee_inr, eligibleIf: 'prepaid and cart_value < 1500' },
];
export const OFFER_BY_ID: Record<OfferId, Offer> = Object.fromEntries([...OFFERS, ...VARIANT_OFFERS].map((o) => [o.id, o])) as Record<OfferId, Offer>;
export const OFFER_RULES = offersJson.rules;
export const EXISTING_CODES = offersJson.existing_codes;

export const PROFILE: MerchantProfile = {
  merchantId: profileJson.merchant_id,
  legalName: profileJson.legal_name,
  displayName: profileJson.display_name,
  founderName: profileJson.founder_display_name,
  category: profileJson.category,
  story: profileJson.story,
  marginPct: profileJson.gross_margin_pct,
  shippingFeeInr: profileJson.shipping_fee_inr,
  freeShippingThresholdInr: profileJson.free_shipping_threshold_inr,
  codSharePct: profileJson.cod_share_pct,
  holdoutPct: profileJson.pilot.holdout_pct,
  repeat: { rate: profileJson.repeat.new_customer_repeat_rate_180d, aovInr: profileJson.repeat.repeat_aov_inr },
  upcomingDrop: {
    name: profileJson.upcoming_drop.name,
    launch: profileJson.upcoming_drop.launch,
    fullPriceDays: profileJson.upcoming_drop.full_price_days,
    styles: profileJson.upcoming_drop.styles,
  },
};

export const CREATOR_CODES: CreatorCode[] = creatorsJson.codes.map((c) => ({
  code: c.code, creator: c.creator, platform: c.platform, uses: c.uses, returningUses: c.returning_uses,
}));

export const PILOT_TRUTH = {
  daysElapsed: pilotJson.days_elapsed,
  actualLiftPp: pilotJson.actual_lift_pp as Partial<Record<GroupId, number>>,
  planOffers: pilotJson.plan_offers as Record<GroupId, OfferId>,
  alpha10RetiredOn: pilotJson.alpha10_retired_on,
};

export const BASELINE_PERIOD = groupsJson.period;

/** Returns and failed COD (display only, not in engine maths). SPEC 5.3. */
export const AFTER_DELIVERY = { returnRate: 0.12, rtoRateOfCod: 0.22, returnWindowDays: 45 };
