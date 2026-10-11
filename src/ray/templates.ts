/** Reply templates for demo mode. Every number comes from a tool result passed in. */
import { inr, inrSigned, num, pctSigned, xr } from '../lib/format';
import { FEATURES } from '../config/features';

/** "return after returns" in v2 (spec §5.3), "return" in v1. */
const RET = FEATURES.netReturns ? 'return after returns' : 'return';
/** Typical keep-per-₹1,000 guidance shown when a margin looks off. */
export const KEEP_GUIDANCE = FEATURES.netReturns ? { low: 400, high: 600, text: 'Typical apparel D2C keeps ₹400–600 after product, shipping, packaging and payment' } : { low: 350, high: 550, text: 'Most fashion brands keep ₹350–550' };
import { OFFER_BY_ID } from '../data/fixtures';
import type { tools } from './tools';

type Sim = ReturnType<typeof tools.simulate_plan>;
type Waste = ReturnType<typeof tools.get_offer_waste>;
type Results = ReturnType<typeof tools.get_results>;
type Bench = ReturnType<typeof tools.get_peer_benchmark>;
type Creators = ReturnType<typeof tools.get_creator_code_report>;
type Current = ReturnType<typeof tools.get_current_plan>;
type Pay = ReturnType<typeof tools.get_payments_summary>;
type Daily = ReturnType<typeof tools.get_daily_payments>;
type Setl = ReturnType<typeof tools.get_settlements>;
type Ref = ReturnType<typeof tools.get_refunds_and_disputes>;

const offersOn = (s: Sim) => s.rows.filter((r) => r.offer !== 'none');

const top = (xs: string[], n = 3) => xs.slice(0, n).map((x) => `- ${x}`).join('\n');

