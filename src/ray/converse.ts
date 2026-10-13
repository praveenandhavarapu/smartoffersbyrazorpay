/**
 * Ray's conversation core (pure): guided setup, local routing and follow-ups. useRay wires it to the
 * stores; the scenario tests call it directly, so tests exercise exactly what the app does.
 * v3: "yes" runs what the last reply offered; "what about 35%?", "why?" and "give them ₹100 off"
 * use what the last reply was about; setup never assumes an input.
 * v3.1: setup is a form the merchant can step out of. Questions get real answers (nothing saved), then
 * "Back to Q<n>"; what-ifs show the scenario; back/skip/pause work; Ray never repeats itself word for word.
 */
import { route, FOLLOW_UPS, type QuickReply, type RayReply } from './demoRouter';
import { question, parseAnswer, nextStep, stepsFor, classifySetupTurn, setupNav, whatIf, stepWhy, stepBenchmark, unclearHelp, qNum, resumeChip, valueText, KEY, DELEGATE, PAUSE_CHIP, SETUP_SHORT, STEP_WORD, type QCtx, type SetupNav, type WhatIf } from './setupFlow';
import { T } from './templates';
import { tools, type RayCtx } from './tools';
import type { ChatMsg, LastTurn, SetupStep } from './chatStore';
import type { InputSource, Settings } from '../state/store';
import { AFFIRM, APPROVE_WORDS, GROUP_WORD, NEGATE, normalize, parseDays } from './parse';
import { pendingInputs } from '../state/inputs';
import { inr, inrSigned } from '../lib/format';
import { offerLabel } from '../lib/labels';
import { inputValue } from '../state/inputs';
import { INPUT_LABEL, inputKeysOf, type InputKey } from '../state/store';

export type RayMsg = Omit<ChatMsg, 'id'>;
export type ConvState = {
  setup: SetupStep | null; last?: LastTurn | null;
  /** Setup paused at this step ("pause", or after three unclear answers); "Resume setup" returns to it. */
  paused?: SetupStep | null;
  /** Unclear answers in a row at the current setup step. */
  unclear?: number;
  /** Ray's previous message: a reply is never identical to it. */
  prev?: string;
};
export type Turn = {
  /** Messages Ray posts (none when the turn goes to Live mode). */
  messages: RayMsg[];
  setup: SetupStep | null;
  /** Inputs the merchant gave during setup (form inputs, not approvals), each with where it came from. */
  patches?: { patch: Partial<Settings>; source: InputSource }[];
  /** The routed reply, when the turn was answered locally (for logging drafts and tests). */
  reply?: RayReply;
  /** Context for the next turn's follow-ups. */
  last: LastTurn | null;
  /** true = not a setup turn and not refused: Live mode may answer it instead. */
  liveEligible: boolean;
  /** Turn-level intent when no routed reply exists (follow-up handling, setup side turns). */
  intent?: 'clarify' | 'which_one' | 'approve_click' | 'ack' | 'setup_nav' | 'setup_unclear' | 'setup_paused';
  paused?: SetupStep | null;
  unclear?: number;
};

const HELP_CHIPS: QuickReply[] = [
  { label: 'Set up Smart Offers', message: 'Set up Smart Offers' },
  { label: 'How are my coupons doing?', message: 'How are my offers and coupons doing?' },
  { label: 'Payments last 7 days', message: 'Show my payments for the last 7 days' },
  { label: 'Growth vs profit', message: 'I want more new customers' },
];

/** What a reply was about, for follow-ups. */
function aboutOf(r: RayReply): RayReply['about'] {
  if (r.about) return r.about;
  const args = (r.toolCalls[0]?.args ?? {}) as { days?: number; group_id?: string };
  if (/^margin/.test(r.intent) || r.intent === 'combo_scenario') return { kind: 'margin' };
  if (/^budget/.test(r.intent)) return { kind: 'budget' };
  if (/^floor/.test(r.intent) || r.intent === 'min_return_draft') return { kind: 'floor' };
  if (r.intent === 'payments' || r.intent === 'failed_payments') return { kind: 'payments', days: args.days };
  if (r.intent === 'settlements' || r.intent === 'refunds' || r.intent === 'daily') return { kind: r.intent, days: args.days };
  if (args.group_id) return { group: args.group_id as never };
  return undefined;
}

