/**
 * v3 demo-mode routes (Praveen's live-site review): ask, don't assume; growth vs profit; margin squeeze;
 * offers beyond the menu; menu / minimum return / max discount changes; approve and resume; follow-ups.
 * Every number comes from a tool result.
 */
import type { GroupId, OfferId } from '../data/types';
import { tools, type RayCtx, type ToolCall } from './tools';
import type { QuickReply, RayReply } from './demoRouter';
import { groupIn, GROUP_WORD, offersIn, parseAmount } from './parse';
import { inr, inrSigned, num, pctSigned, xr } from '../lib/format';
import { groupLabel, offerLabel } from '../lib/labels';
import { MAX_DISCOUNT_PER_ORDER } from '../engine/guardrails';
import { pendingInputs } from '../state/inputs';
import { INPUT_LABEL } from '../state/store';
import { fmtDate } from '../lib/dates';

type Call = <R>(name: ToolCall['name'], args: Record<string, unknown>, fn: () => R) => R;
type Reply = (intent: string, text: string, extra?: Partial<RayReply>) => RayReply;

export const PLAN_CHIPS: QuickReply[] = [
  { label: 'Recommended offers not on my menu', message: 'What other offers should I try?' },
  { label: 'More new customers: what does it cost?', message: 'I want more new customers' },
  { label: 'What if my margin is lower?', message: 'What if my margin is lower?' },
  { label: 'Set a minimum return', message: 'Set a minimum return' },
];

const bullets = (xs: string[], n = 4) => xs.slice(0, n).map((x) => `- ${x}`).join('\n');
const isWhatIf = (t: string) => /\bwhat if\b|\bscenario\b|\btry\b|\bpreview\b|\bhow about\b|\bwhat about\b|\bwould\b|\bshould i\b/.test(t);
const CHANGE = /\b(add|remove|drop|set|make|change|use|turn (on|off)|allow|stop using|switch|put|include|exclude|lower|raise|cap|draft)\b/;

type Trade = ReturnType<typeof tools.get_tradeoffs>;
type Recs = ReturnType<typeof tools.get_recommended_offers>;

function tradeText(x: Trade, giveUp?: number, extra?: number, worthAsk = false): { text: string; next?: QuickReply; quick?: QuickReply[] } {
  const f = x.frontier;
  const unit = x.metric;
  const base = f[0];
  const gained = (p: Trade['frontier'][number]) => (unit === 'orders' ? p.extra_orders : p.extra_new_customers);
  if (f.length < 2) return { text: `At your numbers, no offer adds ${unit} beyond your most-profit plan (**${inrSigned(base.profit_month)} a month**). Adding offers to your menu or raising the budget can; see Recommended offers.`, next: { label: 'Recommended offers', message: 'What other offers should I try?' } };
  const step = (p: Trade['frontier'][number]) => p.profit_given_up <= 0
    ? `${p.option}: **+${num(gained(p))} ${unit}** and **${inr(-p.profit_given_up)}** more profit a month, with a ${inr(p.budget_needed)} budget`
    : `${p.option}: **+${num(gained(p))} ${unit}** for **${inr(p.profit_given_up)}** less profit a month${p.cost_per_extra !== null && p.cost_per_extra > 0 ? ` (this step ${inr(p.cost_per_extra)} each)` : ''}${p.needs_bigger_budget ? `, needs a ${inr(p.budget_needed)} budget` : ''}`;
  const draftNext = (p: Trade['frontier'][number]): QuickReply => ({ label: p.profit_given_up > 0 ? `Draft: give up ${inr(p.profit_given_up)} for +${num(gained(p))}` : `Draft: ${inr(p.budget_needed)} budget, +${num(gained(p))}`, message: `Draft growth step ${p.step}` });
  const stepChips = f.slice(1, 4).map(draftNext);
  const worth = unit === 'new customers' ? `\nEach new customer brings about **${inr(x.repeat_profit_per_new_customer_180d)}** of repeat profit in 180 days (${x.repeat_basis}), so a step costing less than that per customer pays back over time.` : '';
  if (worthAsk && unit === 'new customers') {
    const costs = f.slice(1).map((p) => p.cost_per_extra).filter((c): c is number => c !== null && c > 0);
    const repeat = x.repeat_profit_per_new_customer_180d;
    const paying = f.slice(1).filter((p) => p.cost_per_extra !== null && p.cost_per_extra <= repeat);
    if (!costs.length) return { text: `At your numbers there's no growth step to weigh: no offer adds new customers beyond the most-profit plan.` };
    return {
      text: `${paying.length ? `**Partly.** ${paying.length} step${paying.length > 1 ? 's' : ''} cost less per new customer than the ${inr(repeat)} of repeat profit a new customer brings in 180 days, so ${paying.length > 1 ? 'they pay' : 'it pays'} back over time.` : `**Not on repeat profit alone.** Each step costs ${inr(Math.min(...costs))}–${inr(Math.max(...costs))} per extra new customer, and a new customer brings about **${inr(repeat)}** of repeat profit in 180 days (${x.repeat_basis}).`} Growth beyond that is a choice to pay for customers (brand, longer-term value), and the card shows exactly what each step costs.`,
      quick: stepChips,
    };
  }
  if (extra !== undefined) {
    const p = x.reaches_extra;
    const last = f[f.length - 1];
    if (!p) return { text: `+${num(extra)} ${unit} isn't reachable with your menu and up to a ${inr(last.budget_needed)} budget. The most is **+${num(gained(last))}** for **${inr(Math.max(0, last.profit_given_up))}** less profit a month.${worth}`, next: draftNext(last) };
    return { text: `+${num(extra)} ${unit} a month costs about **${inr(Math.max(0, p.profit_given_up))}** of profit a month (you'd get **+${num(gained(p))}**${p.needs_bigger_budget ? `; needs a ${inr(p.budget_needed)} budget` : ''}):\n${bullets(f.slice(1, p.step + 1).map(step), 3)}${worth}\nShall I draft it? It only goes live when you approve.`, next: draftNext(p) };
  }
  if (giveUp !== undefined && x.within_give_up) {
    const p = x.within_give_up;
    if (p.step === 0) return { text: `Giving up ${inr(giveUp)} a month doesn't reach the first growth step (it costs **${inr(Math.max(0, f[1].profit_given_up))}** for **+${num(gained(f[1]))} ${unit}**). Your most-profit plan stays best.`, next: draftNext(f[1]) };
    return { text: `Up to ${inr(giveUp)} a month buys **+${num(gained(p))} ${unit}** (${num(unit === 'orders' ? p.orders_month : p.new_customers_month)} a month), profit **${inrSigned(p.profit_month)}**${p.needs_bigger_budget ? `, with a **${inr(p.budget_needed)}** budget` : ''}:\n${bullets(f.slice(1, p.step + 1).map(step), 3)}${worth}\nShall I draft it? It only goes live when you approve.`, next: draftNext(p) };
  }
  return {
    text: `Your most-profit plan makes **${inrSigned(base.profit_month)} a month** with **${num(unit === 'orders' ? base.orders_month : base.new_customers_month)} ${unit}**. Step by step (totals vs that plan):\n${bullets(f.slice(1).map(step), 3)}${worth}\nWhich one should I draft? Or tell me how much profit you'd give up.`,
    quick: stepChips,
  };
}

