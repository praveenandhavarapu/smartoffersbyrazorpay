/**
 * v2 Phase 3 — the learning loop: Suggest → Test → Prove → Promote (spec §7).
 * A deterministic, SYNTHETIC timeline for the demo store. The 10% holdout is permanent and is
 * never used for challengers: a challenger takes up to 15% of a group's TREATED shoppers.
 * Pure functions; every number on screen that comes from here is computed, not typed.
 */
import { PILOT_TRUTH, PROFILE, OFFER_BY_ID } from '../data/fixtures';
import { GROUP_IDS, type GroupId, type GroupStats, type OfferId } from '../data/types';
import { pilotCounts, generateAlpha } from '../data/generator/alpha';
import { playbookFor } from '../data/network/playbook';
import { PILOT_START, pilotDayDate, toUnix } from '../lib/dates';
import { TRUST_K, type ArmCounts } from './measure';
import { roundHalfEven } from '../lib/format';

export const TRAFFIC_SHARE = 0.15;
/** Same 14-day rule as the weekly review: no verdict on a test before two weeks of data. */
export const MIN_TEST_DAYS = 14;
const Z90 = 1.645;
const HOLDOUT = PROFILE.holdoutPct / 100;
const INF = 10_000;

export const dayOf = (iso: string): number => Math.round((toUnix(iso) - toUnix(PILOT_START)) / 86400) + 1;

/** When things happen on the demo timeline (pilot day numbers; day 1 = 21 Sep 2026). */
export const LEARNING_DAYS = {
  startBig: 8, // Mon 28 Sep, week 1 review
  suggestOrganic: 15, // Mon 5 Oct, week 2 review
  startOrganic: 16,
  promoteBig: 22, // Mon 12 Oct, week 3 review
  festive: dayOf(PROFILE.upcomingDrop.launch), // 16 Oct
  earlyReadOrganic: 29, // Mon 19 Oct, week 4 review
  promoteOrganic: 43, // Mon 2 Nov, week 6 review (projection)
  decayFrom: 33,
  decayCheck: 60,
} as const;

/** Decision keys stored in state (merchant approvals) and event ids. */
export const KEYS = { startBig: 'evt-start-big-150', organicTest: 'exp-org-999', promoteBig: 'promote-big-150' } as const;

const ORGANIC_LIFT_RATIO = (playbookFor('new_organic', 'free_shipping_999')?.medianLiftPp ?? 0) / (playbookFor('new_organic', 'free_shipping')?.medianLiftPp ?? 1);
/** Synthetic truths for this store (like PILOT_TRUTH): what the challengers and drift really do. */
export const LEARNING_TRUTH = {
  bigChallengerGapPp: 0.4, // ₹150 off lifts 0.4 pp less than ₹200 off here
  organicChallengerRatio: ORGANIC_LIFT_RATIO, // same ratio as the playbook
  lapsedDecay: 0.59, // lapsed ₹100 off keeps 59% of its lift after week 4 (offer fatigue)
} as const;

export type LearningInput = {
  approved: boolean;
  experimentSpace: boolean;
  festiveWindow: boolean;
  decisions: Record<string, 'approved' | 'declined'>;
  undone: string[];
  /** Pilot day "today" (0 before go-live). */
  nowDay: number;
};

export type Segment = { from: number; to: number; offer: OfferId; share: number; liftPp: number };

const truthLift = (g: GroupId): number => PILOT_TRUTH.actualLiftPp[g] ?? 0;

/** Share of a group's buyers with a cart of at least `minInr` (baseline month, generated data). */
export function buyerShareAtLeast(group: GroupId, minInr: number): number {
  const buyers = generateAlpha().baseline.filter((s) => s.group_id === group && s.converted);
  return buyers.length ? buyers.filter((s) => s.cart.value / 100 >= minInr).length / buyers.length : 1;
}

export function flags(i: LearningInput) {
  const bigRunning = i.approved && i.experimentSpace && !i.undone.includes(KEYS.startBig);
  return {
    bigRunning,
    promoteBig: bigRunning ? i.decisions[KEYS.promoteBig] ?? null : null,
    organic: i.approved ? i.decisions[KEYS.organicTest] ?? null : null,
  };
}