/** The step a reply offers (so "yes" does it), adding the question to the text when the reply didn't ask. */
function withNext(r: RayReply, ctx: RayCtx): RayReply {
  if (r.next || r.refused || r.card?.kind === 'draft') return r;
  const ask = (text: string, next: QuickReply): RayReply => ({ ...r, text: `${r.text.trimEnd()} ${text}`, next });
  switch (r.intent) {
    case 'why_ai': return { ...r, next: ctx.approved ? { label: 'Show the plan', message: 'Show me the most-profit plan' } : { label: 'Set up Smart Offers', message: 'Set up Smart Offers' } };
    case 'opportunities': return { ...r, next: ctx.approved ? { label: 'Show results', message: 'How are the results so far?' } : { label: 'Set up Smart Offers', message: 'Set up Smart Offers' } };
    case 'alpha10_per_order': return { ...r, next: { label: 'Show the plan', message: 'Show me the most-profit plan' } };
    case 'floor_pushback': return r.quick?.[0] ? { ...r, next: r.quick[0] } : r;
    case 'margin_sim': case 'margin_none': {
      const pct = (r.toolCalls.find((c) => c.name === 'simulate_plan')?.args as { margin_pct?: number })?.margin_pct;
      if (pct === undefined) return r;
      const d = { label: `Draft: I keep ₹${Math.round(pct * 10)} of ₹1,000`, message: `My margin is ${pct}%` };
      return { ...ask(`Is that your real margin? I can draft it as yours.`, d), quick: [d, { label: 'What if my margin is lower?', message: 'What if my margin is lower?' }] };
    }
    case 'budget_sim': {
      const sim = r.toolCalls.find((c) => c.name === 'simulate_plan');
      const b = (sim?.args as { budget?: number })?.budget;
      const spend = (sim?.result as { spend?: number })?.spend ?? 0;
      if (b === undefined) return r;
      // A bigger budget the plan wouldn't use isn't worth drafting.
      if (b > ctx.settings.budget && spend < b * 0.97) return { ...r, text: `${r.text.trimEnd()} The extra budget wouldn't be used: offers that pay back only need ${inr(spend)}.` };
      return ask(`Want me to draft ${inr(b)} as your budget?`, { label: `Draft ${inr(b)} budget`, message: `Set my budget to ₹${b}` });
    }
    case 'floor_preview': {
      const f = (r.toolCalls.find((c) => c.name === 'simulate_plan')?.args as { floor_return?: number })?.floor_return;
      if (f === undefined || f <= ctx.derived.draftBreakEven) return r;
      return ask(`Want me to draft ${f}x as your minimum return?`, { label: `Draft ${f}x minimum return`, message: `Set my minimum return to ${f}x` });
    }
    case 'menu_scenario': {
      const a = (r.toolCalls.find((c) => c.name === 'simulate_plan')?.args ?? {}) as { allowed_offers?: string[]; add_offers?: string[]; remove_offers?: string[] };
      const msg = a.remove_offers?.length ? `Remove ${a.remove_offers.map((o) => offerLabel(o as never)).join(' and ')} from my menu` : a.add_offers?.length ? `Add ${a.add_offers.map((o) => offerLabel(o as never)).join(' and ')} to my menu` : null;
      return msg ? ask('Want me to draft it?', { label: 'Draft it', message: msg }) : r;
    }
    case 'combo_scenario': {
      const a = (r.toolCalls.find((c) => c.name === 'simulate_plan')?.args ?? {}) as { budget?: number; margin_pct?: number };
      return a.budget && a.margin_pct ? ask('Want me to draft these as your numbers?', { label: 'Draft them', message: `Set my budget to ₹${a.budget} and my margin to ${a.margin_pct}%` }) : r;
    }
    case 'goal_scenario': {
      const sim = r.toolCalls.find((c) => c.name === 'simulate_plan');
      const a = (sim?.args ?? {}) as { orders_floor_pct?: number };
      if ((sim?.result as { infeasible?: unknown })?.infeasible) return r;
      return a.orders_floor_pct !== undefined ? ask('Want me to draft this as your goal?', { label: 'Draft it', message: `Switch my goal to keep orders steady, falling at most ${a.orders_floor_pct}%` }) : r;
    }
    case 'stores_like_mine': return ask('Want them scored at your numbers?', { label: 'Recommended offers', message: 'What other offers should I try?' });
    case 'offer_waste': return ctx.approved ? r : ask('Want the plan that fixes it?', { label: 'Show the plan', message: 'Show me the most-profit plan' });
    case 'explain_group': {
      const g = (r.toolCalls[0]?.args as { group_id?: keyof typeof GROUP_WORD })?.group_id;
      if (!g) return r;
      const gs = ctx.derived.planGroups.find((x) => x.id === g)!;
      const cur = (ctx.approved ? ctx.derived.live : ctx.derived.draft).rows.find((x) => x.group === g)!.offer;
      const alt = (Object.keys(gs.priorLiftsPp) as (keyof typeof gs.priorLiftsPp)[]).find((o) => o !== cur && (ctx.settings.allowedOffers as string[]).includes(o));
      return alt ? ask(`Want to see what ${offerLabel(alt)} for them would do?`, { label: `What if they get ${offerLabel(alt)}?`, message: `What if ${GROUP_WORD[g]} get ${offerLabel(alt)}?` }) : r;
    }
    default: return r;
  }
}

