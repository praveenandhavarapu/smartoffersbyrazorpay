/**
 * Demo-mode Ray: keyword/regex intent rules -> the same tools as live mode -> templates.
 * Never invents a number: every figure in a reply comes from a tool result.
 */
import type { GroupId, OfferId } from '../data/types';
import { tools, type Draft, type RayCtx, type ToolCall } from './tools';
import { T } from './templates';
import { MAX_DISCOUNT_PER_ORDER } from '../engine/guardrails';
import { DEFAULT_KEEP_PER_1000 } from '../engine/net';
import { FEATURES } from '../config/features';

export type QuickReply = { label: string; message: string };
export type RayCard =
  | { kind: 'plan_live' }
  | { kind: 'sim'; title: string; sim: ReturnType<typeof tools.simulate_plan> }
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

export type RayReply = { intent: string; text: string; card?: RayCard; quick?: QuickReply[]; toolCalls: ToolCall[]; refused?: boolean; startSetup?: boolean };

/** "last 5 days", "this week", "last month", "6 months" -> days (ending today). */
export function parseDays(t: string, today: Date): number | null {
  const n = t.match(/\b(?:last|past|previous)?\s*(\d{1,3})\s*days?\b/);
  if (n) return Number(n[1]);
  const m = t.match(/\b(\d{1,2}|six|three)\s*months?\b/);
  if (m) return Math.round((m[1] === 'six' ? 6 : m[1] === 'three' ? 3 : Number(m[1])) * 30.5);
  if (/\btoday\b/.test(t)) return 1;
  if (/\byesterday\b/.test(t)) return 2;
  if (/\b(this|last|past) week\b/.test(t)) return 7;
  if (/\bthis month\b/.test(t)) return today.getUTCDate();
  if (/\b(last|past|previous) month\b|\b30 days\b/.test(t)) return 30;
  if (/\bquarter\b/.test(t)) return 91;
  if (/\b(half|six)[- ]year|\ball time\b/.test(t)) return 183;
  return null;
}

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
  plan: [
    { label: 'What if my margin is 30%?', message: 'What if my margin is 30%?' },
    { label: 'I want 4x return', message: 'I want 4x return' },
    { label: 'Try a ₹50,000 budget', message: 'What if my budget is ₹50,000?' },
    { label: 'Why no offer for returning buyers?', message: 'Why does returning get no offer?' },
  ],
  results: [
    ...(FEATURES.rayV2 ? [{ label: 'What is the agent testing right now?', message: 'What is the agent testing right now?' }, { label: 'Should the abandoned-cart agent offer discounts?', message: 'Should the abandoned-cart agent offer discounts?' }] : []),
    { label: 'What changed this week?', message: 'What changed this week?' },
    { label: 'How accurate were your estimates?', message: 'How accurate were your estimates?' },
    { label: 'Should I keep Smart Offers?', message: 'Should I keep Smart Offers after the pilot?' },
    { label: 'What should I try next?', message: 'What should I try next?' },
    { label: 'Why no offer for returning buyers?', message: 'Why does returning get no offer?' },
    { label: 'Give returning customers ₹100 off', message: 'Give returning customers ₹100 off' },
    { label: 'How much will I make next month?', message: 'How much will I make next month exactly?' },
  ],
};

const BRANDS = ['snitch', 'bewakoof', 'souled store', 'the souled store', 'rare rabbit', 'zara', 'h&m', 'uniqlo', 'nykaa', 'myntra', 'ajio', 'westside', 'libas', 'fabindia', 'biba', 'urbanic', 'roadster', 'powerlook', 'bonkers', 'wrogn', 'mokobara', 'boat', 'mamaearth', 'sugar', 'lenskart', 'campus', 'house of masaba', 'jaypore', 'tjori', 'virgio', 'freakins', 'comet', 'flipkart', 'amazon', 'meesho'];

