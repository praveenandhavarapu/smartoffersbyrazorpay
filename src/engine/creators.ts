/** Creator-code report (SPEC 7.4). Mirrors reference_engine.creator_report(). */
import type { CreatorCode, GroupStats } from '../data/types';

export const CREATOR_MAX_DISCOUNT = 250;
export const LEAK_FLAG_SHARE = 0.3;

export function creatorReport(groups: GroupStats[], codes: CreatorCode[], margin = 0.4) {
  const rows = codes.map((c) => {
    const share = c.returningUses / c.uses;
    return { ...c, returningSharePct: share * 100, discountToReturning: c.returningUses * CREATOR_MAX_DISCOUNT, flag: share > LEAK_FLAG_SHARE };
  });
  const returningUses = codes.reduce((a, c) => a + c.returningUses, 0);
  const ret = groups.find((g) => g.id === 'returning')!;
  // First-order-only fix: returning buyers lose ₹250; ~3 in 100 of their code checkouts would not buy without it.
  const lostOrders = ret.checkouts * 0.25 * 0.03;
  const saved = returningUses * CREATOR_MAX_DISCOUNT;
  return {
    rows,
    totalUses: codes.reduce((a, c) => a + c.uses, 0),
    returningUses,
    monthlyDiscountToReturning: saved,
    firstOrderOnlyNetGain: saved - lostOrders * ret.aovInr * margin,
    lostOrders,
  };
}