/** Rewrite a short follow-up using what the last reply was about ("what about 35%?" after a margin answer). */
function contextual(t: string, last: LastTurn | null | undefined, live: boolean): string | null {
  const a = last?.about;
  if (/^(why|why\?|why is that|why so|how come|explain)\??$/.test(t)) {
    if (a?.group) return `Why do ${GROUP_WORD[a.group]} get this offer?`;
    if (last?.intent === 'results') return live ? 'How does the holdout work?' : 'Why are there no results?';
    return 'Why AI, not a simple rule?';
  }
  if (/\byesterday\b/.test(t) && a?.kind === 'payments') return 'Show my payments for yesterday';
  if (a?.group && /\b(them|they|this group|that group|those (shoppers|customers))\b/.test(t)) return t.replace(/\b(them|they|this group|that group|those (shoppers|customers))\b/, GROUP_WORD[a.group]);
  const days = parseDays(t, new Date());
  if (days && a?.kind && ['payments', 'settlements', 'refunds', 'daily'].includes(a.kind) && t.split(' ').length <= 7) return `Show my ${a.kind === 'daily' ? 'daily payments' : a.kind} for the last ${days} days`;
  const short = t.match(/^(?:and|or|what about|how about|try|with|ok)?\s*(₹?\s?\d[\d,.]*\s?(?:k|l|lakh)?)\s?(%|x)?\s*(budget|margin|return|floor)?\s*(?:instead|then|please)?\??$/);
  if (short) {
    const v = short[1].trim(), unit = short[2], word = short[3];
    if (unit === '%' || word === 'margin' || (!unit && !word && a?.kind === 'margin')) return `What if my margin is ${v.replace(/[₹\s]/g, '')}%?`;
    if (unit === 'x' || word === 'return' || word === 'floor' || (!unit && a?.kind === 'floor')) return `What about ${v.replace(/[₹\s]/g, '')}x?`;
    if (word === 'budget' || a?.kind === 'budget' || /₹|k|l|lakh/.test(v)) return `What if my budget is ${v.startsWith('₹') ? v : `₹${v}`}?`;
  }
  return null;
}

/** Chips that only make sense in this state (no "set up" when live; no results questions before go-live). */
const LIVE_ONLY = /^(What changed this week\?|How accurate were your estimates\?|Should I keep Smart Offers|What is the agent testing right now\?|Should the abandoned-cart agent offer discounts\?|How much will I make next month)/;
export function chipsFor(q: QuickReply[], ctx: RayCtx, asked?: string): QuickReply[] {
  const same = (m: string) => asked !== undefined && normalize(m).replace(/[?.!]/g, '') === asked.replace(/[?.!]/g, '');
  const mapped = q.map((c) => (ctx.approved && c.message === 'Set up Smart Offers' ? { label: 'How are the results so far?', message: 'How are the results so far?' } : c));
  const out = mapped.filter((c) => (ctx.approved || !LIVE_ONLY.test(c.message)) && !same(c.message));
  if (!ctx.approved && out.length < mapped.length && !out.some((c) => c.message === 'Set up Smart Offers')) out.unshift({ label: 'Set up Smart Offers', message: 'Set up Smart Offers' });
  return out.filter((c, i) => out.findIndex((x) => x.message === c.message) === i);
}