const GROUP_WORDS: [RegExp, GroupId][] = [
  [/\b(returning|repeat|loyal|existing)\b/, 'returning'],
  [/\blapsed\b|\bwin[- ]?back\b|\bdormant\b/, 'lapsed'],
  [/\borganic\b|\bdirect\b|\bsearch\b/, 'new_organic'],
  [/\bcreator\b|\binfluencer\b/, 'new_creator'],
  [/\bbig (cart|basket)s?\b|\b(1,?500|1\.5k)\+/, 'new_ads_big'],
  [/\b(ads?|instagram|meta|facebook|paid)\b/, 'new_ads_small'],
];

function groupIn(t: string): GroupId | null {
  for (const [re, g] of GROUP_WORDS) if (re.test(t)) return g;
  return null;
}

function offerIn(t: string): OfferId | null {
  if (/free shipping|free delivery/.test(t)) return 'free_shipping';
  if (/(₹|rs\.?\s?|inr\s?)?200( rupees)? off|₹\s?200\b/.test(t)) return 'flat_200';
  if (/(₹|rs\.?\s?|inr\s?)?100( rupees)? off|₹\s?100\b/.test(t)) return 'flat_100';
  if (/\bno offer\b|\bnothing\b|\bstop offers? for\b/.test(t)) return 'none';
  return null;
}

/** "₹50,000", "50k", "1 lakh", "1.5L" -> rupees */
export function parseAmount(t: string): number | null {
  const m = t.match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lac|lakhs)?\b/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  const u = (m[2] ?? '').toLowerCase();
  return u === 'k' || u === 'thousand' ? v * 1000 : u.startsWith('l') ? v * 100000 : v;
}

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
  { label: 'What if margin is 30%?', message: 'What if my margin is 30%?' },
  { label: 'Try a ₹50,000 budget', message: 'What if my budget is ₹50,000?' },
  { label: 'How are results?', message: 'How are the results so far?' },
  { label: 'Creator codes', message: 'Are creator codes leaking?' },
];

