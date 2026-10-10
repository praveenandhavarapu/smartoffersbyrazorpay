/** Guardrails (SPEC 6.5). Each rule is a small pure function with a test. */
import { OFFER_BY_ID, OFFER_RULES, PROFILE } from '../data/fixtures';
import type { GroupId, OfferId } from '../data/types';
import { addDays } from '../lib/dates';

export const MAX_DISCOUNT_PER_ORDER = OFFER_RULES.max_discount_per_order_inr; // ₹250
export const DAILY_SPEND_CAP = OFFER_RULES.daily_spend_cap_inr; // ₹6,000
export const CHECKOUT_BUDGET_MS = 50;
export const STEP_DOWN_DAYS = 7;
export const NEAR_BREAK_EVEN_BAND = 0.2;

/** One offer per order: a typed code replaces the Smart Offer and never stacks with it. */
export function resolveOrderOffer(smartOffer: OfferId, typedCode?: string): { applied: 'smart' | 'typed' | 'none'; offer: OfferId; code?: string } {
  if (typedCode) return { applied: 'typed', offer: 'none', code: typedCode };
  return smartOffer === 'none' ? { applied: 'none', offer: 'none' } : { applied: 'smart', offer: smartOffer };
}

export const capDiscount = (discountInr: number): number => Math.min(discountInr, MAX_DISCOUNT_PER_ORDER);

/** Spend gate: daily cap and monthly budget are hard stops. */
export function spendGate(offer: OfferId, spentToday: number, spentThisMonth: number, monthlyBudget: number): OfferId {
  const cost = OFFER_BY_ID[offer].costPerOrderInr;
  if (offer === 'none') return 'none';
  if (spentToday + cost > DAILY_SPEND_CAP) return 'none';
  if (spentThisMonth + cost > monthlyBudget) return 'none';
  return offer;
}

/** Ladder used for step-downs, cheapest last. */
const LADDER: OfferId[] = ['flat_200', 'flat_100', 'free_shipping', 'none'];

export function nextCheaper(offer: OfferId, available: readonly OfferId[]): OfferId {
  const i = LADDER.indexOf(offer);
  for (const o of LADDER.slice(i + 1)) if (o === 'none' || available.includes(o)) return o;
  return 'none';
}

/** Step-down: measured return below break-even for 7 consecutive days (and not still learning on the upside). */
export function stepDown(
  offer: OfferId, available: readonly OfferId[], dailyReturns: number[], breakEvenReturn: number, upperBoundAboveBreakEven: boolean,
): { offer: OfferId; alert?: string } {
  const lastDays = dailyReturns.slice(-STEP_DOWN_DAYS);
  if (offer === 'none' || lastDays.length < STEP_DOWN_DAYS || upperBoundAboveBreakEven) return { offer };
  if (lastDays.every((r) => r < breakEvenReturn)) {
    const next = nextCheaper(offer, available);
    return { offer: next, alert: `Return stayed below break-even for ${STEP_DOWN_DAYS} days: moved from ${OFFER_BY_ID[offer].label} to ${OFFER_BY_ID[next].label}.` };
  }
  return { offer };
}

/** Near break-even watch. */
export function nearBreakEven(rows: { group: GroupId; offer: OfferId; ret: number }[], breakEvenReturn: number) {
  return rows.filter((r) => r.offer !== 'none' && Math.abs(r.ret - breakEvenReturn) <= NEAR_BREAK_EVEN_BAND + 1e-9);
}

/** Kill switch: every group to none immediately. */
export function killSwitch(groups: readonly GroupId[]): Record<GroupId, OfferId> {
  return Object.fromEntries(groups.map((g) => [g, 'none'])) as Record<GroupId, OfferId>;
}

/** Rule windows: no offers on festive-drop styles from launch for N days. */
export function inNoOfferWindow(dateIso: string, isDropStyle: boolean): boolean {
  if (!isDropStyle) return false;
  const start = PROFILE.upcomingDrop.launch;
  const end = addDays(start, PROFILE.upcomingDrop.fullPriceDays);
  return dateIso >= start && dateIso < end;
}

/** Group rules may only use these signals. */
export const ALLOWED_SIGNALS = ['is_first_order', 'days_since_last_order', 'source', 'creator_code', 'cart_value'] as const;
export const BANNED_SIGNALS = ['device', 'os', 'gender', 'income', 'location', 'pincode', 'city', 'age', 'iphone', 'android', 'religion', 'caste'] as const;

export function rulesUseBannedSignals(rules: string[]): string[] {
  const hits: string[] = [];
  for (const r of rules) for (const b of BANNED_SIGNALS) if (new RegExp(`\\b${b}\\b`, 'i').test(r)) hits.push(`${b} in "${r}"`);
  return hits;
}

/** Fail-safe: the lookup must answer within 50 ms, else the shopper sees the store default. */
export async function withCheckoutBudget<T>(fn: () => Promise<T> | T, fallback: T, ms = CHECKOUT_BUDGET_MS): Promise<{ value: T; failSafe: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<'timeout'>((res) => { timer = setTimeout(() => res('timeout'), ms); });
    const v = await Promise.race([Promise.resolve().then(fn), timeout]);
    return v === 'timeout' ? { value: fallback, failSafe: true } : { value: v as T, failSafe: false };
  } catch {
    return { value: fallback, failSafe: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