export const T = {
  whyAi: (w: ReturnType<typeof tools.get_why_ai>) => `On the same shoppers, Smart Offers makes **${inrSigned(w.same_shoppers_monthly_profit[2].profit)} a month**, vs **${inrSigned(w.same_shoppers_monthly_profit[1].profit)}** for a simple rule and **${inrSigned(w.same_shoppers_monthly_profit[0].profit)}** for ALPHA10 for everyone.\n${top(w.capabilities, 4)}\nWant to set it up?`,
  opportunities: (o: ReturnType<typeof tools.get_opportunities>) => {
    const hit = o.signals.filter((x) => x.breached);
    return `I found **${hit.length} signals** worth acting on.\n${top(hit.map((x) => `${x.label}: **${x.value}** (${x.threshold})`), 4)}${o.alerts.length ? `\n**Also:** ${o.alerts[0].title}.` : ''}\nShall I set up Smart Offers to fix it?`;
  },
  review: (r: ReturnType<typeof tools.get_weekly_review>) => {
    if (!r.available) return `No weekly review yet. ${'reason' in r ? r.reason : ''}`;
    const items = ('items' in r ? r.items : undefined) ?? [];
    const changes = items.filter((i) => i.needs_approval);
    return `**Week ${'week' in r ? r.week : ''} review** (${'date' in r ? r.date : ''}, ${'data_days' in r ? r.data_days : ''} days of data): ${changes.length ? `**${changes.length} change${changes.length > 1 ? 's' : ''}** need your approval.` : 'nothing needs your approval.'}\n${top(items.filter((i) => i.status !== 'control').map((i) => i.title), 4)}${'next_review' in r && r.next_review ? `\nNext review: ${r.next_review}.` : ''}`;
  },
  accuracy: (a: ReturnType<typeof tools.get_prediction_accuracy>, live: boolean) => live
    ? `**${a.inside_range} of ${a.total}** estimates made before launch fell inside the measured 90% range (day ${a.day}); median error **${num(a.median_error_pp, 1)} pp**.\n${top(a.groups.map((g) => `${g.group}: estimated +${num(g.estimate_pp, 1)} pp, measured ${g.measured_pp >= 0 ? '+' : ''}${num(g.measured_pp, 1)} pp`), 4)}`
    : 'Accuracy is measured once Smart Offers runs: the holdout checks every estimate made before launch.',
  pilot: (p: ReturnType<typeof tools.get_pilot_decision>, live: boolean) => live
    ? `${p.days_left > 0 ? `The free pilot ends in **${p.days_left} days**.` : '**The free pilot has ended.**'} Expected **${inrSigned(p.expected_profit_month)} a month**, ${RET} ${xr(p.return_x)} (range ${xr(p.return_range[0])}–${xr(p.return_range[1])}).\n- Proven: at least **${num(p.proven_extra_orders_at_least)} extra orders** over ${p.pilot_day} days\n- Fee if billed: **${inr(p.fee)}** (${p.fee_rule})\nYour choice: keep, extend 15 days, or stop.`
    : 'The pilot decision comes 30 days after you approve a plan.',
  impact: (m: ReturnType<typeof tools.get_impact_summary>) => `North star: **${m.north_star.metric}: ${inrSigned(m.north_star.value)}**.\n- ${FEATURES.netReturns ? 'Return after returns' : 'Return'} **${xr(m.return_x)}** (break-even ${xr(m.break_even_x)})${m.cost_per_extra_order !== null ? `\n- Cost per extra order **${inr(m.cost_per_extra_order)}** (each earns ${inr(m.earned_per_extra_order)} after returns)` : ''}${m.estimates_inside_range ? `\n- Estimates inside measured range: **${m.estimates_inside_range}**` : ''}\n- Budget: **${inr(m.budget)}** a month, hard stop\nThe Impact tab in Agent Studio has the full metric tree and guardrails.`,
  experiments: (e: ReturnType<typeof tools.get_next_experiments>) => `Here's what I'd test next. Each is a hypothesis with its own holdout and needs your approval:\n${top(e.experiments.map((x) => `**${x.title}**: ${x.why}`), 4)}`,
  help: () => "Here's what I can help with: payments, settlements, refunds and disputes for any period; how your coupons are doing; setting up Smart Offers and testing a budget, margin or return target; explaining why a shopper group gets an offer; and pilot results against the holdout.",
  payments: (s: Pay) => `${s.window}: **${inr(s.collected)}** collected from **${num(s.captured_payments)}** payments (${num(s.success_rate_pct, 1)}% success rate, ${num(s.failed_payments)} failed). UPI ${num(s.method_mix.upi.share_pct, 0)}%, cards ${num(s.method_mix.card.share_pct, 0)}%. ${s.refunds ? `${num(s.refunds)} refunds (${inr(s.refunded)}).` : 'No refunds.'} Fees ${inr(s.fees)} + GST ${inr(s.gst_on_fees)}.`,
  daily: (g: Daily) => `Day by day, ${g.window}: **${inr(g.total_collected)}** collected, about **${inr(g.average_per_day)} a day**. Best day ${g.best_day.date} (${inr(g.best_day.collected)}), lowest ${g.lowest_day.date} (${inr(g.lowest_day.collected)}). The second half of the period is ${g.second_half_vs_first_half_pct >= 0 ? 'up' : 'down'} ${num(Math.abs(g.second_half_vs_first_half_pct), 1)}% on the first.`,
  failed: (s: Pay) => `${num(s.failed_payments)} payments failed in ${s.window} (success rate ${num(s.success_rate_pct, 1)}%). Most failures are cancelled or expired UPI requests and failed card OTPs; customers usually retry. Here are the latest ones.`,
  settlements: (s: Setl, next: boolean) => {
    const nx = s.next_scheduled ? `Next settlement: **${inr(s.next_scheduled.amount)}** on ${s.next_scheduled.date}.` : 'No settlement is scheduled right now.';
    if (next) return `${nx} Your schedule is ${s.schedule}.`;
    return `${s.window}: ${num(s.settled_count)} settlements, **${inr(s.settled_amount)}** paid to your bank after ${inr(s.fees_and_gst)} fees and GST. ${nx}${s.available_for_instant !== null ? ` ${inr(s.available_for_instant)} is available to settle instantly.` : ''}`;
  },
  refunds: (r: Ref) => `${r.window}: ${num(r.refunds)} refunds, ${inr(r.refunded)}. Disputes: ${num(r.open_disputes)} open or under review out of ${num(r.disputes_all_time.length)} in six months.`,

  waste: (w: Waste) => `**${w.code} cost ${inr(w.spend)} last month** and brought ${inr(w.extra_sales)} of extra sales: ${xr(w.return_x)} ${RET} against a ${xr(w.break_even_x)} break-even, so it ${w.profit < 0 ? `lost **${inr(Math.abs(w.profit))}**` : `made **${inr(w.profit)}**`}.${w.cost_per_extra_order !== null ? ` It paid **${inr(w.cost_per_extra_order)}** in discounts for each order it created; each order earns you ${inr(w.earned_per_extra_order)} after returns.` : ''} ${inr(w.to_returning)} of it went to returning buyers who would have bought anyway.`,

  plan: (s: Sim) => {
    const on = offersOn(s);
    return `Here's the plan: offers for ${on.length} of ${s.rows.length} shopper groups, **${inr(s.spend)}** spend of your ${inr(s.budget)} budget, **${inr(s.extra_sales)}** extra sales at **${xr(s.return_x)}** ${RET} (likely ${xr(s.return_range[0])}–${xr(s.return_range[1])}), about **${inrSigned(s.profit)} a month**. Nothing goes live until you click Approve.`;
  },

  floorPushback: (want: number, s: Sim, s3: Sim | null, altFloor = 3) => {
    const on = offersOn(s).length;
    const head = on === 0
      ? `At ${xr(want, 1)} no offer qualifies, so every group goes to no offer and orders fall ${pctSigned(s.orders_change_pct)} versus today.`
      : `At ${xr(want, 1)} only ${on} group${on > 1 ? 's' : ''} keep an offer: ${inrSigned(s.profit)} a month, orders ${pctSigned(s.orders_change_pct)} versus today.`;
    const alt = s3 ? ` A ${xr(altFloor, 1)} floor keeps ${offersOn(s3).length} offer${offersOn(s3).length === 1 ? '' : 's'} (${inrSigned(s3.profit)}, orders ${pctSigned(s3.orders_change_pct)}); "Most profit" makes the most money while staying above break-even.` : '';
    return head + alt + ' Which would you like?';
  },

  floorResult: (want: number, s: Sim) => `With a ${xr(want, 1)} floor: ${inr(s.spend)} spend, ${inrSigned(s.profit)} a month, orders ${num(s.orders)} (${pctSigned(s.orders_change_pct)} versus today). This is a preview; your plan is unchanged.`,

  marginWarn: (pct: number) => `${num(pct)}% is unusual. ${KEEP_GUIDANCE.text} of a ₹1,000 sale (${KEEP_GUIDANCE.low / 10}–${KEEP_GUIDANCE.high / 10}%). A wrong margin flips which offers pay back. Can you confirm it?`,

  marginNone: (pct: number, oldProfit: number) => `At ${num(pct)}% margin no offer pays back (break-even rises to ${xr(100 / pct)}); the honest plan is no offers. The current plan would make ${inrSigned(oldProfit)} a month at that margin.`,

  marginResult: (pct: number, s: Sim) => `At ${num(pct)}% margin (break-even ${xr(s.break_even_x)}), ${offersOn(s).length} groups keep an offer: ${inr(s.spend)} spend, ${inrSigned(s.profit)} a month. Preview only.`,

  budget: (b: number, s: Sim) => `With ${inr(b)}: ${inr(s.spend)} spend, ${inr(s.extra_sales)} extra sales, ${inrSigned(s.profit)} a month, orders ${num(s.orders)} (${pctSigned(s.orders_change_pct)}). Offers kept: ${offersOn(s).map((r) => `${r.label.split(' · ').slice(0, 2).join(' · ')}: ${r.offer_label}`).join('; ') || 'none'}.`,

  override: (label: string, offer: string, d: { spend: number; extraOrders: number; ret: number; profit: number; vsNow?: { spend: number; extraOrders: number; profit: number } }) =>
    d.spend === 0 && d.vsNow
      ? `Drafted: ${label} gets no offer. It **saves ${inr(-d.vsNow.spend)} a month** in discounts for about ${num(Math.abs(d.vsNow.extraOrders))} fewer orders: profit change **${inrSigned(d.vsNow.profit)} a month**. I've only drafted it; it needs your Approve.`
      : `Drafted: ${label} gets ${offer}. It would cost **${inr(d.spend)} a month** for about ${num(d.extraOrders)} extra orders, ${xr(d.ret)} ${RET}: **${inrSigned(d.profit)} a month**${d.vsNow ? ` (${inrSigned(d.vsNow.profit)} vs now)` : ''}. I've only drafted it; it needs your Approve.`,

  noPromise: (c: Current) => `I can't promise an exact figure. Expected: **${inrSigned(c.profit)} a month** (likely ${inrSigned(c.profit_range[0])} to ${inrSigned(c.profit_range[1])}), ${RET} ${xr(c.return_x)} (likely ${xr(c.return_range[0])}–${xr(c.return_range[1])}). The holdout will measure your own numbers, and early weeks are still learning.`,

  results: (r: Results) => `Day ${r.days}${r.projection ? ' (projection)' : ''}: ${inr(r.spend)} spent, **${num(r.extra_orders)} extra orders** (90% range ${num(r.extra_orders_range[0])}–${num(r.extra_orders_range[1])}), ${RET} ${xr(r.return_x)} (range ${xr(r.return_range[0])}–${xr(r.return_range[1])}), ${inrSigned(r.profit)} so far.${r.cost_per_extra_order !== null ? ` Cost per extra order **${inr(r.cost_per_extra_order)}** vs ${inr(r.earned_per_extra_order)} earned.` : ''} ${r.proof}`,

  creators: (c: Creators) => {
    const flagged = c.codes.filter((x) => x.flag);
    return `${flagged.map((f) => `${f.code}: ${f.returning_uses} of ${f.uses} uses by returning buyers (${f.returning_share_pct}%)`).join('; ')}. Creator codes gave returning buyers ${inr(c.monthly_discount_to_returning)} a month. Limiting codes to first orders would save about ${inr(c.first_order_only_net_gain)} a month net. It's a suggestion: you can keep it as is.`;
  },

  benchmark: (b: Bench, what: string) => b.ok
    ? `Similar fashion stores (${(b as { pool_size: number }).pool_size} tests) typically see ${what} add about ${num((b as { median_lift_pp: number }).median_lift_pp, 1)} buyers per 100 checkouts (typical range ${num((b as { typical_range_pp: number[] }).typical_range_pp[0], 1)}–${num((b as { typical_range_pp: number[] }).typical_range_pp[1], 1)}).`
    : `I can't share that benchmark: ${(b as { reason: string }).reason}`,

  refuseOther: (bench: string) => `I can't share information about other businesses. Here's what similar fashion stores on Razorpay typically see: ${bench}`,
  refuseContact: () => "I can't share shoppers' contact details. Phone numbers stay masked (like +91 98••• ••210) everywhere in Smart Offers. I can tell you which group a shopper is in and what they saw.",
  refuseBanned: (what: string) => `I won't target by ${what}. Offers are decided by shopper group only: first order or not, days since last order, traffic source, creator code and cart value. Personal traits and devices are never used.`,
  refuseInjection: (cap: number) => `I can't do that. Offers are capped at ${inr(cap)} per order, stay within your budget, are chosen by shopper group, and any change needs your click on Approve. I can draft a change for one group if you like.`,
  pause: (scope: string) => `I've drafted a pause for ${scope === 'all' ? 'all offers' : scope}. Shoppers would see your store's default checkout. Confirm below if you want it.`,
  explainGroup: (label: string, text: string) => `${label}: ${text}`,
  explainShopper: (r: { shopper: string; group_label: string; offer_label: string; reason: string; holdout: boolean }) =>
    `${r.shopper} is in "${r.group_label}" and sees ${r.offer_label.toLowerCase()}. ${r.reason}`,
  storeSummary: (s: ReturnType<typeof tools.get_store_summary>) => `Last month (${s.period}): ${inr(s.sales)} sales from ${num(s.orders)} orders (${num(s.checkout_conversion_pct, 1)}% of ${num(s.checkouts)} checkouts), AOV ${inr(s.aov)}. Discounts were ${inr(s.discounts)} (${num(s.discount_share_pct, 1)}% of sales).`,
  offerName: (o: keyof typeof OFFER_BY_ID) => OFFER_BY_ID[o].label,
};