/** Tools whose answers depend on the merchant's inputs. */
const INPUT_TOOLS = new Set(['simulate_plan', 'get_current_plan', 'get_offer_waste', 'get_tradeoffs', 'get_recommended_offers', 'get_why_ai', 'explain_group', 'draft_plan_change', 'draft_settings_change', 'get_impact_summary', 'get_engine_snapshot']);
const INPUT_INTENTS = new Set(['guardrails', 'break_even', 'holdout_cost', 'menu', 'plan_groups', 'edit_plan', 'impact']);
const NO_NOTE = new Set(['my_numbers', 'inputs_typical', 'approve_via_click', 'testing', 'cart_agent', 'stores_like_mine', 'why_no_results']);
/** Before the first approval: say which numbers are typical values, not the merchant's (never assume). */
function typicalNote(r: RayReply, ctx: RayCtx): { text: string; chip: QuickReply } | null {
  const pending = pendingInputs(ctx.approved, ctx.confirmed ?? {});
  if (!pending.length || r.refused || NO_NOTE.has(r.intent) || !(INPUT_INTENTS.has(r.intent) || r.toolCalls.some((c) => INPUT_TOOLS.has(c.name)))) return null;
  const s = ctx.settings;
  const parts = [pending.includes('budget') ? `budget ${inr(s.budget)}` : null, pending.includes('keepPer1000') ? `keep ${inr(s.keepPer1000)} of ₹1,000` : null].filter(Boolean);
  const more = pending.length - parts.length;
  return {
    text: `*Note: this uses typical values for stores your size${parts.length ? ` (${parts.join(', ')}${more > 0 ? `, and ${more} more` : ''})` : ''}, not numbers you've confirmed.*`,
    chip: { label: 'Enter my numbers', message: 'What are my numbers?' },
  };
}

function finishSetup(ctx: RayCtx, settings: Settings, notes: string[]): RayMsg {
  const s = tools.simulate_plan({ ...ctx, settings }, {});
  if (settings.growth && s.profit < 0) notes.push(`**This plan loses ${inr(-s.profit)} a month by design**: you chose to give up profit for more ${settings.growth.metric === 'orders' ? 'orders' : 'new customers'}, so some offers run below break-even.`);
  const keys = inputKeysOf(settings);
  const summary = keys.map((k) => `${INPUT_LABEL[k]}: ${inputValue(k, settings, 1000 / settings.keepPer1000)}`).join(' · ');
  const head = ctx.approved ? `Here's the updated plan. It's a draft: your live plan doesn't change until you approve it. ${T.plan(s).replace(/^Here's the plan: /, '').replace(/ Nothing goes live until you click Approve\.$/, '')}` : T.plan(s);
  return { role: 'ray', text: `${notes.length ? notes.join('\n') + '\n\n' : ''}${head}\nYour numbers: ${summary}${settings.growth ? ' (growth offers may run below the minimum return; that is the profit you chose to give up)' : ''}.`, cards: [{ kind: 'plan_live' }], quick: FOLLOW_UPS.plan, via: 'setup' };
}

/** Ask a setup question (with an optional lead line). */
function ask(step: SetupStep, ctx: RayCtx, lead?: string, extra: Partial<Turn> = {}): Turn {
  const qq = question(step, { ctx, settings: ctx.settings });
  return { messages: [{ role: 'ray', text: `${lead ? `${lead}\n\n` : ''}${qq.text}`, quick: [...qq.quick, PAUSE_CHIP], via: 'setup' }], setup: step, last: null, liveEligible: false, paused: null, unclear: 0, ...extra };
}

/** "Back to Q<n>: …" with that step's chips and "Pause setup". */
function backTo(step: SetupStep, ctx: RayCtx): { line: string; quick: QuickReply[] } {
  return { line: `Back to ${qNum(step, ctx.settings)}: ${SETUP_SHORT[step]}`, quick: [...question(step, { ctx, settings: ctx.settings }).quick, PAUSE_CHIP] };
}

/** An offer to act at the end of a routed reply ("Want me to draft it?"): in setup the next question is the setup one. */
const OFFER_Q = /\s*(Want (me )?to|Want them|Shall I|Would you like|Do you want|Should I|Want to)[^?.!]*\?\s*$/;

