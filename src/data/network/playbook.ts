/**
 * "Stores like yours" playbook (v2 spec §8). ILLUSTRATIVE SYNTHETIC network data for this concept.
 * What WORKED in offer tests (incremental lift vs no offer), never what other stores charge.
 * Aggregates of ≥ 20 stores only; no store names. Where the 180-store pool already has a
 * group × offer estimate, the median lift is read from the pool (so it matches the plan's priors exactly).
 */
import type { GroupId, OfferId } from '../types';
import { poolLifts, similarPoolSize } from './peers';

export type PlaybookRow = {
  group: GroupId;
  offer: OfferId | 'early_access';
  label: string;
  storesTested: number;
  beatNoOfferPct: number | null;
  medianLiftPp: number;
  note?: string;
  /** true = on the merchant's offer menu today; false = needs their OK first. */
  inMenu: boolean;
};

export const PEER_DEFINITION = 'Apparel · AOV ₹1,000–2,000 · Magic Checkout · 3k–6k checkouts/month. Aggregates of ≥ 20 stores. No store names. What worked in tests, not what others charge.';
export const PLAYBOOK_FOOTER = 'Illustrative network data (synthetic) for this concept.';
export const MIN_STORES = 20;

type Seed = Omit<PlaybookRow, 'medianLiftPp'> & { fallbackLiftPp: number };

const SEEDS: Seed[] = [
  { group: 'new_ads_small', offer: 'free_shipping', label: 'Free shipping', storesTested: 142, beatNoOfferPct: 78, fallbackLiftPp: 7.0, inMenu: true },
  { group: 'new_ads_small', offer: 'flat_100', label: '₹100 off', storesTested: 138, beatNoOfferPct: 71, fallbackLiftPp: 6.2, inMenu: true },
  { group: 'new_ads_small', offer: 'free_shipping_prepaid', label: 'Free shipping, prepaid only', storesTested: 57, beatNoOfferPct: 70, fallbackLiftPp: 6.1, note: 'RTO −40%', inMenu: false },
  { group: 'new_ads_big', offer: 'flat_200', label: '₹200 off', storesTested: 121, beatNoOfferPct: 80, fallbackLiftPp: 9.0, inMenu: true },
  { group: 'new_ads_big', offer: 'flat_150', label: '₹150 off', storesTested: 96, beatNoOfferPct: 77, fallbackLiftPp: 8.6, inMenu: true },
  { group: 'new_organic', offer: 'free_shipping', label: 'Free shipping', storesTested: 110, beatNoOfferPct: 61, fallbackLiftPp: 6.0, inMenu: true },
  { group: 'new_organic', offer: 'free_shipping_999', label: 'Free shipping on ₹999+', storesTested: 64, beatNoOfferPct: 74, fallbackLiftPp: 5.7, note: 'lower cost', inMenu: false },
  { group: 'returning', offer: 'flat_100', label: '₹100 off', storesTested: 160, beatNoOfferPct: 23, fallbackLiftPp: 1.8, inMenu: true },
  { group: 'returning', offer: 'early_access', label: 'Early access to drops (non-cash)', storesTested: 41, beatNoOfferPct: null, fallbackLiftPp: 2.1, note: 'repeat +2.1 pp', inMenu: false },
  { group: 'lapsed', offer: 'flat_100', label: '₹100 off', storesTested: 97, beatNoOfferPct: 69, fallbackLiftPp: 10.0, inMenu: true },
];

let cache: PlaybookRow[] | null = null;

/** The playbook. Pool medians win where the pool has the combination (keeps the plan's priors exact). */
export function playbook(): PlaybookRow[] {
  if (cache) return cache;
  const pool = poolLifts().median;
  cache = SEEDS.filter((s) => s.storesTested >= MIN_STORES).map(({ fallbackLiftPp, ...s }) => {
    const fromPool = s.offer !== 'early_access' ? pool[s.group]?.[s.offer] : undefined;
    return { ...s, medianLiftPp: fromPool ?? fallbackLiftPp };
  });
  return cache;
}

export const playbookFor = (g: GroupId, o: OfferId | 'early_access'): PlaybookRow | undefined => playbook().find((r) => r.group === g && r.offer === o);
export const playbookPoolSize = (): number => similarPoolSize();