/** What each group's treated shoppers saw, day by day (synthetic truth). */
export function segmentsFor(g: GroupStats, i: LearningInput): Segment[] {
  const champ = PILOT_TRUTH.planOffers[g.id];
  const L = truthLift(g.id);
  const f = flags(i);
  const D = LEARNING_DAYS;
  if (g.id === 'new_ads_big' && f.bigRunning) {
    const Lx = L - LEARNING_TRUTH.bigChallengerGapPp;
    const test = (to: number): Segment[] => [{ from: D.startBig, to, offer: champ, share: 1 - TRAFFIC_SHARE, liftPp: L }, { from: D.startBig, to, offer: 'flat_150', share: TRAFFIC_SHARE, liftPp: Lx }];
    const head: Segment[] = [{ from: 1, to: D.startBig - 1, offer: champ, share: 1, liftPp: L }];
    if (f.promoteBig === 'approved') return [...head, ...test(D.promoteBig - 1), { from: D.promoteBig, to: INF, offer: 'flat_150', share: 1, liftPp: Lx }];
    if (f.promoteBig === 'declined') return [...head, ...test(D.promoteBig - 1), { from: D.promoteBig, to: INF, offer: champ, share: 1, liftPp: L }];
    return [...head, ...test(INF)];
  }
  if (g.id === 'new_organic' && f.organic === 'approved') {
    const Lx = L * LEARNING_TRUTH.organicChallengerRatio;
    return [
      { from: 1, to: D.startOrganic - 1, offer: champ, share: 1, liftPp: L },
      { from: D.startOrganic, to: D.promoteOrganic - 1, offer: champ, share: 1 - TRAFFIC_SHARE, liftPp: L },
      { from: D.startOrganic, to: D.promoteOrganic - 1, offer: 'free_shipping_999', share: TRAFFIC_SHARE, liftPp: Lx },
      // Projection: assumes you approve the week-6 promotion the test is on course for.
      { from: D.promoteOrganic, to: INF, offer: 'free_shipping_999', share: 1, liftPp: Lx },
    ];
  }
  if (g.id === 'lapsed') {
    return [{ from: 1, to: D.decayFrom - 1, offer: champ, share: 1, liftPp: L }, { from: D.decayFrom, to: INF, offer: champ, share: 1, liftPp: L * LEARNING_TRUTH.lapsedDecay }];
  }
  return [{ from: 1, to: INF, offer: champ, share: 1, liftPp: champ === 'none' ? 0 : L }];
}

/** Champion offer on a given day (the segment with the largest share). */
export function offerOn(segs: Segment[], day: number): OfferId {
  const live = segs.filter((s) => s.from <= day && s.to >= day).sort((a, b) => b.share - a.share);
  return (live[0] ?? segs[segs.length - 1]).offer;
}

const costOf = (g: GroupStats, o: OfferId) => (o === 'none' ? 0 : OFFER_BY_ID[o].costPerOrderInr * (g.costShare?.[o] ?? 1));

/** Formula counts for a day count, mixing offers when the timeline does (cost = average per treated order). */
export function countsFor(g: GroupStats, segs: Segment[], d: number): { counts: ArmCounts; costPerOrder?: number; offer: OfferId } {
  const offer = offerOn(segs, d);
  if (segs.length === 1) return { counts: pilotCounts(g, segs[0].offer, segs[0].liftPp, d), offer };
  let nt = 0, ot = 0, spend = 0;
  for (const s of segs) {
    const days = Math.min(s.to, d) - s.from + 1;
    if (days <= 0) continue;
    const n = ((g.checkouts * days) / 30) * (1 - HOLDOUT) * s.share;
    const orders = n * (g.baseConversion + (s.offer === 'none' ? 0 : s.liftPp / 100));
    nt += n; ot += orders; spend += orders * costOf(g, s.offer);
  }
  const nh = Math.round(((g.checkouts * d) / 30) * HOLDOUT);
  const counts = { treatedCheckouts: Math.round(nt), treatedOrders: Math.round(ot), holdoutCheckouts: nh, holdoutOrders: Math.round(nh * g.baseConversion) };
  return { counts, costPerOrder: ot ? spend / ot : undefined, offer };
}