/** "Why are you asking this?", "what does this mean?" */
const WHY_ASK = /\bwhy\b.*\b(ask|asking|need|want)\b|\bwhat (does|is) (this|that|it|q\d)\b.*\b(mean|for)\b|\bexplain\b|\bwhat do you mean\b|\bwhy does (it|this) matter\b/;

/** An answer for a side question the router has no rule for, using the step it was asked at. */
function setupFallback(step: SetupStep, text: string, ctx: RayCtx): RayReply {
  const t = normalize(text);
  const q: QCtx = { ctx, settings: ctx.settings };
  const own = (intent: string, body: string): RayReply => ({ intent, text: body, toolCalls: [] });
  const via = (msg: string) => { const r = route(msg, ctx); return r.intent === 'help' ? null : r; };
  if (step === 'offers' && /\b(options?|ideas?|suggest\w*|recommend\w*|others?|else|alternatives?|more offers)\b/.test(t)) { const r = via('What other offers should I try?'); if (r) return r; }
  if (/\bwho gets what\b|\bhow do you (decide|choose|pick)\b|\bwhich groups?\b/.test(t)) { const r = via('How many groups get an offer?'); if (r) return r; }
  if (WHY_ASK.test(t)) return own('setup_explain', stepWhy(step, q));
  const bench = /\b(normal|typical|usual|average|others|other stores|similar|stores (like|my size)|benchmark|most stores)\b/.test(t) ? stepBenchmark(step, q) : null;
  if (bench) return own('setup_benchmark', bench);
  return own('setup_explain', `I don't have a tested answer to that one, so I won't guess. ${stepWhy(step, q)}`);
}

/** Value questions about another step ("what if I spend 2 lakh?" at the margin question), and the words they need. */
const CROSS: [SetupStep, RegExp][] = [
  // "is ₹50,000 too little?" is about the budget; "free shipping over ₹5,000" is not.
  ['budget', /\b(budget|spend|spending)\b|^(?!.*\b(free shipping|off|over|above|cart|orders?|gift)\b).*\b(too (little|much|low|high|small|big)|enough)\b/],
  ['margin', /\b(margin|keep)\b|\d\s?%/], ['offers', /./], ['floor', /\d\s?x\b/],
];

/** A question mid-setup: answered as if setup weren't running, nothing saved, then back to the same question. */
function sideQuestion(step: SetupStep, text: string, ctx: RayCtx): Turn {
  let r = route(text, ctx);
  if (r.startSetup) return navTurn({ kind: 'restart' }, step, ctx);
  if (!r.refused) {
    const t = normalize(text);
    const q: QCtx = { ctx, settings: ctx.settings };
    for (const [other, need] of CROSS) {
      if (other === step || !need.test(t)) continue;
      const w = whatIf(other, t, q);
      if (w) return sideWhatIf(step, ctx, w, other);
    }
  }
  if (r.intent === 'help') r = setupFallback(step, text, ctx);
  const note = typicalNote(r, ctx);
  const b = backTo(step, ctx);
  const body = r.card?.kind === 'draft' ? r.text : r.text.replace(OFFER_Q, '');
  return {
    messages: [{ role: 'ray', text: `${body.trimEnd()}${note ? `\n${note.text}` : ''}\n\n${b.line}`, cards: r.card ? [r.card] : undefined, quick: b.quick, refused: r.refused, via: 'setup' }],
    setup: step, reply: r, last: null, liveEligible: false, paused: null, unclear: 0,
  };
}

