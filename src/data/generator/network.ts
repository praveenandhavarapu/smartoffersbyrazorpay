/**
 * RAW network of 1,200 synthetic merchants (seeded). Contains single-merchant values, so it must
 * only ever be read through network/peers.ts (privacy guard). A test fails if ui/ or ray/ import it.
 */
import { FIXTURE_LIFTS } from '../fixtures';
import { mulberry32, normal, pick, randInt, type Rng } from '../../lib/rng';
import { roundHalfEven } from '../../lib/format';
import type { GroupId, OfferId } from '../types';

export type Category = 'fashion_apparel' | 'beauty' | 'footwear' | 'accessories_jewellery' | 'home';
export type OfferTest = { groupId: GroupId; offerId: OfferId; liftPp: number; sampleSize: number };
export type NetworkMerchant = {
  id: string;
  name: string; // synthetic; never leaves this module's guarded consumers
  category: Category;
  subCategory: string;
  ageMonths: number;
  monthlySalesInr: number;
  aovInr: number;
  checkoutsPerMonth: number;
  traffic: { paidSocial: number; creator: number; organic: number };
  codSharePct: number;
  rtoPctOfCod: number;
  returnsPct: number;
  checkout: 'magic_checkout' | 'standard';
  couponStyle: 'always_on_welcome' | 'creator_codes' | 'sale_only' | 'none';
  seasonalityPeak: string;
  monthlyGrowthPct: number;
  returningSharePct: number;
  tests: OfferTest[];
};

export const NETWORK_SIZE = 1200;
export const SIMILAR_POOL_SIZE = 180;
const NETWORK_SEED = 20261010 + 1200;

const FASHION_SUBS = ['fast_fashion_casual', 'womens_ethnic', 'mens_streetwear', 'kidswear', 'athleisure'];
const AOV_BY_CAT: Record<Category, [number, number]> = {
  fashion_apparel: [600, 3500], beauty: [500, 1800], footwear: [1200, 3500], accessories_jewellery: [500, 3000], home: [800, 3500],
};

/** The similar-store rule for Alpha (SPEC 5.4). */
export function isSimilarToAlpha(m: NetworkMerchant): boolean {
  const newTraffic = m.traffic.paidSocial + m.traffic.creator;
  return m.category === 'fashion_apparel' && m.aovInr >= 1000 && m.aovInr <= 2000 && newTraffic >= 0.6
    && m.checkout === 'magic_checkout' && m.ageMonths >= 3 && m.checkoutsPerMonth >= 1000;
}

function sampleAge(r: Rng): number {
  const x = r();
  return x < 0.25 ? randInt(r, 2, 6) : x < 0.6 ? randInt(r, 7, 18) : randInt(r, 19, 36);
}
function sampleSales(r: Rng): number {
  const x = r();
  const [lo, hi] = x < 0.3 ? [5, 10] : x < 0.6 ? [10, 20] : x < 0.82 ? [20, 35] : [35, 60];
  return Math.round((lo + r() * (hi - lo)) * 100000);
}
function sampleCategory(r: Rng, weights: [Category, number][]): Category {
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [c, w] of weights) if ((x -= w) < 0) return c;
  return weights[weights.length - 1][0];
}

function baseMerchant(r: Rng, i: number, category: Category, similar: boolean): NetworkMerchant {
  const ageMonths = similar ? randInt(r, 3, 36) : sampleAge(r);
  const [alo, ahi] = similar ? [1000, 2000] : AOV_BY_CAT[category];
  const aovInr = randInt(r, alo, ahi);
  let monthlySalesInr = sampleSales(r);
  const conv = 0.28 + r() * 0.17;
  let checkoutsPerMonth = Math.round(monthlySalesInr / (aovInr * conv));
  if (similar && checkoutsPerMonth < 1000) {
    checkoutsPerMonth = randInt(r, 1000, 6000);
    monthlySalesInr = Math.round(checkoutsPerMonth * aovInr * conv);
  }
  const paidSocial = similar ? 0.3 + r() * 0.35 : r() * 0.6;
  const creator = similar ? Math.max(0.6 - paidSocial, 0) + r() * 0.2 : r() * (0.9 - paidSocial) * 0.5;
  const organic = Math.max(0, 1 - paidSocial - creator);
  const sum = paidSocial + creator + organic;
  return {
    id: `acc_NET${String(i).padStart(6, '0')}`,
    name: `Synthetic Store ${i}`,
    category,
    subCategory: category === 'fashion_apparel' ? pick(r, FASHION_SUBS) : category,
    ageMonths,
    monthlySalesInr,
    aovInr,
    checkoutsPerMonth,
    traffic: { paidSocial: paidSocial / sum, creator: creator / sum, organic: organic / sum },
    codSharePct: randInt(r, 15, 65),
    rtoPctOfCod: randInt(r, 15, 35),
    returnsPct: category === 'fashion_apparel' ? randInt(r, 8, 25) : randInt(r, 2, 12),
    checkout: similar || r() < 0.7 ? 'magic_checkout' : 'standard',
    couponStyle: pick(r, ['always_on_welcome', 'creator_codes', 'sale_only', 'none'] as const),
    // Patterns differ from Alpha's (Alpha: steady growth, always-on welcome code, ₹1,000–2,000).
    seasonalityPeak: pick(r, ['Diwali', 'Wedding season', 'EOSS July', 'Summer', 'Republic Day sale']),
    monthlyGrowthPct: Math.round(Math.max(1, 25 - ageMonths * 0.6 + normal(r, 0, 4))),
    returningSharePct: Math.round(Math.min(35, 5 + (ageMonths - 2) * (30 / 34))),
    tests: [],
  };
}