export function route(message: string, ctx: RayCtx): RayReply {
  const t = message.toLowerCase().replace(/\s+/g, ' ').trim();
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
    return reply('refuse_banned_signal', T.refuseBanned(banned[1] === 'iphone' || banned[1] === 'android' || banned[1] === 'ios' || banned[1] === 'os' ? 'device or OS' : banned[1]), { refused: true });
  }

  // 4a. v2: named guardrails (uncapped budget, messaging shoppers, price changes).
  if (FEATURES.rayV2) {
    if (/\b(unlimited|uncapped|no) budget\b|\bremove (the )?budget (cap|limit)\b|\bwithout (a )?budget\b/.test(t)) return reply('refuse_guardrail', T.guardrail('monthly budget hard stop', 'Every plan has a budget between ₹5,000 and ₹10,00,000 a month, so spend can never run away.'), { refused: true });
    if (/\b(send|message|text|sms|whatsapp|email|notify|ping)\b.*\b(shoppers?|customers?|buyers?)\b/.test(t) && !/\bsummary\b/.test(t)) return reply('refuse_guardrail', T.guardrail('no shopper messaging', 'Smart Offers only decides what checkout shows; it never messages shoppers.'), { refused: true });
    if (/\b(raise|increase|lower|reduce|change|cut|hike)\b.*\bprices?\b|\bprice (change|hike|cut)\b/.test(t)) return reply('refuse_guardrail', T.guardrail('no price changes', 'It never changes product prices; it only chooses an approved offer, or none, per shopper group.'), { refused: true });
    const big = t.match(/₹\s?(\d[\d,]*)\s*off/);
    if (big && Number(big[1].replace(/,/g, '')) > MAX_DISCOUNT_PER_ORDER) return reply('refuse_guardrail', T.guardrail(`max discount ₹${MAX_DISCOUNT_PER_ORDER} per order`, 'Offers can never exceed your max discount per order.'), { refused: true });
  }

  // 4. Rule-breaking / injection.
  const pctOff = t.match(/(\d{1,3})\s?% off/);
  if (/ignore (all |your |previous |the )?(rules|instructions|guardrails)|jailbreak|bypass|no (cap|limit)s?\b/.test(t) || (pctOff && Number(pctOff[1]) >= 25) || /\beveryone\b.*\boff\b/.test(t)) {
    return reply('refuse_injection', T.refuseInjection(MAX_DISCOUNT_PER_ORDER), { refused: true });
  }

  const days = parseDays(t, new Date(ctx.ledger.now * 1000));
  const d = days ?? 7;

  // Account and support.
  if (/^(manage (my )?account|account settings?)\b/.test(t)) return reply('account', 'Account & Settings has your business profile, settlement schedule (next day or instant), Ray mode (Live or Demo), Smart Offers guardrails and the audit log. Open it from the left menu.', { quick: HELP });
  if (/^(support|help|help & support)$/.test(t)) return reply('help', T.help(), { card: { kind: 'help', items: HELP } });

  // v2: answers over one engine snapshot.
  if (FEATURES.rayV2) {
    const snap = () => call('get_engine_snapshot', {}, () => tools.get_engine_snapshot(ctx));
    if (/\bcost (me )?per (extra )?order\b|\bper order\b.*\balpha10\b|\balpha10\b.*\bper order\b/.test(t)) return reply('alpha10_per_order', T.a10PerOrder(snap()), { card: { kind: 'waste' }, quick: FOLLOW_UPS.offers });
    if (/\b(agent )?testing\b|\bchallengers?\b|\bexperiments? (running|right now)\b|\bwhat is the agent (doing|testing)\b/.test(t)) return reply('testing', T.testing(snap()), { quick: FOLLOW_UPS.results });
    if (/\babandon(ed)?[- ]?cart\b|\bcart abandonment\b|\brecovery agent\b|\bother agents?\b/.test(t)) return reply('cart_agent', T.cartAgent(snap()), { quick: FOLLOW_UPS.results });
    if (/\bstores like (mine|me|ours)\b|\bwhat do (similar |other )?stores (like mine )?run\b|\bplaybook\b/.test(t)) return reply('stores_like_mine', T.storesLikeMine(snap()), { quick: FOLLOW_UPS.offers });
    // Budget, margin and goal CHANGES become a draft with a diff (what-ifs stay scenarios, below).
    const isWhatIf = /\bwhat if\b|\bscenario\b|\btry\b|\bpreview\b|\bhow about\b|\bwhat about\b/.test(t);
    const isChange = /\b(set|change|make|update|switch|raise|lower|increase|decrease|cut|use|move)\b.*\b(budget|margin|goal|keep)\b|\bmy (real )?margin is\b|\bi keep ₹?\s?\d+/.test(t);
    if (isChange && !isWhatIf) {
      const amt = /\bbudget\b/.test(t) ? parseAmount(t.replace(/\d+\s?%/g, '')) : null;
      const pm = t.match(/(\d+(?:\.\d+)?)\s?%/);
      const keepM = t.match(/keep ₹?\s?(\d+)/);
      const keep = /\bmargin\b|\bkeep\b/.test(t) ? (pm ? Math.round(parseFloat(pm[1]) * 10) : keepM ? Number(keepM[1]) : null) : null;
      const goal = /new customers?/.test(t) ? 'new_customers' : /steady|orders? steady/.test(t) ? 'orders_steady' : /most profit/.test(t) ? 'most_profit' : undefined;
      const args = { ...(amt && amt >= 1000 ? { budget: Math.min(Math.max(amt, 5000), 1000000) } : {}), ...(keep ? { keep_per_1000: keep } : {}), ...(goal ? { goal } : {}) } as { budget?: number; keep_per_1000?: number; goal?: 'most_profit' | 'new_customers' | 'orders_steady' };
      if (args.budget !== undefined || args.keep_per_1000 !== undefined || args.goal) {
        if (args.keep_per_1000 !== undefined && (args.keep_per_1000 < 200 || args.keep_per_1000 > 650)) {
          return reply('margin_warning', T.marginWarn(args.keep_per_1000 / 10), { card: { kind: 'draft', draft: { type: 'settings', patch: { keepPer1000: args.keep_per_1000 }, summary: `Use ${args.keep_per_1000 / 10}% margin (keep ₹${args.keep_per_1000} of ₹1,000)` } } });
        }
        const r = call('draft_settings_change', args, () => tools.draft_settings_change(ctx, args));
        return reply('settings_draft', T.settingsDraft(r.diff, r.plan.profit, r.plan.spend), { card: { kind: 'draft', draft: r.draft } });
      }
    }
  }

  // Lifecycle: opportunities, why AI, weekly review, accuracy, pilot decision, impact, next experiments.
  if (/\bwhy (use )?ai\b|\bwhy not (just )?a (simple |fixed )?rule\b|\bbetter than a rule\b|\bwhat does (the )?ai do\b/.test(t)) {
    const w = call('get_why_ai', {}, () => tools.get_why_ai(ctx));
    return reply('why_ai', T.whyAi(w), { card: { kind: 'why_ai' }, quick: FOLLOW_UPS.offers });
  }
  if (/\bopportunit|\banything (i should|to) (fix|know|do)\b|\bwhat should i (fix|look at)\b|\balerts?\b|\bnotifications?\b/.test(t)) {
    const o = call('get_opportunities', {}, () => tools.get_opportunities(ctx));
    return reply('opportunities', T.opportunities(o), { card: { kind: 'opportunities' }, quick: FOLLOW_UPS.offers });
  }
  if (/\bweekly review\b|\bwhat changed\b|\bthis week\b|\bmonday\b|\breview\b/.test(t) && !/\breviews? (of|for) (my )?(store|product)\b/.test(t)) {
    const r = call('get_weekly_review', {}, () => tools.get_weekly_review(ctx));
    return reply('weekly_review', T.review(r), { card: r.available ? { kind: 'review' } : undefined, quick: FOLLOW_UPS.results });
  }
  if (/\bhow accurate\b|\baccuracy\b|\bpredict(ed|ion|ions)?\b|\bestimates?\b.*\b(right|wrong|accurate)\b/.test(t)) {
    const a = call('get_prediction_accuracy', {}, () => tools.get_prediction_accuracy(ctx));
    return reply('accuracy', T.accuracy(a, ctx.approved), { card: ctx.approved ? { kind: 'accuracy' } : undefined, quick: FOLLOW_UPS.results });
  }
  if (/\bshould i keep\b|\bkeep smart offers\b|\bpilot (end|ends|ending|decision)\b|\bday 30\b|\bafter the pilot\b|\bworth (it|paying)\b/.test(t)) {
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
    return reply('refunds', T.refunds(r), { card: { kind: 'refunds', data: r }, quick: FOLLOW_UPS.refunds });
  }
  if (/\bfailed\b|\bdeclined\b|\bunsuccessful\b/.test(t) && /\bpayments?\b|\btransactions?\b/.test(t)) {
    const l = call('list_payments', { status: 'failed', limit: 6 }, () => tools.list_payments(ctx, { status: 'failed', limit: 6 }));
    const s = call('get_payments_summary', { days: d }, () => tools.get_payments_summary(ctx, { days: d }));
    return reply('failed_payments', T.failed(s), { card: { kind: 'payments_list', title: 'Latest failed payments', data: l }, quick: FOLLOW_UPS.payments });
  }
  if (/\bpayments?\b|\bcollect(ed|ions?|ing)?\b|\bhow much (money )?did i (make|get|earn)\b|\btransactions?\b|\brevenue\b|\breceived\b|\bupi\b|\bcards?\b|\bnetbanking\b|\bwallets?\b|\bsuccess rate\b/.test(t) && !/\boffers?\b|\bcoupons?\b|\balpha10\b/.test(t)) {
    const s = call('get_payments_summary', { days: d }, () => tools.get_payments_summary(ctx, { days: d }));
    return reply('payments', T.payments(s), { card: { kind: 'payments', data: s }, quick: FOLLOW_UPS.payments });
  }

  // Setup is a guided flow in the UI.
  if (/\bset ?up\b|\bget started\b|\bfix (it|this|my offers|my coupons)\b|^smart offers$|\bstart smart offers\b/.test(t) && !/\bplan\b|\bresults?\b/.test(t)) {
    return reply('start_setup', 'Let\'s set up Smart Offers. Four quick questions, then I\'ll show you the plan. Nothing goes live until you approve it.', { startSetup: true });
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
    return reply('floor_pushback', T.floorPushback(want, s, s3, alt), {
      card: { kind: 'sim', title: scenarioTitle(`${want}x floor`), sim: s },
      quick: [...(s3 ? [{ label: `What about ${alt}x?`, message: `What about ${alt}x?` }] : []), { label: 'Keep most profit', message: 'Show me the most-profit plan' }],
    });
  }

  // 6. Margin.
  if (/\bmargin\b|\bkeep ₹?\s?\d+/.test(t)) {
    const pm = t.match(/(\d+(?:\.\d+)?)\s?%/);
    const keep = t.match(/keep ₹?\s?(\d+)/);
    const pct = pm ? parseFloat(pm[1]) : keep ? parseFloat(keep[1]) / 10 : null;
    if (pct !== null) {
      if (pct < 20 || pct > 65) {
        return reply('margin_warning', T.marginWarn(pct), {
          card: { kind: 'draft', draft: { type: 'settings', patch: { keepPer1000: Math.round(pct * 10) }, summary: `Use ${pct}% margin (keep ₹${Math.round(pct * 10)} of ₹1,000)` } },
          quick: [{ label: `Keep ₹${DEFAULT_KEEP_PER_1000} (${DEFAULT_KEEP_PER_1000 / 10}%)`, message: 'Show me the most-profit plan' }],
        });
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
      return reply('budget_sim', T.budget(b, s), {
        card: { kind: 'sim', title: FEATURES.rayV2 ? scenarioTitle(`budget ₹${b.toLocaleString('en-IN')}`) : `Budget ${b.toLocaleString('en-IN')} (preview)`, sim: s },
        quick: [{ label: 'Back to most profit', message: 'Show me the most-profit plan' }],
      });
    }
  }

  // 8. Override a group's offer.
  const g = groupIn(t);
  const o = offerIn(t);
  if (g && o && /\b(give|offer|set|switch|move|change|put|let)\b/.test(t)) {
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
    const d = call('request_pause', { scope }, () => tools.request_pause(ctx, { scope }));
    return reply('pause_draft', T.pause(scope), { card: { kind: 'draft', draft: d.draft } });
  }

  // 11. Shopper explanations.
  const who = SHOPPERS.find((s) => t.includes(s));
  if (who) {
    const r = call('explain_shopper', { example_id: who }, () => tools.explain_shopper(ctx, { example_id: who }));
    if ('error' in r) return reply('help', T.help());
    return reply('explain_shopper', T.explainShopper(r));
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

  if (/\balpha10\b|\bwaste|\bwhere did\b|\blast month\b.*\b(coupon|discount|code)|\bcoupons?\b|\bdiscounts?\b|\boffers? (and|&) coupons\b/.test(t)) {
    const w = call('get_offer_waste', { code: 'ALPHA10' }, () => tools.get_offer_waste(ctx, { code: 'ALPHA10' }));
    return reply('offer_waste', T.waste(w), { card: { kind: 'waste' }, quick: FOLLOW_UPS.offers });
  }

  if (/\bplan\b|\bfix\b|\bset ?up\b|\bsmart offers?\b|\brecommend|\boptimi[sz]e|\bmost profit|\bwhich offers?\b/.test(t)) {
    const s = call('simulate_plan', {}, () => tools.simulate_plan(ctx, {}));
    return reply('plan', T.plan(s), { card: { kind: 'plan_live' }, quick: FOLLOW_UPS.plan });
  }

  if (/\bsales\b|\bsummary\b|\bkpis?\b|\bhow did\b|\borders\b/.test(t)) {
    const s = call('get_store_summary', { period: 'last_month' }, () => tools.get_store_summary(ctx));
    return reply('store_summary', T.storeSummary(s));
  }

  return reply('help', T.help(), { card: { kind: 'help', items: HELP } });
}