/** A value asked about, not given ("is ₹50,000 too little?"): show the scenario; "Use <value>" makes it the answer. */
function sideWhatIf(step: SetupStep, ctx: RayCtx, w: WhatIf, target: SetupStep = step): Turn {
  const q: QCtx = { ctx, settings: ctx.settings };
  const order = stepsFor(ctx.settings);
  // The value is for this question: "Use <value>" answers it. For another question: nothing to tap here.
  const use: QuickReply | null = target === step ? w.use : order.indexOf(target) < order.indexOf(step) ? { label: `Change my ${STEP_WORD[target]}`, message: `change my ${STEP_WORD[target]}` } : null;
  const save = target === step ? `Nothing is saved until you tap **${w.use.label}** or type it.` : use ? `Nothing is saved. To use it, change ${qNum(target, ctx.settings)} (your ${STEP_WORD[target]}).` : `Nothing is saved; I ask about your ${STEP_WORD[target]} at ${qNum(target, ctx.settings)}.`;
  const sim = tools.simulate_plan(ctx, w.args);
  const now = tools.simulate_plan(ctx, {});
  const on = sim.rows.filter((x) => x.offer !== 'none').length;
  const d = sim.profit - now.profit;
  const unused = w.args.budget !== undefined && sim.spend < w.args.budget * 0.97 ? ` and uses only ${inr(sim.spend)} of it` : '';
  const bench = target === 'budget' || target === 'margin' ? stepBenchmark(target, q) : null;
  const body = `With ${w.what}, the plan makes **${inrSigned(sim.profit)} a month**${unused} (${on} of ${sim.rows.length} groups get an offer). With your inputs so far it makes ${inrSigned(now.profit)}, so that's ${d === 0 ? 'no difference' : `${inr(Math.abs(d))} ${d > 0 ? 'more' : 'less'} a month`}.${bench ? ` ${bench}` : ''} ${save}`;
  const r: RayReply = { intent: 'setup_what_if', text: body, toolCalls: [{ name: 'simulate_plan', args: w.args, result: sim }], card: { kind: 'sim', title: `Scenario: ${sim.scenario} (not applied)`, sim } };
  const note = typicalNote(r, ctx);
  const b = backTo(step, ctx);
  return {
    messages: [{ role: 'ray', text: `${body}${note ? `\n${note.text}` : ''}\n\n${b.line}`, cards: [r.card!], quick: use ? [use, ...b.quick.filter((c) => c.message !== use.message)] : b.quick, via: 'setup' }],
    setup: step, reply: r, last: null, liveEligible: false, paused: null, unclear: 0,
  };
}

/** Setup paused: answers so far are kept (they are inputs, not approvals). */
function pauseTurn(step: SetupStep, ctx: RayCtx, lead: string): Turn {
  return {
    messages: [{ role: 'ray', text: `${lead} ${ctx.approved ? 'Your live plan doesn\'t change.' : 'Nothing goes live until you approve a plan.'} Ask me anything.`, quick: [resumeChip(step, ctx.settings), ...chipsFor(HELP_CHIPS, ctx).filter((c) => c.message !== 'Set up Smart Offers').slice(0, 3)], via: 'setup' }],
    setup: null, last: null, liveEligible: false, paused: step, unclear: 0, intent: 'setup_paused',
  };
}

function navTurn(nav: SetupNav, step: SetupStep, ctx: RayCtx): Turn {
  const s = ctx.settings;
  const order = stepsFor(s);
  const nav1 = (t: Turn): Turn => ({ ...t, intent: 'setup_nav' });
  switch (nav.kind) {
    case 'back': {
      const i = order.indexOf(step);
      return nav1(i > 0 ? ask(order[i - 1], ctx, 'Going back one question.') : ask(step, ctx, 'This is the first question.'));
    }
    case 'jump': return nav1(ask(order.includes(nav.step) ? nav.step : 'goal', ctx, 'Sure, let\'s change that.'));
    case 'restart': return nav1(ask(order[0], ctx, ctx.approved ? 'Starting over from Q1. Each question shows your live value; tap Keep to keep it.' : 'Starting over from Q1. Your earlier answers stay as defaults: tap Keep to keep one.'));
    case 'repeat': return nav1(ask(step, ctx, 'Here\'s the question again.'));
    case 'pause': return pauseTurn(step, ctx, `Setup paused at ${qNum(step, s)} (${SETUP_SHORT[step]}). Your answers so far are kept as inputs.`);
    case 'status': {
      const keys = [...new Set(order.map((x) => KEY[x]))];
      const src = (k: InputKey) => ctx.confirmed?.[k] === 'merchant' ? 'yours' : ctx.confirmed?.[k] === 'typical' ? 'typical, accepted' : ctx.approved ? 'live plan' : 'not answered yet; typical shown';
      const lines = keys.map((k) => `- ${INPUT_LABEL[k]}: ${inputValue(k, s, 1000 / s.keepPer1000)} (${src(k)})`);
      const qq = question(step, { ctx, settings: s });
      return nav1({ messages: [{ role: 'ray', text: `Your answers so far:\n${lines.join('\n')}\nNow: ${qNum(step, s)} · ${SETUP_SHORT[step]}`, quick: [...qq.quick, PAUSE_CHIP], via: 'setup' }], setup: step, last: null, liveEligible: false, paused: null, unclear: 0 });
    }
    case 'skip': {
      if (step === 'growth') return answerTurn(step, 'none', ctx, 'Skipped: no profit given up for growth, so the plan stays most profit.');
      const a = parseAnswer(step, 'typical', { ctx, settings: s });
      const v = a.ok ? valueText(step, { ...s, ...a.patch }) : null;
      return answerTurn(step, 'typical', ctx, `Skipped: using the typical value for stores your size${v ? ` (**${v}**)` : ''}, marked typical, not yours.`);
    }
  }
}

