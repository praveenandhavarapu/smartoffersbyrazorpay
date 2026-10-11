/**
 * Ray's conversation core (pure): guided setup, local routing and follow-ups. useRay wires it to the
 * stores; the scenario tests call it directly, so tests exercise exactly what the app does.
 * v3: "yes" runs what the last reply offered; "what about 35%?", "why?" and "give them ₹100 off"
 * use what the last reply was about; setup never assumes an input.
 */
import { route, FOLLOW_UPS, type QuickReply, type RayReply } from './demoRouter';
import { question, parseAnswer, nextStep, stepsFor, type QCtx } from './setupFlow';
import { T } from './templates';
import { tools, type RayCtx } from './tools';
import type { ChatMsg, LastTurn, SetupStep } from './chatStore';
import type { InputSource, Settings } from '../state/store';
import { AFFIRM, APPROVE_WORDS, GROUP_WORD, NEGATE, normalize, parseDays } from './parse';
import { pendingInputs } from '../state/inputs';
import { inr } from '../lib/format';
import { offerLabel } from '../lib/labels';
import { inputValue } from '../state/inputs';
import { INPUT_LABEL, inputKeysOf } from '../state/store';

export type RayMsg = Omit<ChatMsg, 'id'>;
export type ConvState = { setup: SetupStep | null; last?: LastTurn | null };
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
  /** Turn-level intent when no routed reply exists (follow-up handling). */
  intent?: 'clarify' | 'which_one' | 'approve_click' | 'ack';
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

export function converse(text: string, ctx: RayCtx, conv: ConvState): Turn {
  if (conv.setup) {
    const step = conv.setup;
    if (/^(cancel|stop|exit|quit)\b/i.test(text.trim())) return { messages: [{ role: 'ray', text: 'Setup cancelled. Nothing changed.', via: 'setup' }], setup: null, last: null, liveEligible: false };
    const q: QCtx = { ctx, settings: ctx.settings };
    const a = parseAnswer(step, text, q);
    if (!a.ok) { const qq = question(step, q); return { messages: [{ role: 'ray', text: a.hint, quick: qq.quick, via: 'setup' }], setup: step, last: null, liveEligible: false }; }
    const settings = { ...ctx.settings, ...a.patch };
    const patches = [{ patch: a.patch, source: a.source }];
    const next = a.rest ? null : a.again ? step : nextStep(step, settings);
    if (next && stepsFor(settings).includes(next)) {
      const qq = question(next, { ctx: { ...ctx, settings }, settings });
      return { messages: [{ role: 'ray', text: (a.note ? a.note + '\n\n' : '') + qq.text, quick: qq.quick, via: 'setup' }], setup: next, patches, last: null, liveEligible: false };
    }
    return { messages: [finishSetup(ctx, settings, a.note ? [a.note] : [])], setup: null, patches, last: { intent: 'plan' }, liveEligible: false };
  }

  const t = normalize(text);
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
