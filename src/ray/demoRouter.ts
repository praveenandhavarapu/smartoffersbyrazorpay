/**
 * Demo-mode Ray: keyword/regex intent rules -> the same tools as live mode -> templates.
 * Never invents a number: every figure in a reply comes from a tool result.
 */
import type { GroupId } from '../data/types';
import { tools, type Draft, type RayCtx, type ToolCall } from './tools';
import { PLAN_CHIPS, routeV3 } from './demoV3';
import { T } from './templates';
import { MAX_DISCOUNT_PER_ORDER } from '../engine/guardrails';
import { FEATURES } from '../config/features';
import { groupLabel } from '../lib/labels';
import { inr, inrSigned, xr } from '../lib/format';
import { GROUP_WORD, groupIn, normalize, offerIn, parseAmount, parseDays } from './parse';

export type QuickReply = { label: string; message: string };
export type RayCard =
  | { kind: 'plan_live' }
  | { kind: 'sim'; title: string; sim: ReturnType<typeof tools.simulate_plan> }
  /** v3: several scenarios side by side, in the order Ray ran them (titles say what changed). */
  | { kind: 'scenarios'; items: { title: string; sim: ReturnType<typeof tools.simulate_plan> }[] }
  | { kind: 'tradeoff'; view: 'growth' | 'margin' }
  | { kind: 'recommendations' }
  | { kind: 'inputs' }
  | { kind: 'draft'; draft: Draft }
  | { kind: 'help'; items: QuickReply[] }
  | { kind: 'waste' }
  | { kind: 'payments'; data: ReturnType<typeof tools.get_payments_summary> }
  | { kind: 'daily'; data: ReturnType<typeof tools.get_daily_payments> }
  | { kind: 'payments_list'; title: string; data: ReturnType<typeof tools.list_payments> }
  | { kind: 'settlements'; data: ReturnType<typeof tools.get_settlements> }
  | { kind: 'refunds'; data: ReturnType<typeof tools.get_refunds_and_disputes> }
  | { kind: 'results'; data: ReturnType<typeof tools.get_results> }
  | { kind: 'creators' }
  | { kind: 'opportunities' } | { kind: 'why_ai' } | { kind: 'review' } | { kind: 'accuracy' } | { kind: 'decision' } | { kind: 'impact' } | { kind: 'experiments' };

export type RayReply = {
  intent: string; text: string; card?: RayCard; quick?: QuickReply[]; toolCalls: ToolCall[]; refused?: boolean; startSetup?: boolean;
  /** v3: the step this reply offers; "yes" / "go ahead" runs it. */
  next?: QuickReply;
  /** v3: context for follow-ups ("what about 35%?", "why?", "give them ₹100 off"). */
  about?: { kind?: 'margin' | 'budget' | 'floor' | 'payments' | 'settlements' | 'refunds' | 'daily'; group?: GroupId; days?: number };
};

export { parseAmount, parseDays } from './parse';

export const FOLLOW_UPS: Record<string, QuickReply[]> = {
  payments: [
    { label: 'Show failed payments', message: 'Show my failed payments' },
    { label: 'Settlements for the same period', message: 'Show my settlements for the last 7 days' },
    { label: 'Last 30 days', message: 'Show my payments for the last 30 days' },
    { label: 'How are my offers and coupons doing?', message: 'How are my offers and coupons doing?' },
  ],
  settlements: [
    { label: 'When is my next settlement?', message: 'When is my next settlement?' },
    { label: 'Refunds and disputes', message: 'Show refunds and disputes for the last 30 days' },
    { label: 'Payments last 7 days', message: 'Show my payments for the last 7 days' },
  ],
  refunds: [
    { label: 'Show failed payments', message: 'Show my failed payments' },
    { label: 'Payments last 30 days', message: 'Show my payments for the last 30 days' },
  ],
  offers: [
    ...(FEATURES.rayV2 ? [{ label: 'What does ALPHA10 cost me per order?', message: 'What does ALPHA10 cost me per order?' }, { label: 'What do stores like mine run?', message: 'What do stores like mine run?' }] : []),
    { label: 'Set up Smart Offers', message: 'Set up Smart Offers' },
    { label: 'Why AI, not a rule?', message: 'Why AI, not a simple rule?' },
    { label: 'Are creator codes leaking?', message: 'Are creator codes leaking?' },
    { label: 'What do similar stores see?', message: 'What do similar stores typically see?' },
  ],
  // v3: no made-up targets (30%, 4x, ₹50,000): each chip asks about the merchant's own numbers.
  get plan() { return [...PLAN_CHIPS, { label: 'Why no offer for returning buyers?', message: 'Why does returning get no offer?' }]; },
  results: [
    ...(FEATURES.rayV2 ? [{ label: 'What is the agent testing right now?', message: 'What is the agent testing right now?' }, { label: 'Should the abandoned-cart agent offer discounts?', message: 'Should the abandoned-cart agent offer discounts?' }] : []),
    { label: 'What changed this week?', message: 'What changed this week?' },
    { label: 'How accurate were your estimates?', message: 'How accurate were your estimates?' },
    { label: 'Should I keep Smart Offers?', message: 'Should I keep Smart Offers after the pilot?' },
    { label: 'What should I try next?', message: 'What should I try next?' },
    { label: 'Why no offer for returning buyers?', message: 'Why does returning get no offer?' },
    { label: 'How much will I make next month?', message: 'How much will I make next month exactly?' },
  ],
};