/** Proof mode vs Playbook mode (spec §7.7): days the holdout needs to prove the offer's lift. */
export function evidenceMode(g: GroupStats, offer: OfferId): { mode: 'proof' | 'playbook' | 'none'; days: number | null } {
  const L = offer === 'none' ? 0 : (g.priorLiftsPp[offer] ?? 0) / 100;
  if (L <= 0) return { mode: 'none', days: null };
  const p0 = g.baseConversion, p1 = p0 + L;
  const nt = (g.checkouts / 30) * (1 - HOLDOUT), nh = (g.checkouts / 30) * HOLDOUT;
  const days = Math.ceil((Z90 ** 2 * ((p1 * (1 - p1)) / nt + (p0 * (1 - p0)) / nh)) / L ** 2);
  return { mode: days > 60 ? 'playbook' : 'proof', days };
}

export type Arm = { offer: OfferId; checkouts: number; orders: number; ratePct: number; liftPp: number; lowPp: number; highPp: number; spendPerShopper: number; costPerExtraOrder: number | null; blendedLiftPp: number; profitPerShopper: number };
export type ExperimentRead = { days: number; champion: Arm; challenger: Arm; holdout: { checkouts: number; orders: number; ratePct: number }; gapPp: number; gapLowPp: number; gapHighPp: number; spendCutPct: number; gainMonth: number; verdict: 'promote' | 'retire' | 'wait'; reason: string };

/**
 * Champion vs challenger on the same days, both vs the holdout.
 * Decision rule: promote if the challenger costs less per shopper, makes at least as much profit per shopper
 * once this store's result is blended with the playbook (trust = shoppers / (shoppers + 300)), and this store's
 * own lift gap is within noise (its 90% range includes zero). Retire if the challenger is clearly worse.
 */
export function readExperiment(g: GroupStats, champ: OfferId, chall: OfferId, champLiftPp: number, challLiftPp: number, fromDay: number, toDay: number, margin: number, kept: number): ExperimentRead {
  const days = Math.max(0, toDay - fromDay + 1);
  const n = (g.checkouts * days) / 30;
  const p0 = g.baseConversion;
  const nh = Math.round(n * HOLDOUT), oh = Math.round(nh * p0);
  const ph = nh ? oh / nh : p0;
  const arm = (offer: OfferId, share: number, liftPp: number): Arm => {
    const c = Math.round(n * (1 - HOLDOUT) * share);
    const o = Math.round(c * (p0 + liftPp / 100));
    const p = c ? o / c : p0;
    const lift = p - ph;
    const se = Math.sqrt((p * (1 - p)) / Math.max(c, 1) + (ph * (1 - ph)) / Math.max(nh, 1));
    const cost = costOf(g, offer);
    const prior = playbookFor(g.id, offer)?.medianLiftPp ?? g.priorLiftsPp[offer] ?? lift * 100;
    const w = c / (c + TRUST_K);
    const blended = w * lift * 100 + (1 - w) * prior;
    return {
      offer, checkouts: c, orders: o, ratePct: p * 100, liftPp: lift * 100, lowPp: (lift - Z90 * se) * 100, highPp: (lift + Z90 * se) * 100,
      spendPerShopper: p * cost, costPerExtraOrder: lift > 0 ? (p * cost) / lift : null, blendedLiftPp: blended,
      profitPerShopper: (blended / 100) * g.aovInr * kept * margin - (p0 + blended / 100) * cost,
    };
  };
  const champion = arm(champ, 1 - TRAFFIC_SHARE, champLiftPp);
  const challenger = arm(chall, TRAFFIC_SHARE, challLiftPp);
  const pc = champion.ratePct / 100, px = challenger.ratePct / 100;
  const seGap = Math.sqrt((pc * (1 - pc)) / Math.max(champion.checkouts, 1) + (px * (1 - px)) / Math.max(challenger.checkouts, 1));
  const gap = champion.liftPp - challenger.liftPp;
  const gapLowPp = gap - Z90 * seGap * 100, gapHighPp = gap + Z90 * seGap * 100;
  const cheaper = challenger.spendPerShopper < champion.spendPerShopper;
  const atLeastAsProfitable = challenger.profitPerShopper >= champion.profitPerShopper;
  const withinNoise = gapLowPp <= 0 && gapHighPp >= 0;
  const clearlyWorse = gapLowPp > 0 && !atLeastAsProfitable;
  const verdict = days < MIN_TEST_DAYS ? 'wait' : cheaper && atLeastAsProfitable && withinNoise ? 'promote' : clearlyWorse ? 'retire' : 'wait';
  const reason = days < MIN_TEST_DAYS ? `Needs ${MIN_TEST_DAYS} days of data; ${days} so far.`
    : verdict === 'promote' ? 'Costs less, makes at least as much profit per shopper, and the lift gap is within noise.'
    : verdict === 'retire' ? 'Clearly lower lift and less profit per shopper.' : 'Not clear yet; keeps running.';
  return {
    days, champion, challenger, holdout: { checkouts: nh, orders: oh, ratePct: ph * 100 }, gapPp: gap, gapLowPp, gapHighPp,
    spendCutPct: champion.spendPerShopper ? (1 - challenger.spendPerShopper / champion.spendPerShopper) * 100 : 0,
    gainMonth: (challenger.profitPerShopper - champion.profitPerShopper) * g.checkouts * (1 - HOLDOUT), verdict, reason,
  };
}

