/**
 * Weekly review (Monday 06:00). Built from what the holdout has measured so far:
 * per offer group -> proven / still learning (with an estimate of days to prove) / watch / switch,
 * plus a re-plan with blended lifts, the creator-code leak, budget pace and upcoming rule windows.
 */
import { OFFER_BY_ID } from '../data/fixtures';
import type { GroupId, GroupStats, OfferId } from '../data/types';
import { breakEven } from './economics';
import { NEAR_BREAK_EVEN_BAND } from './guardrails';
import { blendGroups, type Snapshot } from './measure';
import { buildPlan, offerMap, type PlanSettings } from './plan';
import { inr } from '../lib/format';
import { RETURN_LABEL } from './net';

export type ReviewAction = { type: 'override'; group: GroupId; offer: OfferId; from: OfferId } | { type: 'creator' };
/** No verdicts before this many days: avoids reacting to early noise. */
export const MIN_DAYS_TO_DECIDE = 14;
/** Beyond this, "days to prove" is not a useful number. */
const MAX_ETA_DAYS = 45;

export type ReviewItem = {
  id: string;
  kind: 'proven' | 'learning' | 'early' | 'watch' | 'switch' | 'no_lift' | 'creator' | 'festive' | 'budget' | 'control';
  group?: GroupId;
  title: string;
  detail: string;
  action?: ReviewAction;
};
export type WeeklyReview = { id: string; week: number; date: string; dataDays: number; items: ReviewItem[]; changes: number };

const Z = 1.645;

/** Days of data needed for the 90% range to clear zero, at the current lift and noise. */
export function daysToProve(liftLow: number, lift: number, days: number): number | null {
  if (lift <= 0) return null;
  const se = (lift - liftLow) / Z;
  const needed = days * ((Z * se) / lift) ** 2;
  return Math.max(0, Math.ceil(needed - days));
}

export function buildReview(opts: {
  week: number; date: string; snap: Snapshot; groups: GroupStats[]; liveOffers: Record<GroupId, OfferId>; settings: Partial<PlanSettings>;
  margin: number; budget: number; creatorLeak: { code: string; share: number; monthly: number } | null; creatorFixed: boolean;
  festive: { name: string; launch: string; styles: number; days: number } | null; label: (g: GroupId) => string;
}): WeeklyReview {
  const { week, date, snap, groups, liveOffers, margin, budget, label } = opts;
  const be = breakEven(margin);
  const id = `w${week}`;
  const items: ReviewItem[] = [];
  const replan = offerMap(buildPlan(blendGroups(groups, snap), opts.settings));

  for (const r of snap.rows) {
    const offer = liveOffers[r.group];
    const name = label(r.group);
    if (offer === 'none') {
      items.push({ id: `${id}-${r.group}`, kind: 'control', group: r.group, title: `${name}: no offer (fairness check)`, detail: `Neither side gets an offer, so any gap (${(r.treatedRate * 100).toFixed(1)}% vs ${(r.holdoutRate * 100).toFixed(1)}%) is noise from the small holdout. It checks the split is fair.` });
      continue;
    }
    const lift0 = (r.lift * 100).toFixed(1), lo0 = (r.liftLow * 100).toFixed(1), hi0 = (r.liftHigh * 100).toFixed(1);
    if (snap.days < MIN_DAYS_TO_DECIDE) {
      items.push({ id: `${id}-${r.group}`, kind: 'early', group: r.group, title: `${name}: early read, no decision yet`, detail: `${r.lift >= 0 ? '+' : ''}${lift0} pp so far (range ${lo0} to ${hi0}). I wait at least ${MIN_DAYS_TO_DECIDE} days before calling anything, so early noise doesn't change your offers.` });
      continue;
    }
    const better = replan[r.group];
    if (better !== offer) {
      items.push({ id: `${id}-${r.group}`, kind: 'switch', group: r.group, title: `${name}: switch to ${OFFER_BY_ID[better].label}`, detail: `With this store's own results blended in, ${OFFER_BY_ID[better].label} now makes more profit than ${OFFER_BY_ID[offer].label}.`, action: { type: 'override', group: r.group, offer: better, from: offer } });
      continue;
    }
    const lift = (r.lift * 100).toFixed(1), lo = (r.liftLow * 100).toFixed(1), hi = (r.liftHigh * 100).toFixed(1);
    if (r.lift <= 0) {
      items.push({ id: `${id}-${r.group}`, kind: 'no_lift', group: r.group, title: `${name}: no lift yet`, detail: `${OFFER_BY_ID[offer].label} shows ${lift} pp so far (range ${lo} to ${hi}). Too early to stop; if it stays at zero by day 30 I'll suggest removing it.` });
    } else if (Math.abs(r.ret - be) <= NEAR_BREAK_EVEN_BAND && r.ret > 0) {
      items.push({ id: `${id}-${r.group}`, kind: 'watch', group: r.group, title: `${name}: near break-even (${r.ret.toFixed(2)}x)`, detail: `${RETURN_LABEL} is within ${NEAR_BREAK_EVEN_BAND}x of break-even (${be.toFixed(2)}x). If it stays below break-even for 7 days it steps down to the next cheaper offer automatically.` });
    } else if (!r.stillLearning) {
      items.push({ id: `${id}-${r.group}`, kind: 'proven', group: r.group, title: `${name}: proven, keep ${OFFER_BY_ID[offer].label}`, detail: `+${lift} pp more buyers than the holdout (90% range ${lo} to ${hi}), ${RETURN_LABEL.toLowerCase()} ${r.ret.toFixed(2)}x.` });
    } else {
      const eta = daysToProve(r.liftLow, r.lift, snap.days);
      const when = eta === null ? '' : eta <= MAX_ETA_DAYS ? ` At this rate about ${eta} more days to prove it.` : ' The group is small, so it needs more data than a month gives; I\'ll judge it on profit range at day 60.';
      items.push({ id: `${id}-${r.group}`, kind: 'learning', group: r.group, title: `${name}: still learning`, detail: `+${lift} pp so far (range ${lo} to ${hi}).${when} Keeping the offer.` });
    }
  }

  if (opts.creatorLeak && !opts.creatorFixed) {
    items.push({ id: `${id}-creator`, kind: 'creator', title: `${opts.creatorLeak.code}: limit to first orders`, detail: `${Math.round(opts.creatorLeak.share * 100)}% of its uses are returning buyers: about ${inr(opts.creatorLeak.monthly)} a month in discounts they didn't need. Creator tracking stays the same.`, action: { type: 'creator' } });
  }
  const projected = (snap.spend * 30) / snap.days;
  items.push({ id: `${id}-budget`, kind: 'budget', title: `Budget pace: ${inr(projected)} projected for the month`, detail: projected > budget ? `Above your ${inr(budget)} budget: the hard stop switches offers off when it's used up.` : `${Math.round((projected / budget) * 100)}% of your ${inr(budget)} budget. On track.` });
  if (opts.festive) {
    items.push({ id: `${id}-festive`, kind: 'festive', title: `${opts.festive.name} starts ${opts.festive.launch}`, detail: `Offers pause on its ${opts.festive.styles} styles for ${opts.festive.days} days, as you set. Nothing to do.` });
  }
  return { id, week, date, dataDays: snap.days, items, changes: items.filter((i) => i.action).length };
}