/** Unclear answers escalate: what it means → other words, an example and an easy way out → pause. */
function unclearTurn(step: SetupStep, text: string, ctx: RayCtx, n: number): Turn {
  const q: QCtx = { ctx, settings: ctx.settings };
  if (n >= 3) return pauseTurn(step, ctx, `Let's pause setup so you're not stuck. Your answers so far are kept, and I'll pick up at ${qNum(step, ctx.settings)} when you're ready.`);
  const a = parseAnswer(step, text, q);
  const h = unclearHelp(step, q, n);
  return { messages: [{ role: 'ray', text: n === 1 && !a.ok ? `${a.hint} ${h.text}` : h.text, quick: n === 1 ? [...h.quick, PAUSE_CHIP] : h.quick, via: 'setup' }], setup: step, last: null, liveEligible: false, paused: null, unclear: n, intent: 'setup_unclear' };
}

/** An answer: saved as the merchant's input (or as typical when they hand it to Ray), then the next question. */
function answerTurn(step: SetupStep, text: string, ctx: RayCtx, lead?: string, unclear = 0): Turn {
  const q: QCtx = { ctx, settings: ctx.settings };
  const a = parseAnswer(step, text, q);
  if (!a.ok) return unclearTurn(step, text, ctx, unclear + 1);
  // "Keep it" keeps an earlier answer as it was (typical stays typical).
  const kept = /^(keep( it| the same| as is)?|same|no change|unchanged)$/i.test(text.trim()) && !ctx.approved ? ctx.confirmed?.[KEY[step]] : undefined;
  const settings = { ...ctx.settings, ...a.patch };
  const patches = [{ patch: a.patch, source: kept ?? a.source }];
  const notes = [lead, a.note].filter((x): x is string => Boolean(x));
  const next = a.rest ? null : a.again ? step : nextStep(step, settings);
  if (next && stepsFor(settings).includes(next)) {
    const qq = question(next, { ctx: { ...ctx, settings, confirmed: { ...ctx.confirmed, ...Object.fromEntries(inputKeysOf(a.patch).map((k) => [k, kept ?? a.source])) } }, settings });
    return { messages: [{ role: 'ray', text: (notes.length ? notes.join(' ') + '\n\n' : '') + qq.text, quick: qq.quick, via: 'setup' }], setup: next, patches, last: null, liveEligible: false, paused: null, unclear: 0 };
  }
  return { messages: [finishSetup(ctx, settings, notes)], setup: null, patches, last: { intent: 'plan' }, liveEligible: false, paused: null, unclear: 0 };
}

function setupTurn(text: string, ctx: RayCtx, conv: ConvState): Turn {
  const step = conv.setup!;
  const q: QCtx = { ctx, settings: ctx.settings };
  const kind = classifySetupTurn(step, text, q);
  if (kind === 'nav') return navTurn(setupNav(text)!, step, ctx);
  if (kind === 'question') return sideQuestion(step, text, ctx);
  if (kind === 'what_if') { const w = whatIf(step, normalize(text), q); return w ? sideWhatIf(step, ctx, w) : sideQuestion(step, text, ctx); }
  if (kind === 'unclear') return unclearTurn(step, text, ctx, (conv.unclear ?? 0) + 1);
  const t = text.toLowerCase().trim();
  if (DELEGATE.test(t)) {
    if (step === 'growth') return answerTurn(step, 'none', ctx, 'I won\'t give up profit on your behalf, so the plan stays most profit. You can pick a growth step on the Trade-offs card any time.');
    return answerTurn(step, step === 'margin' && /know|sure|idea/.test(t) ? text : 'typical', ctx, step === 'margin' && /know|sure|idea/.test(t) ? undefined : 'I\'ll use the typical value for stores your size here, marked typical, not yours.');
  }
  return answerTurn(step, text, ctx, undefined, conv.unclear ?? 0);
}