function squeezeText(x: Trade, keep?: number): { text: string; next?: QuickReply } {
  const rows = x.margin_squeeze;
  const mine = rows.find((r) => r.yours)!;
  const hit = (r: Trade['margin_squeeze'][number]) => (typeof r.profit_to_give_up_to_keep_todays_new_customers === 'number' ? (r.profit_to_give_up_to_keep_todays_new_customers < 1 ? 'no extra cost' : r.profit_to_give_up_to_keep_todays_new_customers < 100 ? `almost nothing (${inr(r.profit_to_give_up_to_keep_todays_new_customers)} a month)` : `give up **${inr(r.profit_to_give_up_to_keep_todays_new_customers)}** a month`) : 'not reachable within your budget');
  if (keep !== undefined) {
    const r = rows.find((y) => y.keep_per_1000 === keep);
    if (r && !r.yours) {
      return { text: `If you keep ₹${num(keep)} of ₹1,000 (${num(r.margin_pct, 1)}%), break-even rises to **${xr(r.break_even_x)}**: ${r.groups_with_offer} of 6 groups keep an offer and profit is **${inrSigned(r.profit_month)} a month** (now ${inrSigned(mine.profit_month)}).${r.offers_lost.length ? `\n- You'd lose: ${r.offers_lost.join('; ')}` : ''}\n- To keep today's ${num(mine.new_customers_month)} new customers anyway: ${hit(r)}\nIf that's your real margin now, I can draft it.`, next: { label: `Draft: I keep ₹${num(keep)} of ₹1,000`, message: `My margin is ${keep / 10}%` } };
    }
  }
  const lower = rows.filter((r) => r.keep_per_1000 < mine.keep_per_1000).sort((a, b) => b.keep_per_1000 - a.keep_per_1000);
  const lastPaying = [...rows].sort((a, b) => a.keep_per_1000 - b.keep_per_1000).find((r) => r.groups_with_offer > 0);
  const firstNone = [...rows].sort((a, b) => b.keep_per_1000 - a.keep_per_1000).find((r) => r.groups_with_offer === 0);
  const floorLine = lastPaying && firstNone && firstNone.keep_per_1000 < lastPaying.keep_per_1000 ? ` Offers still pay down to keeping **₹${num(lastPaying.keep_per_1000)}** of ₹1,000; at ₹${num(firstNone.keep_per_1000)} none do.` : '';
  return {
    text: `At your margin (keep ₹${num(mine.keep_per_1000)}) the plan makes **${inrSigned(mine.profit_month)} a month**.${floorLine} If you keep less of each sale:\n${bullets(lower.map((r) => `₹${num(r.keep_per_1000)}: ${r.groups_with_offer} groups keep an offer, **${inrSigned(r.profit_month)}**${r.offers_lost.length ? ` (loses ${r.offers_lost.map((o) => o.split(':')[0]).join(', ')})` : ''}; keeping today's new customers: ${hit(r)}`), 4)}\nThe table below has every step. Tell me what you keep from ₹1,000 and I'll run your exact number.`,
  };
}

function recText(x: Recs, offer?: OfferId, group?: GroupId): { text: string; next?: QuickReply } {
  const rows = x.offers.filter((r) => (!offer || r.offer_id === offer) && (!group || r.for_groups.includes(groupLabel(group))));
  const line = (r: Recs['offers'][number]) => r.status ? `**${r.offer}** for ${r.for_groups.join(', ')}: ${r.status} (see Experiments); no need to add it` : `**${r.offer}** for ${r.for_groups.join(', ')}: ${r.verdict === 'adds_profit' ? `**${inrSigned(r.profit_change_month)} a month**${Math.abs(r.new_customers_change_month) >= 1 ? `, new customers ${r.new_customers_change_month > 0 ? '+' : '−'}${num(Math.abs(r.new_customers_change_month))}` : ''}` : r.verdict === 'adds_growth' ? `more buyers but no extra profit at your numbers (${inrSigned(r.group_profit_month_if_used)} a month if used)` : r.verdict === 'idea' ? 'non-cash idea, needs its own test' : `doesn't pay back at your numbers (${xr(r.return_after_returns_x ?? 0)})`}${r.evidence.stores_tested ? ` · ${r.evidence.stores_tested} stores tested` : ''}`;
  if (!rows.length) {
    if (offer) return { text: `${offerLabel(offer)} is already on your menu, so the engine uses it wherever it pays.` };
    return { text: 'Every offer the playbook has for stores like yours is already on your menu.' };
  }
  const top = rows.find((r) => r.verdict === 'adds_profit' && !r.status) ?? rows.find((r) => !r.status) ?? rows[0];
  const add = top.offer_id !== 'early_access' && !top.status ? { label: `Add ${top.offer} to my menu`, message: `Add ${top.offer} to my menu` } : undefined;
  return {
    text: `${offer || group ? '' : `**${rows.filter((r) => !r.status).length} offer${rows.filter((r) => !r.status).length === 1 ? '' : 's'}** worth a look beyond your menu, scored at your numbers:\n`}${bullets(rows.map(line), 4)}\nEstimates from stores like yours (synthetic playbook); your holdout proves them.${add ? ` Want me to draft adding ${top.offer}?` : ''}`,
    next: add,
  };
}

export function routeV3(t: string, ctx: RayCtx, call: Call, reply: Reply): RayReply | null {
  const whatIf = isWhatIf(t);

  // Greetings and thanks.
  if (/^(hi|hello|hey|hii+|namaste|good (morning|afternoon|evening))\b(?! .*\b(payments?|settlements?|offers?|coupons?|plan)\b)/.test(t)) return reply('greeting', `Hi ${ctx.model.profile.founderName}. I can answer questions on payments, settlements and refunds, check how your coupons are doing, and set up Smart Offers with your own numbers. What would you like to look at?`);
  if (/^(thanks|thank you|great|cool|nice|perfect|awesome)\b/.test(t)) return reply('thanks', 'Anytime. Nothing changes until you approve it.');

  if (/^(who are you|what are you|who is ray|what is ray)\b/.test(t)) return reply('about_ray', `I'm Ray, the assistant in this dashboard. I answer questions on your payments, settlements and refunds, and I run Smart Offers: I suggest which shopper groups get which checkout offer (or none), show the trade-offs, and draft changes. I never change anything without your click. All data here is synthetic.`);
  if (/^(support|help ?& ?support|contact support|talk to (a )?human)\b/.test(t)) return reply('support', 'This is a concept demo, so there is no support desk behind it. I can help with payments, settlements, refunds and disputes, your coupons, and setting up or changing Smart Offers. What do you need?', { quick: [{ label: 'Payments last 7 days', message: 'Show my payments for the last 7 days' }, { label: 'How are my coupons doing?', message: 'How are my offers and coupons doing?' }] });

  // ALPHA10 advice ("is it worth it", "should I stop it").
  if (/\balpha10\b|\bwelcome code\b/.test(t) && /\bworth\b|\bstop\b|\bkill\b|\bremove\b|\bdrop\b|\bget rid\b|\bkeep\b|\bretire\b|\bturn off\b/.test(t)) {
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    if (ctx.approved) return reply('alpha10_verdict', `ALPHA10 is already retired: it stopped when you approved Smart Offers. Last month it returned ${xr(w.return_x)} after returns against a ${xr(w.break_even_x)} break-even and ${w.profit < 0 ? `lost ${inr(Math.abs(w.profit))}` : `made ${inr(w.profit)}`}.`);
    const stopAsk = /\bstop\b|\bkill\b|\bremove\b|\bdrop\b|\bget rid\b|\bretire\b|\bturn off\b/.test(t);
    return reply('alpha10_verdict', `${w.profit < 0 ? (stopAsk ? '**Yes, stop it.**' : '**No, it isn\'t worth it.**') : 'It roughly pays for itself.'} Last month ALPHA10 returned **${xr(w.return_x)}** after returns against a ${xr(w.break_even_x)} break-even, so it ${w.profit < 0 ? `lost **${inr(Math.abs(w.profit))}**` : `made **${inr(w.profit)}**`}; it paid **${inr(w.cost_per_extra_order ?? 0)}** for each order it created. Approving a Smart Offers plan retires it and keeps offers only where they pay. Want to see that plan?`, { card: { kind: 'waste' }, next: { label: 'Show the plan', message: 'Show me the most-profit plan' } });
  }
  if (/\b(share|%|percent|portion)\b.*\bsales\b.*\bdiscounts?\b|\bdiscounts?\b.*\b(share|%|percent)\b.*\bsales\b|\bshare of (my )?sales\b/.test(t)) {
    const st = call('get_store_summary', { period: 'last_month' }, () => tools.get_store_summary(ctx));
    return reply('discount_share', `**${num(st.discount_share_pct, 1)}%** of last month's sales went to discounts: ${inr(st.discounts)} of ${inr(st.sales)} (all codes, ${st.period}).`, { card: { kind: 'waste' } });
  }
  if (/\bhow many (extra )?orders\b.*\b(alpha10|code|coupon)\b|\b(alpha10|code|coupon)\b.*\bhow many (extra )?orders\b/.test(t)) {
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    return reply('alpha10_orders', `About **${num(w.extra_orders)} extra orders** last month: orders that wouldn't have happened without ALPHA10 (estimated from tests at similar stores; it ran with no holdout). The code was used on about ${num(w.orders_using_code ?? 0)} orders, so most of its discount went to people who'd have bought anyway.`, { card: { kind: 'waste' } });
  }
  if (/\b(would|will) (have )?(buy|bought) anyway\b|\bwould have bought\b/.test(t) && /\balpha10\b|\bcodes?\b|\bcoupons?\b|\bdiscount\b/.test(t)) {
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    return reply('alpha10_leak', `**${num(w.share_to_buyers_who_would_buy_anyway_pct ?? 0)}%** of ALPHA10's discount (${inr(w.discount_to_buyers_who_would_buy_anyway ?? 0)} of ${inr(w.spend)} last month) went to buyers who'd have bought anyway, across all groups. ${inr(w.to_returning)} of it went to returning buyers alone.`, { card: { kind: 'waste' } });
  }
  if (/(%|\bpercent\b|\bshare\b|\bhow much\b).*\b(discount|alpha10)\b.*\breturning\b|\breturning\b.*(%|\bpercent\b|\bshare\b)/.test(t)) {
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    return reply('alpha10_returning', `**${num(w.spend ? (w.to_returning / w.spend) * 100 : 0)}%** of ALPHA10's discount went to returning buyers last month: ${inr(w.to_returning)} of ${inr(w.spend)}. Returning buyers mostly buy without a code.`, { card: { kind: 'waste' } });
  }
  if (/\bhow many orders (used|use|with)\b.*\b(alpha10|code)\b/.test(t)) {
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    return reply('alpha10_orders', `About **${num(w.orders_using_code ?? 0)} orders** used ALPHA10 last month. Only about ${num(w.extra_orders)} of them were extra orders the code created; the rest would have bought anyway.`, { card: { kind: 'waste' } });
  }
  if (/\breturning (customers|buyers|shoppers)\b.*\b(using|use|used)\b.*\bcodes?\b/.test(t)) {
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    const c = call('get_creator_code_report', {}, () => tools.get_creator_code_report(ctx));
    const f = c.codes.filter((x) => x.flag);
    return reply('returning_codes', `Yes. ALPHA10 gave returning buyers **${inr(w.to_returning)}** last month, and creator codes gave them ${inr(c.monthly_discount_to_returning)} a month${f.length ? ` (${f.map((x) => `${x.code}: ${x.returning_share_pct}% of uses`).join(', ')})` : ''}. Returning buyers mostly buy without a code.`, { card: { kind: 'creators' } });
  }
  if (/\b(total|all) (my )?discounts?\b|\bhow much did (my )?discounts cost\b|\bdiscounts? cost (me)?\b/.test(t)) {
    const all = call('get_offer_waste', { code: 'ALL' }, () => tools.get_offer_waste(ctx, { code: 'ALL' }));
    return reply('discounts_total', `All codes together cost **${inr(all.spend)}** last month (ALPHA10 and creator codes) for ${inr(all.extra_sales)} of extra sales: ${xr(all.return_x)} after returns vs ${xr(all.break_even_x)} break-even, so they ${all.profit < 0 ? `lost **${inr(Math.abs(all.profit))}**` : `made **${inr(all.profit)}**`}.`, { card: { kind: 'waste' } });
  }
  if (/\bhow much (profit )?(would|do|will|should) i (give up|lose|sacrifice)\b/.test(t) && !/\d/.test(t)) {
    const metric: 'orders' | 'new_customers' = /\borders\b/.test(t) ? 'orders' : 'new_customers';
    const x = call('get_tradeoffs', { metric }, () => tools.get_tradeoffs(ctx, { metric }));
    const f = x.frontier;
    if (f.length < 2) return reply('tradeoff', `Nothing: at your numbers no offer adds ${x.metric} beyond the most-profit plan.`, { card: { kind: 'tradeoff', view: 'growth' } });
    const a = f[1], z = f[f.length - 1];
    return reply('tradeoff', `Between **${inr(Math.max(0, a.profit_given_up))}** a month (first step, +${num(metric === 'orders' ? a.extra_orders : a.extra_new_customers)} ${x.metric}) and **${inr(Math.max(0, z.profit_given_up))}** (all steps, +${num(metric === 'orders' ? z.extra_orders : z.extra_new_customers)}), depending on how far you go. Which one?`, {
      card: { kind: 'tradeoff', view: 'growth' }, quick: f.slice(1, 4).map((p) => ({ label: `Give up ${inr(Math.max(0, p.profit_given_up))}: +${num(metric === 'orders' ? p.extra_orders : p.extra_new_customers)}`, message: `Draft the growth option that gives up ₹${Math.max(0, p.profit_given_up)} a month` })),
    });
  }
  if (ctx.approved && ctx.derived.today && /\bexact(ly)?\b|\bguarantee|\bpromise|\bhow much will i (make|earn)|\bnext month\b/.test(t)) {
    const r = call('get_results', {}, () => tools.get_results(ctx, {}));
    const snap = call('get_engine_snapshot', {}, () => tools.get_engine_snapshot(ctx));
    return reply('no_promise', `No, I can't guarantee it. At the pace measured so far (day ${r.days}, against the holdout) you'd make about **${inrSigned(snap.results?.profit_month ?? 0)} a month** after returns; the return so far ranges ${xr(r.return_range[0])}–${xr(r.return_range[1])} (90%), so next month could land anywhere in that band.`);
  }

  // Approve / go live: only a human click spends money.
  if (/^(ok |yes |please )?(approve|confirm)( it| this| that| the plan| my plan| the draft)?\b|\bgo live\b|\bapprove (the |my )?plan\b|\bmake it live\b|\bcan you (approve|apply|confirm)\b|\b(approve|apply) (it|this|that) for me\b/.test(t)) {
    if (ctx.approved) return reply('approve_via_click', `Your plan is already live. Any change is a draft: tap **Approve** on its card, or **Approve changes** on the plan, to make it live. I can't approve for you.`);
    const pending = pendingInputs(ctx.approved, ctx.confirmed ?? {});
    return reply('approve_via_click', `I can't approve for you: only your click spends money.${pending.length ? ` First confirm **${pending.length} input${pending.length > 1 ? 's' : ''}** (${pending.map((k) => INPUT_LABEL[k].toLowerCase()).join(', ')}): use the typical values shown or enter yours.` : ''} Then tap **Approve & go live** on the plan.`, { card: { kind: 'plan_live' } });
  }

  // Resume after a pause.
  if (/\bresume\b|\bunpause\b|\bturn (it |smart offers )?back on\b|\brestart (smart offers|offers)\b/.test(t)) {
    const r = call('request_resume', {}, () => tools.request_resume(ctx));
    if ('error' in r) return reply('resume', ctx.approved ? 'Smart Offers is already running; nothing to resume.' : 'Smart Offers isn\'t live yet. Set it up and approve the plan first.');
    return reply('resume', 'Drafted: resume Smart Offers. The approved plan serves again from the next checkout; the holdout stays on. Confirm below.', { card: { kind: 'draft', draft: r.draft } });
  }

  // Your numbers: what's set, where each value came from, what stores your size use.
  if (/\b(my|the) (numbers|inputs|settings)\b|\bwhat (is|are) my (margin|budget|goal|settings|inputs|numbers)\b|\bwhat (budget|margin) am i\b|\b(margin|budget) set to\b|\bwhat did you assume\b|\bassum(e|ed|ing|ption)/.test(t) && !whatIf) {
    const b = call('get_setup_benchmarks', {}, () => tools.get_setup_benchmarks(ctx));
    const nc = b.not_confirmed;
    const askedK = /\bbudget\b/.test(t) ? 'Monthly budget' : /\bmargin\b|\bkeep\b/.test(t) ? 'What you keep from a ₹1,000 sale' : /\bgoal\b/.test(t) ? 'Goal' : null;
    const asked = askedK ? b.inputs.find((i) => i.input === askedK) : undefined;
    if (asked) return reply('my_numbers', `${asked.input}: **${asked.value}** (${asked.source}).${asked.source === 'not confirmed' ? ` That's a typical value for stores your size (${asked.typical_value}), not yours yet. Change it on the plan, or tell me your number.` : ''}`, { card: { kind: 'inputs' } });
    return reply('my_numbers', `${nc.length ? `**${nc.length} of your inputs aren't confirmed yet**, so I don't treat them as yours:` : 'Your numbers:'}\n${bullets(b.inputs.map((i) => `${i.input}: **${i.value}** (${i.source})`), 6)}${b.ok ? `\nTypical for ${b.peers.toLowerCase()} (${num(b.stores)} stores) is in the card. Change any value there.` : ''}`, { card: { kind: 'inputs' }, ...(nc.length ? { next: { label: 'Use typical values', message: 'Use typical values for my unconfirmed inputs' } } : {}) });
  }
  if (/\buse (the )?typical values?\b|\buse (the )?typical (for|numbers)\b/.test(t)) {
    const b = call('get_setup_benchmarks', {}, () => tools.get_setup_benchmarks(ctx));
    return reply('inputs_typical', b.not_confirmed.length ? `Tap **Use typical** on each input, or **Use these typical values** on the plan, to accept them. I won't accept them for you.` : 'All your inputs are confirmed.', { card: { kind: 'inputs' } });
  }
  if (/\bguardrails?\b|\bsafety (rules|limits)\b/.test(t)) {
    const s = ctx.approved ? ctx.derived.liveSettings : ctx.settings;
    return reply('guardrails', `Your guardrails:\n${bullets([`Max **${inr(Math.min(s.maxDiscountInr, MAX_DISCOUNT_PER_ORDER))}** off per order (never above ${inr(MAX_DISCOUNT_PER_ORDER)})`, `Budget hard stop **${inr(s.budget)}** a month; one offer per order`, `**${ctx.model.profile.holdoutPct}%** holdout never sees an offer`, `Minimum return: **${s.minReturn ? xr(s.minReturn) : `break-even (${xr(ctx.approved ? ctx.derived.breakEven : ctx.derived.draftBreakEven)})`}**${s.festiveWindow ? `; no offers on ${ctx.model.profile.upcomingDrop.name}` : ''}`], 4)}\nAny change is a draft you approve.`);
  }
  if (/\bbreak[- ]?even\b/.test(t) && /\bwhat|\bhow|\bmy\b|\bexplain/.test(t) && !CHANGE.test(t)) {
    const be = ctx.approved ? ctx.derived.breakEven : ctx.derived.draftBreakEven;
    const keep = (ctx.approved ? ctx.derived.liveSettings : ctx.settings).keepPer1000;
    return reply('break_even', `Break-even is **${xr(be)}** after returns: you keep ₹${num(keep)} of each ₹1,000, so a rupee of discount must bring back ${xr(be)} of kept sales to pay for itself (${num(ctx.derived.kept * 100)}% of extra sales are kept after returns and failed COD). Offers below it lose money.`, { next: { label: 'Set a minimum return', message: 'Set a minimum return' } });
  }

  // Menu, minimum return, max discount and growth CHANGES → drafts (what-ifs are scenarios below).
  const offs = offersIn(t);
  const minRet = t.match(/\b(min(imum)? return|return floor|floor)\b[^0-9]*(\d+(\.\d+)?)\s?x\b/) ?? t.match(/(\d+(\.\d+)?)\s?x\b.*\b(min(imum)? return|floor)\b/);
  if (!whatIf && CHANGE.test(t)) {
    const stepM = t.match(/\bgrowth (?:step|option) (\d+)\b/);
    if (stepM || (/\bgrowth option\b|\bgive up\b.*\b(for )?(more )?(new )?(customers|orders|growth)\b/.test(t) && /\b(draft|use|apply|set|choose|go with|give up)\b/.test(t))) {
      const amt = stepM ? 0 : parseAmount(t.replace(/\d+\s?%/g, '')) ?? 0;
      const metric: 'orders' | 'new_customers' = /\borders\b/.test(t) && !/customers/.test(t) ? 'orders' : 'new_customers';
      const tr = call('get_tradeoffs', { metric, ...(stepM ? {} : { give_up_inr: amt }) }, () => tools.get_tradeoffs(ctx, { metric, ...(stepM ? {} : { give_up_inr: amt }) }));
      const p = stepM ? tr.frontier[Math.min(Number(stepM[1]), tr.frontier.length - 1)] : tr.within_give_up!;
      const args = { budget: p.budget_needed, growth_metric: metric, growth_give_up_inr: p.growth_give_up_setting };
      const r = call('draft_settings_change', args, () => tools.draft_settings_change(ctx, args));
      return reply('growth_draft', `Drafted: **${p.option}**. ${p.profit_given_up > 0 ? `It gives up **${inr(p.profit_given_up)}** of profit a month for **+${num(metric === 'orders' ? p.extra_orders : p.extra_new_customers)}** ${metric === 'orders' ? 'orders' : 'new customers'}` : `It adds **+${num(metric === 'orders' ? p.extra_orders : p.extra_new_customers)}** ${metric === 'orders' ? 'orders' : 'new customers'} and ${inr(-p.profit_given_up)} more profit`}: profit ${inrSigned(r.plan.profit)} a month, ${num(r.plan.new_customers_month)} new customers${p.needs_bigger_budget ? `, budget ${inr(p.budget_needed)}` : ''}. Nothing changes until you click Approve.`, { card: { kind: 'draft', draft: r.draft } });
    }
    if (offs.length && /\bmenu\b|\badd\b|\bremove\b|\bdrop\b|\ballow\b|\bstop using\b|\binclude\b|\bexclude\b/.test(t) && !groupIn(t)) {
      const remove = /\b(remove|drop|stop using|exclude|take off|no more)\b/.test(t);
      const testing = !remove ? ctx.derived.learning?.rows.find((r) => r.challenger && offs.includes(r.challenger) && ['running', 'waiting', 'proposed'].includes(r.status)) : undefined;
      if (testing) return reply('menu_testing', `${offerLabel(testing.challenger!)} is already being tested on ${num(testing.trafficShare * 100)}% of ${groupLabel(testing.group)} (${testing.status === 'running' ? `decision ${testing.decisionDate ? fmtDate(testing.decisionDate, false) : 'at the next review'}` : 'waiting on your decision'}). Adding it to the whole menu now would skip that test. Approve the promotion in the weekly review once it's proven.`, { quick: [{ label: 'What is the agent testing?', message: 'What is the agent testing right now?' }] });
      const args = remove ? { remove_offers: offs.filter((o) => o !== 'none') } : { add_offers: offs.filter((o) => o !== 'none') };
      const r = call('draft_settings_change', args, () => tools.draft_settings_change(ctx, args));
      return reply('menu_draft', `Drafted: ${remove ? 'remove' : 'add'} **${offs.map(offerLabel).join(', ')}** ${remove ? 'from' : 'to'} your menu. The plan would make **${inrSigned(r.plan.profit)} a month** (spend ${inr(r.plan.spend)}).${r.diff.length > 1 ? ` Changes: ${r.diff.slice(1).join('; ')}.` : ' No group changes offer at your numbers.'} Nothing changes until you click Approve.`, { card: { kind: 'draft', draft: r.draft } });
    }
    if (/\bmax(imum)? discount\b|\bcap\b.*\boff\b/.test(t)) {
      const amt = parseAmount(t);
      if (amt !== null) {
        if (amt > MAX_DISCOUNT_PER_ORDER) return null; // the guardrail refusal handles it
        const r = call('draft_settings_change', { max_discount_inr: amt }, () => tools.draft_settings_change(ctx, { max_discount_inr: amt }));
        return reply('max_discount_draft', `Drafted: max discount **${inr(amt)}** per order. The plan would make **${inrSigned(r.plan.profit)} a month**${r.diff.length > 1 ? `; ${r.diff.slice(1).join('; ')}` : ''}. Nothing changes until you click Approve.`, { card: { kind: 'draft', draft: r.draft } });
      }
    }
    if (minRet || /\bbreak[- ]?even\b.*\b(min(imum)? return|floor)\b|\b(min(imum)? return|floor)\b.*\bbreak[- ]?even\b/.test(t)) {
      const x = minRet ? parseFloat(minRet[3] ?? minRet[1]) : null;
      const r = call('draft_settings_change', { min_return: x }, () => tools.draft_settings_change(ctx, { min_return: x }));
      const kept = r.plan.rows.filter((g) => g.offer !== 'none').length;
      return reply('min_return_draft', `Drafted: minimum return **${x ? xr(x) : 'break-even'}** after returns. ${kept ? `${kept} groups keep an offer: **${inrSigned(r.plan.profit)} a month**.` : `**No offer clears that bar, so every group gets no offer** and orders fall ${pctSigned(r.plan.orders_change_pct)} vs today.`}${r.diff.length > 1 ? ` Changes: ${r.diff.slice(1).join('; ')}.` : ''} Nothing changes until you click Approve.`, { card: { kind: 'draft', draft: r.draft } });
    }
    if (/\b(festive|drop)\b.*\b(rule|window|pause)\b|\boffers on (the )?(festive )?drop\b/.test(t)) {
      const on = !/\b(off|remove|allow offers|turn off|no rule)\b/.test(t);
      const r = call('draft_settings_change', { festive_window: on }, () => tools.draft_settings_change(ctx, { festive_window: on }));
      return reply('festive_draft', `Drafted: ${on ? 'no offers' : 'offers allowed'} on ${ctx.model.profile.upcomingDrop.name} (${ctx.model.profile.upcomingDrop.styles} styles for ${ctx.model.profile.upcomingDrop.fullPriceDays} days). ${on ? 'New styles sell at full price that week; everything else keeps its offer.' : 'Shoppers may get an offer on the new styles too.'} The monthly plan stays ${inrSigned(r.plan.profit)}. Nothing changes until you click Approve.`, { card: { kind: 'draft', draft: r.draft } });
    }
  }

  // Ask for the merchant's minimum return (never assume one).
  if (/^set (a |my )?min(imum)? return\.?$|\bwhat (minimum|min) return\b|\bminimum return\b\??$/.test(t)) {
    const b = call('get_setup_benchmarks', {}, () => tools.get_setup_benchmarks(ctx));
    if (!b.ok) return reply('ask_min_return', 'What minimum return after returns do you need from an offer? Tell me a number like 2.5x, or "break-even".');
    const be = b.min_return.break_even_x_at_your_margin;
    const hi = Math.round(be * 1.2 * 100) / 100;
    return reply('ask_min_return', `What minimum return after returns do you need from any offer? At your margin, break-even is **${xr(be)}** (below it an offer loses money).\n- ${b.min_return.break_even_pct}% of ${b.peers.toLowerCase()} use break-even\n- ${b.min_return.higher_pct}% ask for more, usually ${b.min_return.usual_higher} (**${xr(hi)}**)\nA higher bar keeps fewer offers. Which do you want?`, {
      quick: [{ label: `Break-even (${xr(be)})`, message: 'Use break-even as my minimum return' }, { label: `${b.min_return.usual_higher} (${xr(hi)})`, message: `Set my minimum return to ${hi}x` }, { label: 'What does a higher bar cost?', message: `What about ${hi}x?` }],
      next: { label: `What about ${hi}x?`, message: `What about ${hi}x?` },
    });
  }

  // Margin squeeze (before plain margin what-ifs).
  const pm = t.match(/(\d+(?:\.\d+)?)\s?%/);
  const keepM = t.match(/keep (?:only )?₹?\s?(\d+)/);
  if (/\bmargins?\b.*\b(squeez|drop|fall|fell|falls|lower|less|reduc|shrink|worse|worr|sensitiv|hit)\w*|\b(squeez|lower|drop)\w* margins?\b|\bminimum margin\b|\bhow sensitive\b|\bmargin\b.*\bwhat do i lose\b/.test(t)) {
    const keep = pm ? Math.round(parseFloat(pm[1]) * 10) : keepM ? Number(keepM[1]) : undefined;
    const args = { view: 'margin' as const, ...(keep !== undefined ? { keep_per_1000: keep } : {}) };
    const x = call('get_tradeoffs', args, () => tools.get_tradeoffs(ctx, args));
    const out = squeezeText(x, keep);
    return reply('margin_squeeze', out.text, { card: { kind: 'tradeoff', view: 'margin' }, next: out.next, quick: PLAN_CHIPS });
  }

  // Growth vs profit.
  if (/\bnew customers?\b|\bfirst[- ]time (buyers?|customers?)\b|\bgrowth\b|\bgrow\b|\bmore orders\b|\bmaximi[sz]e orders\b|\btrade[- ]?offs?\b|\bless profit\b|\bgive up\b|\bgiving up\b|\blosing ₹|\bhit can i take\b|\bcost per new customer\b|\bprofit (and|vs|or) growth\b|\bcare more about\b/.test(t)
    && !/\b(set|switch|change|make)\b.*\bgoal\b/.test(t)) {
    const metric = /\borders\b/.test(t) && !/customers?|buyers?/.test(t) ? 'orders' as const : 'new_customers' as const;
    const extraRaw = t.match(/(\d+)\s*more (new )?(customers|orders|buyers)/);
    // A rupee amount to give up: "give up ₹10,000", "losing 5k", "₹8,000 less profit" (never the customer count).
    const giveRaw = extraRaw ? null : t.match(/(?:give up|giving up|losing|lose|less profit of|accept)\D{0,12}(₹\s?\d[\d,]*(?:\.\d+)?\s?(?:k|lakh|l)?|\d[\d,]*(?:\.\d+)?\s?(?:k|lakh|l)\b|\d{1,3}(?:,\d{3})+|\d{4,})/) ?? t.match(/(₹\s?\d[\d,]*(?:\.\d+)?\s?(?:k|lakh|l)?)\s*(?:of )?(?:less )?profit/);
    const give = giveRaw ? parseAmount(giveRaw[1]) ?? undefined : undefined;
    const extra = extraRaw ? Number(extraRaw[1]) : undefined;
    const args = { metric, ...(give !== undefined ? { give_up_inr: give } : {}), ...(extra !== undefined ? { extra_customers: extra } : {}) };
    const x = call('get_tradeoffs', args, () => tools.get_tradeoffs(ctx, args));
    const worthAsk = /\bworth\b|\bpay(s)? (it )?back\b|\bcost per new customer\b|\bhit can i take\b/.test(t);
    const out = tradeText(x, give, extra, worthAsk);
    return reply('tradeoff', out.text, { card: { kind: 'tradeoff', view: 'growth' }, next: out.next, quick: out.quick ?? PLAN_CHIPS });
  }

  // Offers beyond the menu.
  const recAsk = /\b(other|new|more|better|different|recommend\w*|suggest\w*|extra)\b.*\boffers?\b|\boffers?\b.*\b(missing|not on my menu|haven'?t tried|ideas?)\b|\boffer ideas?\b|\bnon[- ]?cash\b|\bperks?\b|\bearly access\b|\brecommended offers\b|\bwhat (else|offers) (am i missing|should i (try|add))\b|\bany ideas\b/.test(t);
  const variant = offs.find((o) => o === 'flat_150' || o === 'free_shipping_999' || o === 'free_shipping_prepaid');
  const onlyVariantAsk = variant && /\?$|\bshould i\b|\bwhat about\b|\bworth\b|\btry\b/.test(t) && !CHANGE.test(t.replace(/\btry\b/, '').replace(/\bshould i\b/, ''));
  if (recAsk || onlyVariantAsk || (/\bshould i give\b.*\bsomething\b|\bbest offer for\b/.test(t) && groupIn(t))) {
    const x = call('get_recommended_offers', {}, () => tools.get_recommended_offers(ctx));
    const g = /\bbest offer for\b|\bgive\b.*\bsomething\b|\bearly access\b/.test(t) ? groupIn(t) ?? undefined : undefined;
    const out = recText(x, onlyVariantAsk ? variant : /\bearly access\b|\bnon[- ]?cash\b|\bperks?\b/.test(t) ? 'early_access' as OfferId : undefined, g);
    let text = out.text;
    if (g) {
      const e = call('explain_group', { group_id: g }, () => tools.explain_group(ctx, { group_id: g }));
      text = `${groupLabel(g)} get **${offerLabel(e.offer)}** today. ${e.explanation}\n${out.text}`;
    }
    return reply('recommend', text, { card: { kind: 'recommendations' }, next: out.next, quick: PLAN_CHIPS });
  }

  // Menu what-ifs: only allow / without / add an offer.
  if (whatIf && offs.length && /\bonly (allow|use|offer|run)\b|\bwithout\b|\bremove\b|\bdrop\b|\bno more\b|\badd(ed|ing)?\b/.test(t) && !groupIn(t)) {
    const args = /\bonly\b/.test(t) ? { allowed_offers: offs } : /\bwithout\b|\bremove\b|\bdrop\b|\bno more\b/.test(t) ? { remove_offers: offs } : { add_offers: offs };
    const s = call('simulate_plan', args, () => tools.simulate_plan(ctx, args));
    const phrase = 'allowed_offers' in args ? `With only ${offs.map(offerLabel).join(' and ')}` : 'remove_offers' in args ? `Without ${offs.map(offerLabel).join(' and ')}` : `With ${offs.map(offerLabel).join(' and ')} added`;
    return reply('menu_scenario', `${phrase}: **${inrSigned(s.profit)} a month** (${inrSigned(s.vs_current_profit)} vs now), spend ${inr(s.spend)}, orders ${pctSigned(s.orders_change_pct)} vs today, new customers ${s.vs_current_new_customers >= 0 ? '+' : '−'}${num(Math.abs(s.vs_current_new_customers))}. Preview only.`, { card: { kind: 'sim', title: `Scenario: ${s.scenario} (not applied)`, sim: s }, quick: PLAN_CHIPS });
  }

  if (/^why (are there )?no results\??$/.test(t)) return reply('why_no_results', ctx.approved ? 'Results start the day after go-live; the first weekly review comes a week later.' : 'There are no results because Smart Offers isn\'t live yet. Results come from comparing shoppers who saw an offer with the 10% who didn\'t, once a plan runs.', ctx.approved ? {} : { next: { label: 'Set up Smart Offers', message: 'Set up Smart Offers' } });

  // Holdout: what it is and what it costs.
  if (/\bholdout\b.*\bcost\b|\bcost\b.*\bholdout\b/.test(t)) {
    const c = ctx.approved ? ctx.derived.holdoutCostMonthLive : ctx.derived.holdoutCostMonth;
    return reply('holdout_cost', `The ${ctx.model.profile.holdoutPct}% holdout costs about **${inr(Math.max(0, c))} a month** in missed extra profit. That's the price of proof: it's how every result is measured against shoppers who saw no offer.`);
  }
  if (/\bhow does the holdout work\b|\bwhat is (a|the) holdout\b/.test(t)) return reply('holdout_explain', `${ctx.model.profile.holdoutPct}% of shoppers, picked at random once and kept for the whole pilot, never see an offer. Comparing them with everyone else measures what offers really add, with a 90% range, instead of guessing.`);

  // Budget outside the guardrail range: say so, then show the nearest allowed scenario.
  if (/\bbudget\b/.test(t)) {
    const amt = parseAmount(t.replace(/\d+\s?%/g, ''));
    if (amt !== null && (amt < 5000 || amt > 1_000_000)) {
      const b = amt < 5000 ? 5000 : 1_000_000;
      const s = call('simulate_plan', { budget: b }, () => tools.simulate_plan(ctx, { budget: b }));
      return reply('budget_range', `Budgets run from ₹5,000 to ₹10,00,000 a month (guardrail), so here is **${inr(b)}**: spend ${inr(s.spend)}, **${inrSigned(s.profit)} a month**, orders ${pctSigned(s.orders_change_pct)} vs today. Preview only.`, { card: { kind: 'sim', title: `Scenario: ${s.scenario} (not applied)`, sim: s } });
    }
  }

  // Cost per extra order of the PLAN (ALPHA10's is answered by the v2 route).
  if (/\bcost (me )?per (extra )?order\b/.test(t) && !/\balpha10\b|\bcoupons?\b|\bcodes?\b/.test(t) && ctx.approved && ctx.derived.today && !/\bplan\b/.test(t)) {
    const r = call('get_results', {}, () => tools.get_results(ctx, {}));
    return reply('plan_cpo', `Measured so far (day ${r.days}, against the holdout): **${inr(r.cost_per_extra_order ?? 0)}** in discounts per extra order, and each one earns you **${inr(r.earned_per_extra_order)}** after returns. Profit so far ${inrSigned(r.profit)}.`, { card: { kind: 'results', data: r } });
  }
  if (/\bcost (me )?per (extra )?order\b/.test(t) && !/\balpha10\b|\bcoupons?\b|\bcodes?\b/.test(t)) {
    const c = call('get_current_plan', {}, () => tools.get_current_plan(ctx));
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    if (c.cost_per_extra_order === null) return reply('plan_cpo', 'Your plan has no offers right now, so there is no cost per extra order.');
    return reply('plan_cpo', `Your plan pays **${inr(c.cost_per_extra_order)}** in discounts for each extra order; each one earns you **${inr(c.earned_per_extra_order)}** after returns, so the plan makes **${inrSigned(c.profit)} a month**. ALPHA10 paid **${inr(w.cost_per_extra_order ?? 0)}** per extra order last month.`, { card: { kind: 'sim', title: 'Current plan', sim: { ...c, vs_current_profit: 0, vs_alpha10_profit: 0, vs_current_new_customers: 0, applied: false } } });
  }

  // What if one group got a different offer (per-group override as a scenario, then a draft on "yes").
  const g1 = groupIn(t);
  if (whatIf && g1 && offs.length && !/\bwhy\b/.test(t)) {
    const o = offs[0];
    const gs = ctx.derived.planGroups.find((x) => x.id === g1)!;
    if (gs.priorLiftsPp[o] !== undefined) {
      const args = { overrides: { [g1]: o } as Partial<Record<GroupId, OfferId>> };
      const s = call('simulate_plan', args, () => tools.simulate_plan(ctx, args));
      const over = s.over_budget ? ` That spends ${inr(s.spend)}, over your ${inr(s.budget)} budget: the hard stop would switch offers off once the budget runs out, so you'd need about ${inr(Math.ceil(s.spend / 5000) * 5000)}.` : '';
      return reply('override_scenario', `If ${GROUP_WORD[g1]} get ${offerLabel(o)}: the plan makes **${inrSigned(s.profit)} a month** (${inrSigned(s.vs_current_profit)} vs now), orders ${pctSigned(s.orders_change_pct)} vs today.${over} ${s.vs_current_profit < 0 ? 'It costs you profit, so I don\'t recommend it unless you want those orders.' : 'It adds profit.'} Want me to draft it? It only goes live when you approve.`, {
        card: { kind: 'sim', title: `Scenario: ${s.scenario} (not applied)`, sim: s }, next: { label: `Draft: ${offerLabel(o)} for ${GROUP_WORD[g1]}`, message: `Give ${GROUP_WORD[g1]} ${offerLabel(o)}` }, about: { group: g1 },
      });
    }
  }

  // Margin and budget together.
  if (pm && /\bmargin\b/.test(t) && /\bbudget\b/.test(t)) {
    const amt = parseAmount(t.replace(/\d+(\.\d+)?\s?%/g, ''));
    if (amt !== null && amt >= 5000 && amt <= 1_000_000) {
      const args = { margin_pct: parseFloat(pm[1]), budget: amt };
      const s = call('simulate_plan', args, () => tools.simulate_plan(ctx, args));
      return reply('combo_scenario', `With ${s.scenario}: ${s.rows.filter((r) => r.offer !== 'none').length} groups keep an offer, spend ${inr(s.spend)}, **${inrSigned(s.profit)} a month**, orders ${pctSigned(s.orders_change_pct)} vs today. Preview only.`, { card: { kind: 'sim', title: `Scenario: ${s.scenario} (not applied)`, sim: s }, about: { kind: 'margin' } });
    }
  }

  // Goal what-ifs: keep orders steady (optionally "orders can drop only 3%").
  if (whatIf && (/\b(keep )?orders steady\b/.test(t) || /\borders\b.*\b(drop|fall)\b.*\d+\s?%/.test(t))) {
    const f = t.match(/(\d+(?:\.\d+)?)\s?%/);
    if (!f) {
      // Never assume how far orders may fall: ask, with options around today's plan.
      const c = call('get_current_plan', {}, () => tools.get_current_plan(ctx));
      const now = Math.abs(c.orders_change_pct);
      const opts = [Math.max(0, Math.ceil(now) - 1), Math.max(0, Math.ceil(now) - 2)].filter((x, i, a) => a.indexOf(x) === i);
      return reply('ask_orders_floor', `Your plan changes orders by **${pctSigned(c.orders_change_pct)}** vs today (offers that stop mostly went to people who'd buy anyway). How far may orders fall at most? Tell me a percentage and I'll show what holding it costs.`, {
        quick: opts.map((x) => ({ label: `At most ${x}%`, message: `What if orders can drop only ${x}%?` })), next: { label: `At most ${opts[0]}%`, message: `What if orders can drop only ${opts[0]}%?` },
      });
    }
    const args = { goal: 'orders_steady' as const, orders_floor_pct: parseFloat(f[1]) };
    const s = call('simulate_plan', args, () => tools.simulate_plan(ctx, args));
    return reply('goal_scenario', `Keeping orders within ${f[1]}% of today: ${s.infeasible ? `not reachable within your budget (best ${pctSigned(s.infeasible.best_change_pct)}${s.infeasible.raise_budget_to ? `; a ${inr(s.infeasible.raise_budget_to)} budget would reach it` : ''})` : `orders ${pctSigned(s.orders_change_pct)} vs today`}, **${inrSigned(s.profit)} a month** (${inrSigned(s.vs_current_profit)} vs most profit). Preview only.`, { card: { kind: 'sim', title: `Scenario: ${s.scenario} (not applied)`, sim: s } });
  }

  // "Edit my plan": the plan card has Edit (inline in chat).
  if (/^(edit|change|modify|update|tweak) (my |the )?(plan|numbers|settings)\b/.test(t)) return reply('edit_plan', 'Here is your plan. Tap **Edit** to change your numbers right here, or tell me a change ("set my budget to ₹80,000", "add ₹150 off to my menu"). Changes are drafts until you approve.', { card: { kind: 'plan_live' } });

  // The offer menu and how many groups get an offer.
  if (/\bwhat offers can i (use|run|give|offer)\b|\bmy (offer )?menu\b|\bwhich offers are allowed\b/.test(t) && !/\b(add|remove|drop|set|make|change)\b/.test(t)) {
    const s = ctx.approved ? ctx.derived.liveSettings : ctx.settings;
    const x = call('get_recommended_offers', {}, () => tools.get_recommended_offers(ctx));
    const top = x.offers.find((r) => r.verdict === 'adds_profit');
    return reply('menu', `Your offer menu: **${s.allowedOffers.map(offerLabel).join(', ')}**, at most **${inr(Math.min(s.maxDiscountInr, MAX_DISCOUNT_PER_ORDER))}** off per order. The engine picks one (or none) per group from it.${top ? ` Not on your menu yet: **${top.offer}** would add ${inrSigned(top.profit_change_month)} a month at your numbers.` : ''}`, { card: { kind: 'recommendations' }, ...(top ? { next: { label: `Add ${top.offer} to my menu`, message: `Add ${top.offer} to my menu` } } : {}) });
  }
  if (/\bhow many (groups|segments)\b/.test(t)) {
    const c = call('get_current_plan', {}, () => tools.get_current_plan(ctx));
    const on = c.rows.filter((r) => r.offer !== 'none');
    return reply('plan_groups', `**${on.length} of ${c.rows.length} groups** get an offer: ${on.map((r) => `${groupLabel(r.group)} (${r.offer_label})`).join(', ') || 'none'}. The rest buy without one, so an offer there mostly pays people who'd buy anyway.`, { card: { kind: 'plan_live' } });
  }

  // Short asks the v2 routes don't catch.
  if (/^(show )?(my |the )?experiments?\??$|^tests?\??$/.test(t)) {
    const snap = call('get_engine_snapshot', {}, () => tools.get_engine_snapshot(ctx));
    const running = snap.experiments.filter((e) => e.challenger && e.status !== 'none');
    return reply('testing', running.length ? `**${running.length} test${running.length > 1 ? 's' : ''}** in the loop:
${bullets(running.map((e) => `${e.group}: **${e.champion}** vs **${e.challenger}** (${e.status})`), 4)}
Agent Studio → Experiments has the details.` : snap.status.startsWith('not') ? 'No tests yet: they start after you approve a plan and the experiment space.' : 'No challenger is running right now; the holdout keeps measuring every group.');
  }
  const dayM = t.match(/\bday (7|14|20|30|60)\b/);
  if (dayM && /\b(projection|projected|forecast|results?|numbers|by)\b/.test(t)) {
    if (!ctx.approved) return reply('results', 'Smart Offers is not live yet, so there are no results or projections. Approve a plan first; results are measured against a 10% holdout.');
    const key = `day${dayM[1]}` as 'day7' | 'day14' | 'day20' | 'day30' | 'day60';
    const r = call('get_results', { snapshot: key }, () => tools.get_results(ctx, { snapshot: key }));
    return reply('results', `Day ${r.days}${r.projection ? ' (projection)' : ''}: ${inr(r.spend)} spent, **${num(r.extra_orders)} extra orders** (90% range ${num(r.extra_orders_range[0])}–${num(r.extra_orders_range[1])}), ${xr(r.return_x)} after returns, **${inrSigned(r.profit)}**. ${r.proof}`, { card: { kind: 'results', data: r } });
  }
  return null;
}

/** Group words for pronoun follow-ups ("give them ₹100 off" after a returning-customers answer). */
export const groupWord = (g: GroupId) => GROUP_WORD[g];
