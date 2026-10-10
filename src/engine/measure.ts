/** Learning from the pilot (SPEC 6.4). Takes per-group, per-arm counts as input. */
import { OFFER_BY_ID, PROFILE } from '../data/fixtures';
import type { GroupId, GroupStats, OfferId } from '../data/types';
import { pilotCounts } from '../data/generator/alpha';
import { roundHalfEven } from '../lib/format';

export type ArmCounts = { treatedCheckouts: number; treatedOrders: number; holdoutCheckouts: number; holdoutOrders: number };

export type MeasuredRow = ArmCounts & {
  group: GroupId;
  offer: OfferId;
  treatedRate: number; // fraction
  holdoutRate: number;
  lift: number; // fraction
  liftLow: number;
  liftHigh: number;
  stillLearning: boolean;
  trustWeight: number;
  spend: number;
  extraOrders: number;
  extraSales: number;
  ret: number;
};

export type Snapshot = {
  days: number;
  rows: MeasuredRow[];
  spend: number;
  extraSales: number;
  extraOrders: number;
  extraOrdersLow: number;
  extraOrdersHigh: number;
  ret: number;
  retLow: number;
  retHigh: number;
  profit: number;
};

const Z90 = 1.645;
export const TRUST_K = 300;

export function measure(groups: GroupStats[], offerOf: Record<GroupId, OfferId>, counts: Record<GroupId, ArmCounts>, days: number, margin = PROFILE.marginPct / 100): Snapshot {
  let S = 0, X = 0, O = 0, VAR = 0;
  const rows: MeasuredRow[] = groups.map((g) => {
    const c = counts[g.id];
    const o = offerOf[g.id];
    const pt = c.treatedOrders / c.treatedCheckouts;
    const ph = c.holdoutOrders / c.holdoutCheckouts;
    const lift = pt - ph;
    const se = Math.sqrt((pt * (1 - pt)) / c.treatedCheckouts + (ph * (1 - ph)) / c.holdoutCheckouts);
    const extra = c.treatedCheckouts * lift;
    const spend = c.treatedOrders * OFFER_BY_ID[o].costPerOrderInr;
    const sales = extra * g.aovInr;
    if (o !== 'none') {
      S += spend; X += sales; O += extra;
      VAR += (c.treatedCheckouts * se) ** 2;
    }
    return {
      ...c, group: g.id, offer: o, treatedRate: pt, holdoutRate: ph, lift,
      liftLow: lift - Z90 * se, liftHigh: lift + Z90 * se, stillLearning: lift - Z90 * se <= 0,
      trustWeight: c.holdoutCheckouts / (c.holdoutCheckouts + TRUST_K),
      spend: o === 'none' ? 0 : spend, extraOrders: o === 'none' ? 0 : extra, extraSales: o === 'none' ? 0 : sales,
      ret: o === 'none' || !spend ? 0 : sales / spend,
    };
  });
  const sd = Math.sqrt(VAR);
  const mix = O ? X / O : 0;
  return {
    days, rows, spend: S, extraSales: X, extraOrders: O,
    extraOrdersLow: O - Z90 * sd, extraOrdersHigh: O + Z90 * sd,
    ret: S ? X / S : 0, retLow: S ? ((O - Z90 * sd) * mix) / S : 0, retHigh: S ? ((O + Z90 * sd) * mix) / S : 0,
    profit: X * margin - S,
  };
}

/** Counts from the formulas (day 60 needs no generated sessions). */
export function countsFromFormula(groups: GroupStats[], offerOf: Record<GroupId, OfferId>, actualLiftPp: Partial<Record<GroupId, number>>, days: number): Record<GroupId, ArmCounts> {
  return Object.fromEntries(groups.map((g) => [g.id, pilotCounts(g, offerOf[g.id], actualLiftPp[g.id] ?? 0, days)])) as Record<GroupId, ArmCounts>;
}

/** Blended lift for decisions: w = holdout / (holdout + 300). Returns pp. */
export function blendedLiftPp(row: MeasuredRow, priorPp: number): number {
  const w = row.holdoutCheckouts / (row.holdoutCheckouts + TRUST_K);
  return w * row.lift * 100 + (1 - w) * priorPp;
}

/** Groups with the blended lift table, ready for a weekly re-plan (engine only; no UI in v1). */
export function blendGroups(groups: GroupStats[], snap: Snapshot): GroupStats[] {
  return groups.map((g) => {
    const row = snap.rows.find((r) => r.group === g.id);
    if (!row || row.offer === 'none') return g;
    const prior = g.priorLiftsPp[row.offer] ?? 0;
    return { ...g, priorLiftsPp: { ...g.priorLiftsPp, [row.offer]: blendedLiftPp(row, prior) } };
  });
}

/** Fee basis (shown, not charged in the pilot): 1% of proven extra sales, capped at 20% of extra profit. */
/** Uses the snapshot's reported (rounded) figures, as the reference engine does. */
export function feeBasis(snap: Snapshot) {
  const mix = roundHalfEven(snap.extraSales) / roundHalfEven(snap.extraOrders, 1);
  const provenOrders = roundHalfEven(snap.extraOrdersLow);
  const provenSales = provenOrders * mix;
  const cap = 0.2 * Math.max(roundHalfEven(snap.profit), 0);
  return { avgExtraOrderValue: mix, provenExtraOrders: provenOrders, provenExtraSales: provenSales, fee: Math.min(0.01 * provenSales, cap), cap };
}
