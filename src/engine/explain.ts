/** Plain-language "why" text per group, built only from engine numbers. */
import { OFFER_BY_ID } from '../data/fixtures';
import type { GroupStats, OfferId } from '../data/types';
import { inr, num, roundHalfEven, xr } from '../lib/format';
import { breakEven, candidateOffers, perCheckout } from './economics';
import type { PlanRow } from './plan';

const per100 = (x: number) => num(x * 100, 0);

/** margin = marginRate; kept = v2 share kept after returns (returns shown net of it; break-even = 1 / margin). */
export function explainGroup(g: GroupStats, row: PlanRow, margin: number, kept = 1): string {
  const be = breakEven(margin);
  const alts = candidateOffers(g).map((o) => perCheckout(g, o, margin, undefined, kept));
  const base = `${num(g.baseConversion * 100)} in 100 buy without an offer.`;
  if (row.offer === 'none') {
    const best = alts.sort((a, b) => b.profit - a.profit)[0];
    if (!best) return `${base} No offer has been tested for this group.`;
    const lead = `${base} The best offer, ${OFFER_BY_ID[best.offer].label}, adds ${num(best.lift * 100, 1)} buyers per 100 but returns ${xr(best.ret)}, below break-even (${xr(be)}), so every rupee spent loses money.`;
    if (g.id === 'returning') return `${lead} Loyal buyers already buy; consider a non-cash perk (early access to drops, free exchanges) instead of a discount.`;
    if (g.id === 'new_creator') return `${lead} Creator codes keep running and are tracked separately.`;
    return lead;
  }
  const e = perCheckout(g, row.offer, margin, row.econ.lift * 100, kept);
  const others = alts.filter((a) => a.offer !== row.offer && a.ret >= be);
  let why = `${base} ${OFFER_BY_ID[row.offer].label} adds ${num(e.lift * 100, 1)} buyers per 100, costs ${inr(roundHalfEven(e.spend * 100))} per 100 checkouts and returns ${xr(e.ret)} (break-even ${xr(be)}).`;
  for (const o of others) {
    if (o.ret > e.ret && o.profit < e.profit) {
      why += ` ${OFFER_BY_ID[o.offer].label} has a higher ratio (${xr(o.ret)}) but makes less profit (${inr(o.profit * 100)} vs ${inr(e.profit * 100)} per 100 checkouts). Chosen for profit, not ratio.`;
    } else if (o.profit < e.profit) {
      why += ` ${OFFER_BY_ID[o.offer].label} would make ${inr(o.profit * 100)} per 100 checkouts vs ${inr(e.profit * 100)}.`;
    }
  }
  const below = alts.filter((a) => a.offer !== row.offer && a.ret < be);
  for (const o of below) why += ` ${OFFER_BY_ID[o.offer].label} returns ${xr(o.ret)}, below break-even.`;
  return why;
}

export const offerLabel = (o: OfferId): string => OFFER_BY_ID[o].label;
export const per100Text = per100;