export type TimelineEvent = {
  id: string; day: number; date: string;
  actor: 'Smart Offers Agent' | 'Merchant (Praveen)' | 'Ray';
  type: 'challenger_started' | 'playbook_suggestion' | 'promotion_proposed' | 'drift_pause' | 'early_read' | 'lift_decay' | 'promotion_expected';
  group?: GroupId;
  summary: string; before?: string; after?: string;
  /** Review-card detail (the summary minus its headline). */
  detail?: string;
  needsApproval: boolean; key?: string; decision?: 'approved' | 'declined' | null;
  impactInr?: number; undoable: boolean; projected: boolean;
};

export type ExperimentRow = {
  id: string; group: GroupId; champion: OfferId; challenger: OfferId | null; reason?: string;
  trafficShare: number; startedOn: string | null; status: 'running' | 'promoted' | 'retired' | 'paused' | 'waiting' | 'proposed' | 'none';
  source: 'agent' | 'playbook' | 'merchant'; daysRunning: number; daysToDecision: number | null; decisionDate: string | null; lastRefreshed: string | null;
  read: ExperimentRead | null; mode: ReturnType<typeof evidenceMode>;
};

export type Trigger = { id: string; label: string; fired: boolean; day: number | null; date: string | null; projected: boolean; detail: string };

export type LearningModel = ReturnType<typeof buildLearning>;

/** Groups with priors and costs for the variants this store can run (used by plan v2 and the checkout). */
export function groupsWithVariants(groups: GroupStats[], bigPriorPp: number | null, organicPriorPp: number | null): GroupStats[] {
  const share999 = buyerShareAtLeast('new_organic', 999);
  return groups.map((g) => {
    if (g.id === 'new_ads_big' && bigPriorPp !== null) return { ...g, priorLiftsPp: { ...g.priorLiftsPp, flat_150: bigPriorPp } };
    if (g.id === 'new_organic' && organicPriorPp !== null) return { ...g, priorLiftsPp: { ...g.priorLiftsPp, free_shipping_999: organicPriorPp }, costShare: { ...(g.costShare ?? {}), free_shipping_999: share999 } };
    return g;
  });
}

const fmt = (d: number) => pilotDayDate(d);
const pp = (x: number) => `${x >= 0 ? '+' : ''}${roundHalfEven(x, 1).toFixed(1)} pp`;

