/**
 * Privacy-guarded peer benchmarks. The ONLY public door to the network data.
 * Rules (SPEC 8.3): aggregates only; pool >= 20 merchants; no member > 25% of the pooled sample;
 * values rounded to 0.5 pp. Never returns names, ids, sales or any single-merchant value.
 */
import { bandOf, generateNetwork, isSimilarToAlpha, roundToHalf, storeEconomics, weightedPercentile, NETWORK_SIZE, type Category } from '../generator/network';
import { FIXTURE_LIFTS } from '../fixtures';
import type { GroupId, OfferId, PeerBenchmark, PeerQuery, PeerRefusal } from '../types';

export const MIN_POOL = 20;
export const MAX_SHARE = 0.25;

export type PeerMember = { sampleSize: number; liftPp: number };

export function peerPrivacyCheck(members: PeerMember[]): { ok: true } | { ok: false; reason: string } {
  if (members.length < MIN_POOL) return { ok: false, reason: `Only ${members.length} similar stores match; at least ${MIN_POOL} are needed to share an average.` };
  const total = members.reduce((a, m) => a + m.sampleSize, 0);
  const top = Math.max(...members.map((m) => m.sampleSize));
  if (total <= 0 || top / total > MAX_SHARE) return { ok: false, reason: 'One store would make up more than 25% of the sample, so the average could reveal it.' };
  return { ok: true };
}

function membersFor(q: PeerQuery): PeerMember[] {
  return generateNetwork()
    .filter(isSimilarToAlpha)
    .filter((m) => (q.filters?.minAgeMonths === undefined || m.ageMonths >= q.filters.minAgeMonths)
      && (q.filters?.checkout === undefined || m.checkout === q.filters.checkout))
    .flatMap((m) => m.tests.filter((t) => t.groupId === q.groupId && t.offerId === q.offerId).map((t) => ({ sampleSize: t.sampleSize, liftPp: t.liftPp })));
}

/** Pure benchmark from members (exported for tests that force small or dominated pools). */
export function benchmarkFromMembers(groupId: GroupId, offerId: OfferId, members: PeerMember[]): PeerBenchmark | PeerRefusal {
  const check = peerPrivacyCheck(members);
  if (!check.ok) return check;
  const xs = members.map((m) => ({ v: m.liftPp, w: m.sampleSize }));
  return {
    ok: true, groupId, offerId,
    poolSize: members.length,
    medianLiftPp: roundToHalf(weightedPercentile(xs, 0.5)),
    p25LiftPp: roundToHalf(weightedPercentile(xs, 0.25)),
    p75LiftPp: roundToHalf(weightedPercentile(xs, 0.75)),
    totalSample: Math.round(members.reduce((a, m) => a + m.sampleSize, 0) / 100) * 100,
  };
}

export function getPeerBenchmark(q: PeerQuery): PeerBenchmark | PeerRefusal {
  if (q.offerId === 'none') return { ok: false, reason: 'No offer means no lift to benchmark.' };
  return benchmarkFromMembers(q.groupId, q.offerId, membersFor(q));
}

/** Count of stores in Alpha's similar pool (aggregate, safe to show). */
export const similarPoolSize = (): number => generateNetwork().filter(isSimilarToAlpha).length;
export const networkSize = (): number => NETWORK_SIZE;

export type LiftTable = Record<GroupId, Partial<Record<OfferId, number>>>;

/** Pool medians / percentiles for every Alpha group x offer (aggregates only). */
export function poolLifts(): { median: LiftTable; p25: LiftTable; p75: LiftTable } {
  const median = {} as LiftTable, p25 = {} as LiftTable, p75 = {} as LiftTable;
  for (const [g, lifts] of Object.entries(FIXTURE_LIFTS) as [GroupId, Partial<Record<OfferId, number>>][]) {
    median[g] = {}; p25[g] = {}; p75[g] = {};
    for (const o of Object.keys(lifts) as OfferId[]) {
      const b = getPeerBenchmark({ groupId: g, offerId: o });
      if (b.ok) { median[g][o] = b.medianLiftPp; p25[g][o] = b.p25LiftPp; p75[g][o] = b.p75LiftPp; }
    }
  }
  return { median, p25, p75 };
}