const BRANDS = ['snitch', 'bewakoof', 'souled store', 'the souled store', 'rare rabbit', 'zara', 'h&m', 'uniqlo', 'nykaa', 'myntra', 'ajio', 'westside', 'libas', 'fabindia', 'biba', 'urbanic', 'roadster', 'powerlook', 'bonkers', 'wrogn', 'mokobara', 'boat', 'mamaearth', 'sugar', 'lenskart', 'campus', 'house of masaba', 'jaypore', 'tjori', 'virgio', 'freakins', 'comet', 'flipkart', 'amazon', 'meesho'];

/** v2: what-if cards are scenarios, never applied ("Scenario: margin 30% (not applied)"). */
const scenarioTitle = (what: string) => (FEATURES.rayV2 ? `Scenario: ${what} (not applied)` : `${what.replace(/^margin (.*)$/, '$1 margin')} (preview)`);

const SHOPPERS = ['priya', 'rohan', 'aisha', 'kavya', 'neha', 'vikram', 'sameer'];

const V2_CHIPS: QuickReply[] = [
  { label: 'What does ALPHA10 cost me per order?', message: 'What does ALPHA10 cost me per order?' },
  { label: 'What is the agent testing right now?', message: 'What is the agent testing right now?' },
  { label: 'Should the abandoned-cart agent offer discounts?', message: 'Should the abandoned-cart agent offer discounts?' },
  { label: 'What do stores like mine run?', message: 'What do stores like mine run?' },
];

const HELP: QuickReply[] = [
  ...(FEATURES.rayV2 ? V2_CHIPS : []),
  { label: 'Anything I should fix?', message: 'Anything I should fix?' },
  { label: 'Payments last 7 days', message: 'Show my payments for the last 7 days' },
  { label: 'Settlements', message: 'Show my settlements for the last 7 days' },
  { label: 'Offers & coupons', message: 'How are my offers and coupons doing?' },
  { label: 'Set up Smart Offers', message: 'Set up Smart Offers' },
  { label: 'My numbers vs stores my size', message: 'What are my numbers?' },
  { label: 'Growth vs profit', message: 'I want more new customers' },
  { label: 'How are results?', message: 'How are the results so far?' },
  { label: 'Creator codes', message: 'Are creator codes leaking?' },
];