/** Everything the loop shows: experiments, timeline, triggers, promoted offers, plan-v2 groups. */
export function buildLearning(groups: GroupStats[], i: LearningInput, margin: number, kept: number, label: (g: GroupId) => string) {
  const D = LEARNING_DAYS;
  const f = flags(i);
  const share999 = buyerShareAtLeast('new_organic', 999);
  const withCost = groups.map((g) => (g.id === 'new_organic' ? { ...g, costShare: { ...(g.costShare ?? {}), free_shipping_999: share999 } } : g));
  const G = (id: GroupId) => withCost.find((g) => g.id === id)!;
  const segments = Object.fromEntries(withCost.map((g) => [g.id, segmentsFor(g, i)])) as Record<GroupId, Segment[]>;

  const big = G('new_ads_big'), org = G('new_organic');
  const bigL = truthLift('new_ads_big'), orgL = truthLift('new_organic'), lapL = truthLift('lapsed');
  const bigRead = (to: number) => readExperiment(big, 'flat_200', 'flat_150', bigL, bigL - LEARNING_TRUTH.bigChallengerGapPp, D.startBig, to, margin, kept);
  const orgRead = (to: number) => readExperiment(org, 'free_shipping', 'free_shipping_999', orgL, orgL * LEARNING_TRUTH.organicChallengerRatio, D.startOrganic, to, margin, kept);
  const proposal = bigRead(D.promoteBig - 1);
  const orgEarly = orgRead(D.earlyReadOrganic - 1);
  const orgFinal = orgRead(D.promoteOrganic - 1);
  const now = Math.max(i.nowDay, 0);

  const events: TimelineEvent[] = [];
  const bigName = label('new_ads_big'), orgName = label('new_organic');
  if (i.approved && i.experimentSpace) {
    events.push({
      id: KEYS.startBig, day: D.startBig, date: fmt(D.startBig), actor: 'Smart Offers Agent', type: 'challenger_started', group: 'new_ads_big',
      summary: `Week 1 review: started a challenger for ${bigName}: ₹150 off vs ₹200 off on ${TRAFFIC_SHARE * 100}% of treated shoppers (inside your approved experiment space, no approval needed)`,
      before: '₹200 off for all treated shoppers', after: `${(1 - TRAFFIC_SHARE) * 100}% ₹200 off · ${TRAFFIC_SHARE * 100}% ₹150 off`,
      needsApproval: false, undoable: !f.promoteBig, projected: D.startBig > now,
    });
  }
  if (i.approved) {
    const pb = playbookFor('new_organic', 'free_shipping_999');
    events.push({
      id: KEYS.organicTest, day: D.suggestOrganic, date: fmt(D.suggestOrganic), actor: 'Smart Offers Agent', type: 'playbook_suggestion', group: 'new_organic',
      summary: `Week 2 review: playbook suggestion for ${orgName}: "Free shipping on orders ₹999+"${pb ? ` (worked in ${pb.beatNoOfferPct}% of ${pb.storesTested} similar stores)` : ''}. Not on your offer menu, so it needs your OK.`,
      before: 'Free shipping for all treated shoppers', after: `${(1 - TRAFFIC_SHARE) * 100}% free shipping · ${TRAFFIC_SHARE * 100}% free shipping on ₹999+`,
      detail: `${pb ? `Worked in ${pb.beatNoOfferPct}% of ${pb.storesTested} similar stores (${pb.medianLiftPp >= 0 ? '+' : ''}${pb.medianLiftPp.toFixed(1)} pp${pb.note ? `, ${pb.note}` : ''}). ` : ''}Not on your offer menu, so it needs your OK. If approved it runs as a challenger on ${TRAFFIC_SHARE * 100}% of the group's treated shoppers; the holdout stays untouched.`,
      needsApproval: true, key: KEYS.organicTest, decision: f.organic, undoable: false, projected: D.suggestOrganic > now,
    });
  }
  if (f.bigRunning) {
    events.push({
      id: KEYS.promoteBig, day: D.promoteBig, date: fmt(D.promoteBig), actor: 'Smart Offers Agent', type: 'promotion_proposed', group: 'new_ads_big',
      summary: `Week 3 review: promote ₹150 off for ${bigName}. Measured ${pp(proposal.champion.liftPp)} (₹200 off) vs ${pp(proposal.challenger.liftPp)} (₹150 off), within noise; ${Math.round(proposal.spendCutPct)}% less spend per shopper.`,
      before: '₹200 off', after: '₹150 off', impactInr: proposal.gainMonth,
      detail: `Measured ${pp(proposal.champion.liftPp)} (₹200 off) vs ${pp(proposal.challenger.liftPp)} (₹150 off) over ${proposal.days} days, within noise; ${Math.round(proposal.spendCutPct)}% less spend per shopper.`,
      needsApproval: true, key: KEYS.promoteBig, decision: f.promoteBig, undoable: false, projected: D.promoteBig > now,
    });
  }
  const anyChallenger = f.bigRunning || f.organic === 'approved';
  if (i.approved && i.festiveWindow && anyChallenger) {
    events.push({
      id: 'evt-drift-festive', day: D.festive, date: fmt(D.festive), actor: 'Smart Offers Agent', type: 'drift_pause',
      summary: `Drift trigger: ${PROFILE.upcomingDrop.name} starts. Challengers paused on its ${PROFILE.upcomingDrop.styles} styles for ${PROFILE.upcomingDrop.fullPriceDays} days (your rule).`,
      needsApproval: false, undoable: false, projected: D.festive > now,
    });
  }
  if (f.organic === 'approved') {
    events.push({
      id: 'evt-org-early', day: D.earlyReadOrganic, date: fmt(D.earlyReadOrganic), actor: 'Smart Offers Agent', type: 'early_read', group: 'new_organic',
      summary: `Week 4 review: early read for "Free shipping on ₹999+" (${orgName}): ${pp(orgEarly.challenger.liftPp)} vs ${pp(orgEarly.champion.liftPp)} on ${orgEarly.challenger.checkouts} shoppers. Too early to call.`,
      needsApproval: false, undoable: false, projected: D.earlyReadOrganic > now,
    });
    events.push({
      id: 'evt-org-promote', day: D.promoteOrganic, date: fmt(D.promoteOrganic), actor: 'Smart Offers Agent', type: 'promotion_expected', group: 'new_organic',
      summary: `Week 6 review (projected): "Free shipping on ₹999+" on course to replace free shipping for ${orgName} (${Math.round(orgFinal.spendCutPct)}% less spend per shopper). Needs your approval then; Day 60 assumes you approve.`,
      impactInr: orgFinal.gainMonth, needsApproval: true, undoable: false, projected: D.promoteOrganic > now,
    });
  }
  const decayed = lapL * LEARNING_TRUTH.lapsedDecay;
  if (i.approved) {
    events.push({
      id: 'evt-decay-lapsed', day: D.decayCheck, date: fmt(D.decayCheck), actor: 'Smart Offers Agent', type: 'lift_decay', group: 'lapsed',
      summary: `Lift-decay check: ${label('lapsed')} ₹100 off lift fell from ${pp(lapL)} to ${pp(decayed)} over 4 weeks. Re-test scheduled.`,
      needsApproval: false, undoable: false, projected: D.decayCheck > now,
    });
  }
  events.sort((a, b) => a.day - b.day);

  const triggers: Trigger[] = [
    { id: 'festive', label: 'Festive or sale window', fired: i.approved && i.festiveWindow, day: D.festive, date: fmt(D.festive), projected: D.festive > now, detail: `${PROFILE.upcomingDrop.name}: challengers paused on its styles, as you set.` },
    { id: 'collection', label: 'New collection', fired: i.approved, day: D.festive, date: fmt(D.festive), projected: D.festive > now, detail: `${PROFILE.upcomingDrop.styles} new styles launch: their shoppers are re-tested after the full-price week.` },
    { id: 'admix', label: 'Ad-mix shift above 20%', fired: false, day: null, date: null, projected: false, detail: 'Share of checkouts from ads stayed within its usual range.' },
    { id: 'price', label: 'Price change', fired: false, day: null, date: null, projected: false, detail: 'No price changes on offer styles.' },
    { id: 'decay', label: 'Lift decay above 40% over 4 weeks', fired: i.approved && 1 - LEARNING_TRUTH.lapsedDecay > 0.4, day: D.decayCheck, date: fmt(D.decayCheck), projected: D.decayCheck > now, detail: `${label('lapsed')}: ${pp(lapL)} → ${pp(decayed)} (${Math.round((1 - LEARNING_TRUTH.lapsedDecay) * 100)}% drop).` },
    { id: 'conversion', label: 'Conversion drop', fired: false, day: null, date: null, projected: false, detail: 'Store conversion within its normal range.' },
  ];

  // Experiments table (one row per group).
  const status = (s: ExperimentRow['status']) => s;
  const rows: ExperimentRow[] = GROUP_IDS.map((gid) => {
    const g = G(gid);
    const champ = PILOT_TRUTH.planOffers[gid];
    const mode = evidenceMode(g, champ);
    const base = { group: gid, champion: champ, trafficShare: 0, startedOn: null, source: 'agent' as const, daysRunning: 0, daysToDecision: null, decisionDate: null, lastRefreshed: null, read: null, mode };
    if (gid === 'new_ads_big' && i.approved) {
      if (!i.experimentSpace || !f.bigRunning) return { ...base, id: KEYS.startBig, challenger: null, reason: i.experimentSpace ? 'You stopped the ₹150 off test.' : 'Experiment space is off.', status: status('none') };
      const decided = f.promoteBig;
      const promotedNow = decided === 'approved' && now >= D.promoteBig;
      const end = decided && now >= D.promoteBig ? D.promoteBig - 1 : Math.max(now - 1, D.startBig - 1);
      const read = now >= D.startBig ? bigRead(Math.max(end, D.startBig)) : null;
      return {
        ...base, id: KEYS.startBig, champion: promotedNow ? 'flat_150' : champ, challenger: promotedNow ? null : 'flat_150',
        reason: promotedNow ? 'Promoted: ₹150 off is now the champion.' : decided === 'declined' && now >= D.promoteBig ? 'You kept ₹200 off; test retired.' : undefined,
        trafficShare: promotedNow || (decided === 'declined' && now >= D.promoteBig) ? 0 : TRAFFIC_SHARE, startedOn: fmt(D.startBig),
        status: now < D.startBig ? 'none' : promotedNow ? 'promoted' : decided === 'declined' && now >= D.promoteBig ? 'retired' : now >= D.promoteBig ? 'waiting' : 'running',
        daysRunning: Math.max(0, Math.min(now, decided ? D.promoteBig - 1 : now) - D.startBig + 1),
        daysToDecision: Math.max(0, D.promoteBig - Math.max(now, D.startBig)), decisionDate: fmt(D.promoteBig), lastRefreshed: now >= 1 ? fmt(now) : null, read,
      };
    }
    if (gid === 'new_organic' && i.approved) {
      if (f.organic === 'approved') {
        const read = now >= D.startOrganic ? orgRead(Math.max(now - 1, D.startOrganic)) : null;
        return { ...base, id: KEYS.organicTest, challenger: 'free_shipping_999', source: 'playbook', trafficShare: TRAFFIC_SHARE, startedOn: fmt(D.startOrganic), status: now >= D.startOrganic ? 'running' : 'proposed', daysRunning: Math.max(0, now - D.startOrganic + 1), daysToDecision: Math.max(0, D.promoteOrganic - Math.max(now, D.startOrganic)), decisionDate: fmt(D.promoteOrganic), lastRefreshed: now >= 1 ? fmt(now) : null, read };
      }
      if (f.organic === 'declined') return { ...base, id: KEYS.organicTest, challenger: null, reason: 'You declined the playbook suggestion.', status: 'none', source: 'playbook' };
      return { ...base, id: KEYS.organicTest, challenger: now >= D.suggestOrganic ? 'free_shipping_999' : null, reason: now >= D.suggestOrganic ? 'Waiting on you: not on your menu yet.' : 'Playbook suggestion due at the week 2 review.', status: now >= D.suggestOrganic ? 'proposed' : 'none', source: 'playbook' };
    }
    const reason = champ === 'none'
      ? (gid === 'returning' ? 'None: no cash offer pays back for loyal buyers. A non-cash perk would need your OK.' : 'None: creator codes keep running as they are.')
      : gid === 'lapsed' ? `None: Playbook mode; too few shoppers to split for a test. Re-test after the decay check (${fmt(D.decayCheck)}).`
      : 'None yet: next in the queue.';
    const queued = Object.keys(i.decisions).find((k) => k.startsWith(`pb:${gid}:`) && i.decisions[k] === 'approved');
    if (queued) {
      const o = queued.split(':')[2];
      return { ...base, id: queued, challenger: null, reason: `Queued by you from the playbook: ${playbookFor(gid, o as OfferId)?.label ?? o}. Starts after the current test.`, status: 'none' as const, source: 'playbook' as const };
    }
    return { ...base, id: `none-${gid}`, challenger: null, reason, status: 'none' };
  });

  const promotedOffers: OfferId[] = [];
  if (f.promoteBig === 'approved' && now >= D.promoteBig) promotedOffers.push('flat_150');
  const bigPrior = f.bigRunning ? proposal.challenger.blendedLiftPp : null;
  const orgPrior = f.organic === 'approved' ? orgFinal.challenger.blendedLiftPp : null;

  return {
    flags: f, segments, events, triggers, rows, proposal, orgEarly, orgFinal,
    promotedOffers, groupsV2: groupsWithVariants(groups, bigPrior, orgPrior),
    decay: { fromPp: lapL, toPp: decayed },
    offersOn: (day: number) => Object.fromEntries(GROUP_IDS.map((g) => [g, offerOn(segments[g], day)])) as Record<GroupId, OfferId>,
    countsAt: (day: number) => {
      const out = {} as Record<GroupId, ArmCounts>;
      const cost: Partial<Record<GroupId, number>> = {};
      for (const g of withCost) {
        const r = countsFor(g, segments[g.id], day);
        out[g.id] = r.counts;
        if (r.costPerOrder !== undefined) cost[g.id] = r.costPerOrder;
      }
      return { counts: out, cost };
    },
    withCost,
  };
}