/** Breaks at least one similar-store condition so the quota holds exactly. */
function breakSimilarity(m: NetworkMerchant, r: Rng): void {
  const k = randInt(r, 0, 3);
  if (k === 0) m.checkout = 'standard';
  else if (k === 1) m.aovInr = pick(r, [randInt(r, 500, 990), randInt(r, 2010, 3500)]);
  else if (k === 2) m.checkoutsPerMonth = randInt(r, 200, 990);
  else m.traffic = { paidSocial: 0.2, creator: 0.2, organic: 0.6 };
}

function priorBaseline(m: NetworkMerchant, g: GroupId, o: OfferId): number {
  const target = FIXTURE_LIFTS[g][o] ?? 4;
  let v = target;
  if (m.aovInr > 2500) v -= 1.5; // premium carts react less
  if (m.ageMonths <= 6 && g.startsWith('new_')) v += 1; // young brands' new shoppers react more
  if (m.category === 'beauty' && o === 'free_shipping') v -= 2;
  if (m.category !== 'fashion_apparel') v -= 0.5;
  return v;
}

/** Sample-size-weighted percentile (q in 0..1). */
export function weightedPercentile(xs: { v: number; w: number }[], q: number): number {
  const s = [...xs].sort((a, b) => a.v - b.v);
  const total = s.reduce((a, x) => a + x.w, 0);
  let cum = 0;
  for (const x of s) {
    cum += x.w;
    if (cum >= q * total - 1e-9) return x.v;
  }
  return s[s.length - 1]?.v ?? 0;
}

let cache: NetworkMerchant[] | null = null;

export function generateNetwork(): NetworkMerchant[] {
  if (cache) return cache;
  const r = mulberry32(NETWORK_SEED);
  const merchants: NetworkMerchant[] = [];
  // 55% fashion overall; the 180 similar ones are all fashion, so the rest get the remaining mix.
  const otherWeights: [Category, number][] = [['fashion_apparel', 480], ['beauty', 180], ['footwear', 120], ['accessories_jewellery', 120], ['home', 120]];
  for (let i = 0; i < NETWORK_SIZE; i++) {
    const similar = i < SIMILAR_POOL_SIZE;
    const m = baseMerchant(r, i + 1, similar ? 'fashion_apparel' : sampleCategory(r, otherWeights), similar);
    if (!similar && isSimilarToAlpha(m)) breakSimilarity(m, r);
    merchants.push(m);
  }
  // Shuffle so pool members are not just the first ids.
  for (let i = merchants.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [merchants[i], merchants[j]] = [merchants[j], merchants[i]];
  }

  // Past offer tests: Magic Checkout merchants with >= 3 months of history.
  const combos = (Object.entries(FIXTURE_LIFTS) as [GroupId, Partial<Record<OfferId, number>>][])
    .flatMap(([g, lifts]) => (Object.keys(lifts) as OfferId[]).map((o) => [g, o] as const));
  for (const m of merchants) {
    if (m.checkout !== 'magic_checkout' || m.ageMonths < 3) continue;
    for (const [g, o] of combos) {
      if (r() > 0.75) continue;
      const lift = Math.max(0, priorBaseline(m, g, o) + normal(r, 0, 2));
      m.tests.push({ groupId: g, offerId: o, liftPp: lift, sampleSize: randInt(r, 200, 3000) });
    }
  }

  // Re-centre each group x offer within the similar pool so the weighted median equals the fixture lift.
  const pool = merchants.filter(isSimilarToAlpha);
  for (const [g, o] of combos) {
    const target = FIXTURE_LIFTS[g][o]!;
    const tests = pool.flatMap((m) => m.tests.filter((t) => t.groupId === g && t.offerId === o));
    const wm = weightedPercentile(tests.map((t) => ({ v: t.liftPp, w: t.sampleSize })), 0.5);
    for (const t of tests) t.liftPp = Math.max(0, t.liftPp + (target - wm));
  }
  cache = merchants;
  return cache;
}

export const roundToHalf = (x: number): number => roundHalfEven(x * 2) / 2;