// ---------- Store-size benchmarks (v3) ----------
export type Band3 = { p25: number; median: number; p75: number };
export type StoreBenchmark = {
  ok: true;
  /** "Apparel stores with ₹20–35 lakh monthly sales" */
  peerLabel: string;
  bandLabel: string;
  stores: number;
  /** What stores keep from a ₹1,000 sale (₹, rounded to 10). */
  keepPer1000: Band3;
  /** Monthly offer budget as % of sales (1 dp). */
  offerSpendPct: Band3;
  /** That share applied to THIS store's monthly sales (₹, rounded to 5,000, within ₹5,000–₹10,00,000). */
  budgetInr: Band3;
  /** % of stores asking offers to at least break even, vs a higher bar (and the usual higher bar). */
  floor: { breakEvenPct: number; higherPct: number; usualHigherMultiple: number };
  goalMixPct: { most_profit: number; new_customers: number; orders_steady: number };
  maxDiscountInr: Band3;
  menuPct: { free_shipping: number; flat_100: number; flat_200: number };
  /** Median share of planned profit given up for growth, among stores whose goal is growth. */
  growthGiveUpPct: number | null;
  pausesOnDropsPct: number;
};

const CATEGORY_LABEL: Record<Category, string> = { fashion_apparel: 'Apparel', beauty: 'Beauty', footwear: 'Footwear', accessories_jewellery: 'Accessories and jewellery', home: 'Home' };
const pctOfN = (k: number, n: number) => Math.round((k / n) * 100);
const q3 = (vals: number[], f: (x: number) => number): Band3 => {
  const xs = vals.map((v) => ({ v, w: 1 }));
  return { p25: f(weightedPercentile(xs, 0.25)), median: f(weightedPercentile(xs, 0.5)), p75: f(weightedPercentile(xs, 0.75)) };
};
const round10 = (x: number) => Math.round(x / 10) * 10;
const budgetRound = (x: number) => Math.min(1_000_000, Math.max(5000, Math.round(x / 5000) * 5000));

/**
 * Typical setup choices of stores in the same category and monthly-sales band (aggregates only).
 * Same privacy rules as offer benchmarks: at least 20 stores, no store above 25% of the band's sales.
 */
export function getStoreBenchmark(monthlySalesInr: number, category: Category = 'fashion_apparel'): StoreBenchmark | PeerRefusal {
  const band = bandOf(monthlySalesInr);
  const xs = storeEconomics().filter((e) => e.category === category && bandOf(e.monthlySalesInr).id === band.id);
  const check = peerPrivacyCheck(xs.map((e) => ({ sampleSize: e.monthlySalesInr, liftPp: 0 })));
  if (!check.ok) return check;
  const n = xs.length;
  const spend = q3(xs.map((e) => e.offerSpendPct), (x) => Math.round(x * 10) / 10);
  const growth = xs.filter((e) => e.goal !== 'most_profit');
  const higher = xs.filter((e) => e.floorMultiple > 1);
  return {
    ok: true, peerLabel: `${CATEGORY_LABEL[category]} stores with ${band.label} monthly sales`, bandLabel: band.label, stores: n,
    keepPer1000: q3(xs.map((e) => e.keepPer1000), round10),
    offerSpendPct: spend,
    budgetInr: { p25: budgetRound((spend.p25 / 100) * monthlySalesInr), median: budgetRound((spend.median / 100) * monthlySalesInr), p75: budgetRound((spend.p75 / 100) * monthlySalesInr) },
    floor: { breakEvenPct: pctOfN(n - higher.length, n), higherPct: pctOfN(higher.length, n), usualHigherMultiple: 1.2 },
    goalMixPct: { most_profit: pctOfN(xs.filter((e) => e.goal === 'most_profit').length, n), new_customers: pctOfN(xs.filter((e) => e.goal === 'new_customers').length, n), orders_steady: pctOfN(xs.filter((e) => e.goal === 'orders_steady').length, n) },
    maxDiscountInr: q3(xs.map((e) => e.maxDiscountInr), (x) => x),
    menuPct: { free_shipping: pctOfN(xs.filter((e) => e.menu.free_shipping).length, n), flat_100: pctOfN(xs.filter((e) => e.menu.flat_100).length, n), flat_200: pctOfN(xs.filter((e) => e.menu.flat_200).length, n) },
    growthGiveUpPct: growth.length >= MIN_POOL ? weightedPercentile(growth.map((e) => ({ v: e.growthGiveUpPct, w: 1 })), 0.5) : null,
    pausesOnDropsPct: pctOfN(xs.filter((e) => e.pausesOnDrops).length, n),
  };
}