export function route(message: string, ctx: RayCtx): RayReply {
  const t = normalize(message);
  const calls: ToolCall[] = [];
  const call = <R,>(name: ToolCall['name'], args: Record<string, unknown>, fn: () => R): R => {
    const result = fn();
    calls.push({ name, args, result });
    return result;
  };
  const reply = (intent: string, text: string, extra: Partial<RayReply> = {}): RayReply => ({ intent, text, toolCalls: calls, ...extra });
  const benchText = () => {
    const b = call('get_peer_benchmark', { group_id: 'new_ads_small', offer_id: 'free_shipping' }, () => tools.get_peer_benchmark(ctx, { group_id: 'new_ads_small', offer_id: 'free_shipping' }));
    return T.benchmark(b, 'free shipping for new shoppers from ads');
  };

  if (!t) return reply('help', T.help(), { card: { kind: 'help', items: HELP } });

  // 1. Other businesses: named brands, rankings, specific merchant ids.
  const ownId = ctx.model.profile.merchantId.toLowerCase();
  const namesBrand = BRANDS.some((b) => new RegExp(`(^|[^a-z])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(t));
  const otherAcc = (t.match(/acc_[a-z0-9]+/g) ?? []).some((id) => id !== ownId) || /merchant (id )?acc_/.test(t) && !t.includes(ownId);
  const ranking = /\btop \d*\s*(fashion )?(brands?|merchants?|stores?|sellers?)\b|\brank(ing|ed)?\b.*\b(brands?|merchants?|stores?)\b|\bcompetitors?\b|\bother (merchants?|brands?)\b.*\b(sales|revenue|data|doing)\b/.test(t);
  if (namesBrand || otherAcc || ranking) return reply('refuse_other_business', T.refuseOther(benchText()), { refused: true });

  // 2. Shopper contact details.
  if (/\b(phone|mobile|contact|email|e-mail|whatsapp number|address)\b/.test(t) && (SHOPPERS.some((s) => t.includes(s)) || /\b(customer|shopper|buyer)s?\b|\bher\b|\bhis\b/.test(t))) {
    return reply('refuse_contact', T.refuseContact(), { refused: true });
  }

  // 3. Banned signals.
  const banned = t.match(/\b(iphone|android|ios|device|os|gender|female|male|women|men|income|salary|rich|location|city|pincode|religion|caste)\b/);
  if (banned && /\b(target|give|offer|discount|bigger|more|segment|only)\b/.test(t)) {
    const w = banned[1];
    return reply('refuse_banned_signal', T.refuseBanned(['iphone', 'android', 'ios', 'os', 'device'].includes(w) ? 'device or OS' : ['gender', 'female', 'male', 'women', 'men'].includes(w) ? 'gender' : ['location', 'city', 'pincode'].includes(w) ? 'location' : ['income', 'salary', 'rich'].includes(w) ? 'income' : w), { refused: true, quick: [{ label: 'What groups can I target?', message: 'Show me the most-profit plan' }] });
  }

  // 4a. v2: named guardrails (uncapped budget, messaging shoppers, price changes).
  if (FEATURES.rayV2) {
    if (/\b(unlimited|uncapped|no) budget\b|\bremove (the )?budget (cap|limit)\b|\bwithout (a )?budget\b/.test(t)) return reply('refuse_guardrail', T.guardrail('monthly budget hard stop', 'Every plan has a budget between ₹5,000 and ₹10,00,000 a month, so spend can never run away.'), { refused: true, quick: [{ label: 'Show my guardrails', message: 'What are my guardrails?' }] });
    if (/\b(send|message|text|sms|whatsapp|email|notify|ping)\b.*\b(shoppers?|customers?|buyers?)\b/.test(t) && !/\bsummary\b/.test(t)) return reply('refuse_guardrail', T.guardrail('no shopper messaging', 'Smart Offers only decides what checkout shows; it never messages shoppers.'), { refused: true, quick: [{ label: 'Show my guardrails', message: 'What are my guardrails?' }] });
    if (/\b(raise|increase|lower|reduce|change|cut|hike)\b.*\bprices?\b|\bprice (change|hike|cut)\b/.test(t)) return reply('refuse_guardrail', T.guardrail('no price changes', 'It never changes product prices; it only chooses an approved offer, or none, per shopper group.'), { refused: true, quick: [{ label: 'Show my guardrails', message: 'What are my guardrails?' }] });
    const big = t.match(/₹\s?(\d[\d,]*)\s*off/);
    if (big && Number(big[1].replace(/,/g, '')) > MAX_DISCOUNT_PER_ORDER) return reply('refuse_guardrail', T.guardrail(`max discount ₹${MAX_DISCOUNT_PER_ORDER} per order`, 'Offers can never exceed your max discount per order.'), { refused: true, quick: [{ label: 'Show my guardrails', message: 'What are my guardrails?' }] });
  }

  // 4. Rule-breaking / injection.
  const pctOff = t.match(/(\d{1,3})\s?% off/);
  if (/ignore (all |your |previous |the )?(rules|instructions|guardrails)|jailbreak|bypass|no (cap|limit)s?\b/.test(t) || (pctOff && Number(pctOff[1]) >= 25) || /\beveryone\b.*\boff\b/.test(t)) {
    return reply('refuse_injection', T.refuseInjection(MAX_DISCOUNT_PER_ORDER), { refused: true, quick: [{ label: 'Show my guardrails', message: 'What are my guardrails?' }, { label: 'Show the plan', message: 'Show me the most-profit plan' }] });
  }

  const days = parseDays(t, new Date(ctx.ledger.now * 1000));
  const d = days ?? 7;

  // Account and support.
  if (/^(manage (my )?account|account settings?)\b/.test(t)) return reply('account', 'Account & Settings has your business profile, settlement schedule (next day or instant), Ray mode (Live or Demo), Smart Offers guardrails and the audit log. Open it from the left menu.', { quick: HELP });
  if (/^(help)$/.test(t)) return reply('help', T.help(), { card: { kind: 'help', items: HELP } });

  // v3: your numbers, trade-offs, offers beyond the menu, menu/minimum-return changes, approve/resume.
  const v3 = routeV3(t, ctx, call, reply);
  if (v3) return v3;

  // v2: answers over one engine snapshot.
  if (FEATURES.rayV2) {
    const snap = () => call('get_engine_snapshot', {}, () => tools.get_engine_snapshot(ctx));
    if (/\bcost (me )?per (extra )?order\b|\bper order\b.*\balpha10\b|\balpha10\b.*\bper order\b/.test(t)) return reply('alpha10_per_order', T.a10PerOrder(snap()), { card: { kind: 'waste' }, quick: FOLLOW_UPS.offers });
    if (/\b(agent )?testing\b|\bchallengers?\b|\bexperiments? (running|right now)\b|\bwhat is the agent (doing|testing)\b/.test(t)) return reply('testing', T.testing(snap()), { quick: FOLLOW_UPS.results });
    if (/\babandon(ed)?[- ]?cart\b|\bcart abandonment\b|\brecovery agent\b|\bother agents?\b/.test(t)) return reply('cart_agent', T.cartAgent(snap()), { quick: FOLLOW_UPS.results });
    if (/\bstores like (mine|me|ours)\b|\bwhat do (similar |other )?stores (like mine )?run\b|\bplaybook\b|\bworked (at|for) (similar|other) stores\b/.test(t)) return reply('stores_like_mine', T.storesLikeMine(snap()), { quick: FOLLOW_UPS.offers });
    // Budget, margin and goal CHANGES become a draft with a diff (what-ifs stay scenarios, below).
    const isWhatIf = /\bwhat if\b|\bscenario\b|\btry\b|\bpreview\b|\bhow about\b|\bwhat about\b/.test(t);
    const isChange = /\b(set|change|make|update|switch|raise|lower|increase|decrease|cut|use|move)\b.*\b(budget|margin|goal|keep)\b|\bmy (real )?margin is\b|\bi keep ₹?\s?\d+/.test(t);
    if (isChange && !isWhatIf) {
      const amt = /\bbudget\b/.test(t) ? parseAmount(t.replace(/\d+\s?%/g, '')) : null;
      const pm = t.match(/(\d+(?:\.\d+)?)\s?%/);
      const keepM = t.match(/keep ₹?\s?(\d+)/);
      const keep = /\bmargin\b|\bkeep\b/.test(t) ? (pm ? Math.round(parseFloat(pm[1]) * 10) : keepM ? Number(keepM[1]) : null) : null;
      const goal = /new customers?/.test(t) ? 'new_customers' : /steady|orders? steady/.test(t) ? 'orders_steady' : /most profit/.test(t) ? 'most_profit' : undefined;
      const floorPct = goal === 'orders_steady' ? t.match(/(\d+(?:\.\d+)?)\s?%/) : null;
      const args = { ...(amt && amt >= 1000 ? { budget: Math.min(Math.max(amt, 5000), 1000000) } : {}), ...(keep ? { keep_per_1000: keep } : {}), ...(goal ? { goal } : {}), ...(floorPct ? { orders_floor_pct: parseFloat(floorPct[1]) } : {}) } as { budget?: number; keep_per_1000?: number; goal?: 'most_profit' | 'new_customers' | 'orders_steady'; orders_floor_pct?: number };
      if (args.budget !== undefined || args.keep_per_1000 !== undefined || args.goal) {
        if (args.keep_per_1000 !== undefined && (args.keep_per_1000 < 200 || args.keep_per_1000 > 650)) {
          return reply('margin_warning', T.marginWarn(args.keep_per_1000 / 10), { card: { kind: 'draft', draft: { type: 'settings', patch: { keepPer1000: args.keep_per_1000 }, summary: `Use ${args.keep_per_1000 / 10}% margin (keep ₹${args.keep_per_1000} of ₹1,000)` } } });
        }
        const r = call('draft_settings_change', args, () => tools.draft_settings_change(ctx, args));
        const before = ctx.approved ? ctx.derived.live : ctx.derived.draft;
        const extra = {
          allNone: r.plan.rows.every((x) => x.offer === 'none'),
          budgetUnused: args.budget !== undefined && args.budget > before.settings.budget && r.plan.spend < args.budget * 0.97 ? r.plan.spend : null,
          goalOnly: Boolean(args.goal) && args.goal !== 'most_profit' && r.diff.length <= 1,
        };
        return reply('settings_draft', T.settingsDraft(r.diff, r.plan.profit, r.plan.spend, extra), { card: { kind: 'draft', draft: r.draft }, ...(extra.goalOnly ? { quick: [{ label: 'Growth vs profit', message: 'I want more new customers' }] } : {}) });
      }
    }
  }

  // Lifecycle: opportunities, why AI, weekly review, accuracy, pilot decision, impact, next experiments.
  if (/\bwhy (use )?ai\b|\bwhy not (just )?a (simple |fixed )?rule\b|\bbetter than a rule\b|\bwhat does (the )?ai do\b/.test(t)) {
    const w = call('get_why_ai', {}, () => tools.get_why_ai(ctx));
    return reply('why_ai', T.whyAi(w, ctx.approved), { card: { kind: 'why_ai' }, quick: FOLLOW_UPS.offers });
  }
  if (/\bopportunit|\banything (i should|to) (fix|know|do)\b|\bwhat should i (fix|look at)\b|\balerts?\b|\bnotifications?\b/.test(t)) {
    const o = call('get_opportunities', {}, () => tools.get_opportunities(ctx));
    return reply('opportunities', T.opportunities(o, ctx.approved), { card: { kind: 'opportunities' }, quick: FOLLOW_UPS.offers });
  }
  if (/\bweekly review\b|\bwhat changed\b|\bthis week\b|\bmonday\b|\breview\b/.test(t) && !/\breviews? (of|for) (my )?(store|product)\b/.test(t)) {
    const r = call('get_weekly_review', {}, () => tools.get_weekly_review(ctx));
    return reply('weekly_review', T.review(r), { card: r.available ? { kind: 'review' } : undefined, quick: FOLLOW_UPS.results });
  }
  if (/\bhow accurate\b|\baccuracy\b|\bpredict(ed|ion|ions)?\b|\bestimates?\b.*\b(right|wrong|accurate)\b/.test(t)) {
    const a = call('get_prediction_accuracy', {}, () => tools.get_prediction_accuracy(ctx));
    return reply('accuracy', T.accuracy(a, ctx.approved), { card: ctx.approved ? { kind: 'accuracy' } : undefined, quick: FOLLOW_UPS.results });
  }
  if (/\bshould i keep\b|\bkeep smart offers\b|\bpilot (end|ends|ending|decision)\b|\bday 30\b|\bafter the pilot\b|\bworth (it|paying)\b/.test(t) && !/\balpha10\b|\bcoupons?\b|\bcodes?\b/.test(t)) {
    const p = call('get_pilot_decision', {}, () => tools.get_pilot_decision(ctx));
    return reply('pilot_decision', T.pilot(p, ctx.approved), { card: ctx.approved ? { kind: 'decision' } : undefined, quick: FOLLOW_UPS.results });
  }
  if (/\bimpact\b|\bnorth star\b|\bsuccess metrics?\b|\bhow do (we|you|i) (know|measure)\b/.test(t)) {
    const m = call('get_impact_summary', {}, () => tools.get_impact_summary(ctx));
    return reply('impact', T.impact(m), { card: { kind: 'impact' }, quick: FOLLOW_UPS.results });
  }
  if (/\bwhat (should|can) i (try|test|do) next\b|\bnext experiments?\b|\bwhat else\b|\bexpand\b|\bgrow more\b/.test(t)) {
    const e = call('get_next_experiments', {}, () => tools.get_next_experiments(ctx));
    return reply('experiments', T.experiments(e), { card: { kind: 'experiments' }, quick: FOLLOW_UPS.results });
  }

  // Day-on-day trend / graph.
  if (/\bdod\b|\bday[- ]?on[- ]?day\b|\bday[- ]?by[- ]?day\b|\bdaily\b|\bper day\b|\bgraph\b|\bchart\b|\btrend\b|\beach day\b/.test(t) && !/\boffers?\b|\bcoupons?\b|\bplan\b|\bruns?\b/.test(t)) {
    const n = days ?? 10;
    const g = call('get_daily_payments', { days: n }, () => tools.get_daily_payments(ctx, { days: n }));
    return reply('daily', T.daily(g), { card: { kind: 'daily', data: g }, quick: FOLLOW_UPS.payments });
  }

  // Payments, settlements, refunds (dashboard data).
  if (/\bsettle(ment|ments|d)?\b|\bpayouts?\b|\butr\b/.test(t)) {
    const s = call('get_settlements', { days: d }, () => tools.get_settlements(ctx, { days: d }));
    return reply('settlements', T.settlements(s, /\bnext\b/.test(t)), { card: { kind: 'settlements', data: s }, quick: FOLLOW_UPS.settlements });
  }
  if (/\brefunds?\b|\bdisputes?\b|\bchargebacks?\b/.test(t)) {
    const r = call('get_refunds_and_disputes', { days: days ?? 30 }, () => tools.get_refunds_and_disputes(ctx, { days: days ?? 30 }));
    return reply('refunds', /\bdisputes?\b|\bchargebacks?\b/.test(t) ? T.disputes(r) : T.refunds(r), { card: { kind: 'refunds', data: r }, quick: FOLLOW_UPS.refunds });
  }
  if (/\bfail(ed|ing|s|ures?)?\b|\bdeclined\b|\bunsuccessful\b/.test(t) && /\bpayments?\b|\btransactions?\b/.test(t)) {
    const l = call('list_payments', { status: 'failed', limit: 6 }, () => tools.list_payments(ctx, { status: 'failed', limit: 6 }));
    const s = call('get_payments_summary', { days: d }, () => tools.get_payments_summary(ctx, { days: d }));
    return reply('failed_payments', T.failed(s), { card: { kind: 'payments_list', title: 'Latest failed payments', data: l }, quick: FOLLOW_UPS.payments });
  }
  if (/\bpayments?\b|\bcollect(ed|ions?|ing)?\b|\bhow much (money )?did i (make|get|earn)\b|\btransactions?\b|\brevenue\b|\breceived\b|\bupi\b|\bcards?\b|\bnetbanking\b|\bwallets?\b|\bsuccess rate\b|\bfees?\b|\bgst\b/.test(t) && !/\boffers?\b|\bcoupons?\b|\balpha10\b/.test(t)) {
    const yday = /\byesterday\b/.test(t);
    const pa = yday ? { days: 1, end_days_ago: 1 } : { days: d };
    const s = call('get_payments_summary', pa, () => tools.get_payments_summary(ctx, pa));
    const text = /\bfees?\b|\bgst\b|\bcharges\b/.test(t) ? T.fees(s) : /\bsuccess rate\b/.test(t) ? T.successRate(s) : /\bupi\b.*\b(share|%|split|vs)\b|\b(share|split|mix)\b.*\b(upi|cards?|methods?)\b|\bcards? vs upi\b|\bupi vs cards?\b/.test(t) ? T.paymentsMix(s) : T.payments(s);
    return reply('payments', text, { card: { kind: 'payments', data: s }, quick: FOLLOW_UPS.payments });
  }

  // Setup is a guided flow in the UI.
  if (/\bset ?up\b|\bget started\b|\bfix (it|this|my offers|my coupons)\b|^smart offers$|\bstart smart offers\b/.test(t) && !/\bplan\b|\bresults?\b/.test(t)) {
    return reply('start_setup', ctx.approved ? 'Smart Offers is already live. Let\'s go through your numbers: anything you change becomes a draft, and nothing live changes until you approve it.' : 'Let\'s set up Smart Offers. A few questions about your numbers (I show what stores your size use, but I don\'t assume anything), then the plan. Nothing goes live until you approve it.', { startSetup: true });
  }

  // 5. Return target ("I want 4x").
  const xm = t.match(/(\d+(?:\.\d+)?)\s?x\b/);
  if (xm && !/\bmargin\b/.test(t)) {
    const want = parseFloat(xm[1]);
    const s = call('simulate_plan', { floor_return: want }, () => tools.simulate_plan(ctx, { floor_return: want }));
    if (/what about|try|show|use|how about/.test(t) && want < 4) {
      return reply('floor_preview', T.floorResult(want, s), { card: { kind: 'sim', title: scenarioTitle(`${want}x floor`), sim: s } });
    }
    // Suggest the highest half-step floor below the ask that still keeps an offer (3x in v1).
    let alt = 3;
    if (FEATURES.netReturns) {
      alt = 0;
      for (let f = Math.floor(want * 2) / 2 - 0.5; f > ctx.derived.breakEven; f -= 0.5) {
        if (tools.simulate_plan(ctx, { floor_return: f }).rows.some((r) => r.offer !== 'none')) { alt = f; break; }
      }
    }
    const s3 = alt && want > alt ? call('simulate_plan', { floor_return: alt }, () => tools.simulate_plan(ctx, { floor_return: alt })) : null;
    const fb = ctx.derived.benchmark;
    return reply('floor_pushback', T.floorPushback(want, s, s3, alt) + (fb.ok ? ` (${fb.floor.breakEvenPct}% of stores your size ask offers only to beat break-even, ${xr(s.break_even_x)} at your margin.)` : ''), {
      card: { kind: 'sim', title: scenarioTitle(`${want}x floor`), sim: s },
      quick: [...(s3 ? [{ label: `What about ${alt}x?`, message: `What about ${alt}x?` }] : []), { label: `Use ${want}x anyway`, message: `Set my minimum return to ${want}x` }, { label: 'Keep most profit', message: 'Show me the most-profit plan' }],
    });
  }

  // 6. Margin.
  if (/\bmargin\b|\bkeep ₹?\s?\d+/.test(t)) {
    const pm = t.match(/(\d+(?:\.\d+)?)\s?%/);
    const keep = t.match(/keep ₹?\s?(\d+)/);
    const pct = pm ? parseFloat(pm[1]) : keep ? parseFloat(keep[1]) / 10 : null;
    if (pct !== null) {
      const bm = ctx.derived.benchmark;
      const typical = bm.ok ? { p25: bm.keepPer1000.p25, p75: bm.keepPer1000.p75, peers: bm.peerLabel } : undefined;
      if ((pct < 20 || pct > 65) && !/\bwhat if\b|\bwhat about\b|\bscenario\b|\btry\b/.test(t)) {
        return reply('margin_warning', T.marginWarn(pct, typical), {
          card: { kind: 'draft', draft: { type: 'settings', patch: { keepPer1000: Math.round(pct * 10) }, summary: `Use ${pct}% margin (keep ₹${Math.round(pct * 10)} of ₹1,000)` } },
          quick: bm.ok ? [{ label: `Typical: keep ₹${bm.keepPer1000.median}`, message: `What if I keep ₹${bm.keepPer1000.median} of ₹1,000?` }] : [],
        });
      }
      if (pct < 20 || pct > 65) {
        const s = call('simulate_plan', { margin_pct: pct }, () => tools.simulate_plan(ctx, { margin_pct: pct }));
        return reply('margin_sim', `${T.marginWarn(pct, typical).replace(/ Can you confirm it\?$/, '')} As a scenario: ${s.rows.filter((r) => r.offer !== 'none').length} groups keep an offer, **${inrSigned(s.profit)} a month**. Preview only.`, { card: { kind: 'sim', title: scenarioTitle(`margin ${pct}%`), sim: s } });
      }
      const s = call('simulate_plan', { margin_pct: pct }, () => tools.simulate_plan(ctx, { margin_pct: pct }));
      if (s.rows.every((r) => r.offer === 'none')) {
        const cur = call('get_current_plan', {}, () => tools.get_current_plan(ctx));
        const oldProfit = cur.extra_sales * ctx.derived.kept * (pct / 100) - cur.spend;
        return reply('margin_none', T.marginNone(pct, oldProfit), { card: { kind: 'sim', title: scenarioTitle(`margin ${pct}%`), sim: s } });
      }
      return reply('margin_sim', T.marginResult(pct, s), { card: { kind: 'sim', title: scenarioTitle(`margin ${pct}%`), sim: s } });
    }
  }

  // 7. Budget.
  if (/\bbudget\b/.test(t)) {
    const amt = parseAmount(t.replace(/\d+\s?%/g, ''));
    if (amt && amt >= 1000) {
      const b = Math.min(Math.max(amt, 5000), 1000000);
      const s = call('simulate_plan', { budget: b }, () => tools.simulate_plan(ctx, { budget: b }));
      const full = s.spend === 0 ? call('simulate_plan', { budget: 1000000 }, () => tools.simulate_plan(ctx, { budget: 1000000 })) : null;
      const cheap = full ? full.rows.filter((r) => r.spend > 0).sort((x, y) => x.spend - y.spend)[0] : undefined;
      return reply('budget_sim', T.budget(b, s, cheap ? { label: `${groupLabel(cheap.group)} on ${cheap.offer_label}`, spend: cheap.spend } : null), {
        card: { kind: 'sim', title: FEATURES.rayV2 ? scenarioTitle(`budget ₹${b.toLocaleString('en-IN')}`) : `Budget ${b.toLocaleString('en-IN')} (preview)`, sim: s },
        quick: [{ label: 'Back to most profit', message: 'Show me the most-profit plan' }],
      });
    }
  }

  // 8. Override a group's offer.
  const g = groupIn(t);
  const o = offerIn(t);
  if (g && o && /\b(give|offer|set|switch|move|change|put|let)\b/.test(t) && !/\bwhy\b|\bhow come\b/.test(t)) {
    const gs = ctx.derived.planGroups.find((x) => x.id === g)!;
    const nowOffer = (ctx.approved ? ctx.derived.live : ctx.derived.draft).rows.find((x) => x.group === g)!.offer;
    if (nowOffer === o) return reply('no_change', `${groupLabel(g)} already get ${T.offerName(o).toLowerCase()}, so there's nothing to change.`, { about: { group: g }, next: { label: 'Why?', message: `Why do ${GROUP_WORD[g]} get this offer?` } });
    if (o !== 'none' && gs.priorLiftsPp[o] === undefined) {
      const alts = (Object.keys(gs.priorLiftsPp) as typeof o[]).filter((x) => ctx.settings.allowedOffers.includes(x) || x === 'flat_150');
      return reply('override_no_evidence', `I have no test evidence for ${T.offerName(o).toLowerCase()} with this group, so I can't price it honestly.${alts.length ? ` I can price ${alts.map((x) => T.offerName(x)).join(' or ')} for them.` : ''} Want a scenario with ${alts.length ? T.offerName(alts[0]) : 'another offer'}?`, alts.length ? { next: { label: `What if they get ${T.offerName(alts[0])}?`, message: `What if ${GROUP_WORD[g]} get ${T.offerName(alts[0])}?` }, about: { group: g } } : { about: { group: g } });
    }
    const d = call('draft_plan_change', { group_id: g, offer_id: o }, () => tools.draft_plan_change(ctx, { group_id: g, offer_id: o }));
    if (d.draft.type !== 'override') return reply('help', T.help());
    return reply('draft_override', T.override(d.draft.groupLabel, T.offerName(o), d.draft), { card: { kind: 'draft', draft: d.draft } });
  }

  // 9. Promises / exact figures.
  if (/\bexact(ly)?\b|\bguarantee|\bpromise|\bhow much will i (make|earn)|\bnext month\b/.test(t)) {
    const c = call('get_current_plan', {}, () => tools.get_current_plan(ctx));
    return reply('no_promise', T.noPromise(c));
  }

  // 10. Pause / stop.
  if (/\b(pause|kill|stop|turn off|switch off)\b/.test(t)) {
    const scope = g ?? 'all';
    if (!ctx.approved) return reply('pause_not_live', 'Smart Offers isn\'t live yet, so there\'s nothing to pause. Your coupons (like ALPHA10) keep running as they are until you approve a plan.');
    if (ctx.killed && scope === 'all') return reply('pause_not_live', 'Smart Offers is already paused. Say "resume" when you want it back.', { next: { label: 'Resume', message: 'Resume Smart Offers' } });
    if (g && ctx.derived.liveOffers[g] === 'none') return reply('no_change', `${groupLabel(g)} already get no offer, so there's nothing to pause.`, { about: { group: g } });
    const d = call('request_pause', { scope }, () => tools.request_pause(ctx, { scope }));
    return reply('pause_draft', T.pause(scope), { card: { kind: 'draft', draft: d.draft } });
  }

  // 11. Shopper explanations.
  const who = SHOPPERS.find((s) => t.includes(s));
  if (who) {
    const r = call('explain_shopper', { example_id: who }, () => tools.explain_shopper(ctx, { example_id: who }));
    if ('error' in r) return reply('help', T.help());
    return reply('explain_shopper', T.explainShopper(r, ctx.approved && !ctx.killed));
  }

  // 12. Group explanations.
  if (g && /\bwhy\b|\bexplain\b/.test(t)) {
    const r = call('explain_group', { group_id: g }, () => tools.explain_group(ctx, { group_id: g }));
    return reply('explain_group', T.explainGroup(r.label, r.explanation));
  }

  if (/\bresults?\b|\bholdout\b|\bworking\b|\bproof\b|\bhow (is|are) (it|the offers|offers|things) (doing|going)\b|\bso far\b/.test(t)) {
    const r = call('get_results', {}, () => tools.get_results(ctx, {}));
    if (!ctx.approved) return reply('results', 'Smart Offers is not live yet, so there are no measured results. Set it up first; results are measured against a 10% holdout once it runs.', { quick: [{ label: 'Set up Smart Offers', message: 'Set up Smart Offers' }] });
    return reply('results', T.results(r), { card: { kind: 'results', data: r }, quick: FOLLOW_UPS.results });
  }

  if (/\bcreator|\bmeera|\bleak/.test(t)) {
    const c = call('get_creator_code_report', {}, () => tools.get_creator_code_report(ctx));
    return reply('creator_report', T.creators(c), { card: { kind: 'creators' }, quick: FOLLOW_UPS.offers });
  }

  if (/\bsimilar\b|\bbenchmark|\bpeers?\b|\btypical/.test(t)) return reply('benchmark', benchText());

  if (/\balpha10\b|\bwast(e|ing)|\bwhere did\b|\blast month\b.*\b(coupon|discount|code)|\bcoupons?\b|\bdiscounts?\b|\boffers? (and|&) coupons\b|\bwelcome code\b|\b(using|use) (my )?codes?\b/.test(t)) {
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    if (ctx.approved && ctx.derived.today) {
      const r = call('get_results', {}, () => tools.get_results(ctx, {}));
      return reply('offer_waste', `**Smart Offers, day ${r.days}:** ${inrSigned(r.profit)} so far after returns, ${xr(r.return_x)} return, ${inr(r.cost_per_extra_order ?? 0)} per extra order. ${r.proof}\n**Before go-live**, ALPHA10 ${w.profit < 0 ? `lost ${inr(Math.abs(w.profit))}` : `made ${inr(w.profit)}`} in a month (${xr(w.return_x)} vs ${xr(w.break_even_x)} break-even); it was retired when you approved the plan.`, { card: { kind: 'results', data: r }, quick: FOLLOW_UPS.results });
    }
    return reply('offer_waste', T.waste(w), { card: { kind: 'waste' }, quick: FOLLOW_UPS.offers });
  }

  if (/\bplan\b|\bfix\b|\bset ?up\b|\bsmart offers?\b|\brecommend|\boptimi[sz]e|\bmost profit|\bwhich offers?\b/.test(t)) {
    const s = call('simulate_plan', {}, () => tools.simulate_plan(ctx, {}));
    return reply('plan', T.plan(s, ctx.approved), { card: { kind: 'plan_live' }, quick: FOLLOW_UPS.plan });
  }

  if (/\bsales\b|\bsummary\b|\bkpis?\b|\bhow did\b|\borders\b/.test(t)) {
    const s = call('get_store_summary', { period: 'last_month' }, () => tools.get_store_summary(ctx));
    return reply('store_summary', T.storeSummary(s));
  }

  return reply('help', T.help(), { card: { kind: 'help', items: HELP } });
}