// ---------- Store economics (v3: benchmarks by store size) ----------
/**
 * What each synthetic store chose when it set up checkout offers: its own numbers, not Alpha's.
 * Generated in a SEPARATE seeded pass so the offer-test data above (and every lift prior) is unchanged.
 * Calibration (documented, like the lift re-centring above): within each category × sales band the
 * median "keep per ₹1,000" is re-centred to ₹500 for apparel and the median offer spend to 3.65% of
 * sales, so a store of Alpha's size sees typical values equal to the demo's starting values.
 */
export type StoreEconomics = {
  id: string;
  category: Category;
  monthlySalesInr: number;
  /** What the store keeps from a ₹1,000 sale after product, shipping, packaging and payment costs. */
  keepPer1000: number;
  /** Monthly checkout-offer budget as % of monthly sales. */
  offerSpendPct: number;
  /** Minimum return asked of an offer, as a multiple of break-even (1 = break-even). */
  floorMultiple: 1 | 1.2 | 1.5;
  goal: 'most_profit' | 'new_customers' | 'orders_steady';
  maxDiscountInr: number;
  menu: { free_shipping: boolean; flat_100: boolean; flat_200: boolean };
  /** Share of planned profit given up for growth (stores whose goal is new customers or steady orders). */
  growthGiveUpPct: number;
  /** Pauses offers on new full-price drops. */
  pausesOnDrops: boolean;
};

export const SALES_BANDS: { id: string; label: string; lo: number; hi: number }[] = [
  { id: 'lt10', label: 'under ₹10 lakh', lo: 0, hi: 1_000_000 },
  { id: '10to20', label: '₹10–20 lakh', lo: 1_000_000, hi: 2_000_000 },
  { id: '20to35', label: '₹20–35 lakh', lo: 2_000_000, hi: 3_500_000 },
  { id: '35plus', label: '₹35 lakh+', lo: 3_500_000, hi: Infinity },
];
export const bandOf = (sales: number) => SALES_BANDS.find((b) => sales >= b.lo && sales < b.hi) ?? SALES_BANDS[SALES_BANDS.length - 1];

const KEEP_MEAN: Record<Category, number> = { fashion_apparel: 500, beauty: 560, footwear: 470, accessories_jewellery: 580, home: 450 };
const ECON_SEED = NETWORK_SEED + 7;
const CALIBRATION = { keepMedianApparel: 500, spendPctMedian: 3.65 };

let econCache: StoreEconomics[] | null = null;

export function storeEconomics(): StoreEconomics[] {
  if (econCache) return econCache;
  const r = mulberry32(ECON_SEED);
  const ms = [...generateNetwork()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const out: StoreEconomics[] = ms.map((m) => {
    const young = m.ageMonths <= 12;
    const goalX = r();
    const goal = goalX < (young ? 0.42 : 0.6) ? 'most_profit' : goalX < (young ? 0.86 : 0.88) ? 'new_customers' : 'orders_steady';
    const fx = r();
    return {
      id: m.id, category: m.category, monthlySalesInr: m.monthlySalesInr,
      keepPer1000: Math.round(Math.min(720, Math.max(240, normal(r, KEEP_MEAN[m.category], 75)))),
      // Bigger stores spend a slightly smaller share; always-on welcome codes spend more.
      offerSpendPct: Math.min(9, Math.max(0.8, Math.exp(normal(r, Math.log(3.6), 0.38)) * (m.couponStyle === 'always_on_welcome' ? 1.1 : 0.95) * (m.monthlySalesInr > 3_500_000 ? 0.9 : 1))),
      floorMultiple: fx < 0.68 ? 1 : fx < 0.9 ? 1.2 : 1.5,
      goal,
      maxDiscountInr: pick(r, [150, 200, 200, 250, 250, 250, 250, 300]),
      menu: { free_shipping: r() < 0.86, flat_100: r() < 0.74, flat_200: r() < (m.aovInr >= 1500 ? 0.7 : 0.4) },
      growthGiveUpPct: goal === 'most_profit' ? 0 : Math.round(Math.min(40, Math.max(5, normal(r, 18, 7)))),
      pausesOnDrops: r() < 0.62,
    };
  });
  // Re-centre each category × band: apparel keep median → ₹500, offer spend median → 3.65% of sales.
  for (const b of SALES_BANDS) {
    for (const cat of Object.keys(KEEP_MEAN) as Category[]) {
      const xs = out.filter((e) => e.category === cat && bandOf(e.monthlySalesInr).id === b.id);
      if (!xs.length) continue;
      const med = (v: number[]) => { const s = [...v].sort((p, q) => p - q); return s[Math.floor((s.length - 1) / 2)]; };
      const sp = med(xs.map((e) => e.offerSpendPct));
      for (const e of xs) e.offerSpendPct = Math.max(0.5, e.offerSpendPct + (CALIBRATION.spendPctMedian - sp));
      if (cat === 'fashion_apparel') {
        const k = med(xs.map((e) => e.keepPer1000));
        for (const e of xs) e.keepPer1000 = Math.round(e.keepPer1000 + (CALIBRATION.keepMedianApparel - k));
      }
    }
  }
  econCache = out;
  return out;
}
