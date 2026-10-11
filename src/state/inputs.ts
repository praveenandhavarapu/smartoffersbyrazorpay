/**
 * v3 "ask, don't assume": the merchant's inputs, what stores their size typically use, and which inputs are
 * still unconfirmed. Typical values come from the privacy-guarded benchmark (data layer), never from code.
 */
import type { StoreBenchmark } from '../data/network/peers';
import type { PeerRefusal } from '../data/types';
import type { OfferId } from '../data/types';
import { INPUT_KEYS, type InputKey, type InputSource, type Settings } from './store';
import { MAX_DISCOUNT_PER_ORDER } from '../engine/guardrails';

export type Benchmark = StoreBenchmark | PeerRefusal;

/** Inputs the merchant hasn't given or accepted yet. Once a plan is approved, all count as confirmed. */
export const pendingInputs = (approved: boolean, confirmed: Partial<Record<InputKey, InputSource>>): InputKey[] =>
  approved ? [] : INPUT_KEYS.filter((k) => !confirmed[k]);

/** Typical value per input for stores this size (null when the benchmark can't be shared). */
export function typicalPatch(b: Benchmark, keys: InputKey[] = INPUT_KEYS, breakEven = 2): Partial<Settings> {
  if (!b.ok) return {};
  const goal = (Object.entries(b.goalMixPct) as [Settings['goal'], number][]).sort((x, y) => y[1] - x[1])[0][0];
  const menu = (Object.entries(b.menuPct) as [OfferId, number][]).filter(([, pct]) => pct >= 50).map(([o]) => o);
  const all: Partial<Record<InputKey, Partial<Settings>>> = {
    budget: { budget: b.budgetInr.median },
    keepPer1000: { keepPer1000: b.keepPer1000.median },
    goal: { goal },
    offers: { allowedOffers: menu, maxDiscountInr: Math.min(b.maxDiscountInr.median, MAX_DISCOUNT_PER_ORDER) },
    minReturn: { minReturn: b.floor.breakEvenPct >= 50 ? null : roundX(b.floor.usualHigherMultiple * breakEven) },
    festiveWindow: { festiveWindow: b.pausesOnDropsPct >= 50 },
  };
  return Object.assign({}, ...keys.map((k) => all[k] ?? {}));
}

const roundX = (x: number) => Math.round(x * 100) / 100;

/** Plain-words value of an input ("₹1,00,000 a month", "keep ₹500 of ₹1,000"). */
export function inputValue(k: InputKey, s: Settings, breakEven: number): string {
  const inr = (x: number) => `₹${Math.round(x).toLocaleString('en-IN')}`;
  if (k === 'budget') return `${inr(s.budget)} a month`;
  if (k === 'keepPer1000') return `keep ${inr(s.keepPer1000)} of ₹1,000 (${s.keepPer1000 / 10}%)`;
  if (k === 'goal') return s.goal === 'most_profit' ? 'Most profit' : s.goal === 'new_customers' ? 'Most new customers' : `Keep orders steady (fall at most ${s.ordersFloorPct}%)`;
  if (k === 'offers') return `${s.allowedOffers.length} offers, max ${inr(s.maxDiscountInr)} off`;
  if (k === 'minReturn') return s.minReturn ? `${s.minReturn.toFixed(2)}x` : `break-even (${breakEven.toFixed(2)}x)`;
  return s.festiveWindow ? 'no offers on new drops' : 'offers on new drops too';
}