const RESUME = /^(resume|continue|finish|back to|go back to|carry on with)( the| my)? setup\b|^resume setup at q\d+$/;

/** Ray's reply to one merchant message. Never identical to Ray's previous message. */
export function converse(text: string, ctx: RayCtx, conv: ConvState): Turn {
  const turn = converseOnce(text, ctx, conv);
  const out: Turn = { ...turn, paused: turn.paused !== undefined ? turn.paused : turn.setup ? null : conv.paused ?? null, unclear: turn.unclear ?? 0 };
  const first = out.messages[0];
  if (conv.prev !== undefined && first && first.text.trim() === conv.prev.trim()) out.messages = [{ ...first, text: `Same answer as a moment ago, since nothing has changed:\n\n${first.text}` }, ...out.messages.slice(1)];
  // While setup is paused, every reply keeps a way back (only the latest message shows chips).
  const lastMsg = out.messages[out.messages.length - 1];
  if (out.paused && !out.setup && lastMsg && !(lastMsg.quick ?? []).some((c) => c.message === 'Resume setup')) {
    out.messages = [...out.messages.slice(0, -1), { ...lastMsg, quick: [resumeChip(out.paused, ctx.settings), ...(lastMsg.quick ?? [])].slice(0, 5) }];
  }
  return out;
}

function converseOnce(text: string, ctx: RayCtx, conv: ConvState): Turn {
  if (conv.setup) return setupTurn(text, ctx, conv);

  const t = normalize(text);
  if (RESUME.test(t)) {
    if (conv.paused && stepsFor(ctx.settings).includes(conv.paused)) return ask(conv.paused, ctx, 'Back to setup.');
    return converseOnce('Set up Smart Offers', ctx, { ...conv, paused: null });
  }
  const last = conv.last;
  if (last?.draft && (AFFIRM.test(t) || APPROVE_WORDS.test(t))) return { messages: [{ role: 'ray', text: 'Tap **Approve** on the draft card above to make it live. I can only draft: your click is what changes anything.', via: 'demo' }], setup: null, last, liveEligible: false, intent: 'approve_click' };
  if (AFFIRM.test(t)) {
    if (last?.next) return converse(last.next.message, ctx, { setup: null, last: null });
    if (last?.quick?.length) return { messages: [{ role: 'ray', text: last.asked ? 'Which one? Tap an option below, or tell me in your own words.' : 'Happy to. Pick one of these, or ask me anything.', quick: last.quick, via: 'demo' }], setup: null, last, liveEligible: false, intent: last.asked ? 'which_one' : 'clarify' };
    return { messages: [{ role: 'ray', text: 'Happy to. What should I look at?', quick: chipsFor(HELP_CHIPS, ctx), via: 'demo' }], setup: null, last: null, liveEligible: true, intent: 'clarify' };
  }
  if (NEGATE.test(t)) return { messages: [{ role: 'ray', text: 'OK, nothing changed. Ask me anything else.', quick: chipsFor(last?.intent ? FOLLOW_UPS.plan : HELP_CHIPS, ctx), via: 'demo' }], setup: null, last: null, liveEligible: false, intent: 'ack' };

  let local = route(text, ctx);
  if (local.intent === 'help') {
    const again = contextual(t, last, ctx.approved);
    if (again) local = route(again, ctx);
  }
  if (local.startSetup) {
    const q = question('budget', { ctx, settings: ctx.settings });
    return { messages: [{ role: 'ray', text: `${local.text}\n\n${q.text}`, quick: q.quick, via: 'setup' }], setup: 'budget', reply: local, last: null, liveEligible: false };
  }
  local = withNext(local, ctx);
  const quick = local.quick ? chipsFor(local.quick, ctx, t) : undefined;
  const note = typicalNote(local, ctx);
  const lastOut: LastTurn = { intent: local.intent, next: local.next, about: aboutOf(local), draft: local.card?.kind === 'draft', quick, asked: /\?\s*$/.test(local.text.trim()) };
  return {
    messages: [{ role: 'ray', text: note ? `${local.text}\n${note.text}` : local.text, cards: local.card ? [local.card] : undefined, quick: note ? [...(quick ?? []).slice(0, 3), note.chip] : quick, refused: local.refused, via: 'demo' }],
    setup: null, reply: local, last: lastOut, liveEligible: !local.refused,
  };
}
