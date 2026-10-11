/**
 * Runs merchant conversations through Ray's conversation core in several store states and checks
 * invariants on every reply. Used by conversations.test.ts (strict) and by the audit report.
 */
import { converse, type ConvState, type RayMsg } from '../../converse';
import { route, type RayCard, type RayReply } from '../../demoRouter';
import type { RayCtx } from '../../tools';
import { derive, type DerivedInput } from '../../../state/derived';
import { DEFAULT_USER_SETTINGS, inputKeysOf, type InputKey, type InputSource, type Settings } from '../../../state/store';
import type { Model } from '../../../state/model';
import { ledgerView } from '../../../data/ledgerQueries';
import { inrSigned } from '../../../lib/format';
import type { Scenario } from './corpus';

export type StateId = 'fresh' | 'live20' | 'live30' | 'draft' | 'killed' | 'margin40';
export type Issue = { scenario: string; state: StateId; turn: number; text: string; problem: string; reply: string };

type StoreSim = DerivedInput & { moment: NonNullable<DerivedInput['moment']>; confirmed?: Partial<Record<InputKey, InputSource>> };

export function initialState(id: StateId): StoreSim {
  const base: StoreSim = { settings: DEFAULT_USER_SETTINGS, approved: false, approvedSettings: null, overrides: {}, killed: false, moment: 'before', creatorFix: 'pending' };
  const live = (s: Settings = DEFAULT_USER_SETTINGS): StoreSim => ({ ...base, settings: s, approved: true, approvedSettings: s, moment: 'day20' });
  if (id === 'fresh') return base;
  if (id === 'live20') return live();
  if (id === 'live30') return { ...live(), moment: 'day30', learningDecisions: { 'promote-big-150': 'approved' }, learningDecidedOn: { 'promote-big-150': 22 } };
  if (id === 'draft') return { ...live(), settings: { ...DEFAULT_USER_SETTINGS, budget: 50000 } };
  if (id === 'killed') return { ...live(), killed: true };
  const m40 = { ...DEFAULT_USER_SETTINGS, keepPer1000: 400 };
  return live(m40);
}

export function ctxFor(model: Model, st: StoreSim): RayCtx {
  return {
    model, derived: derive(model, st), settings: st.settings, approved: st.approved, killed: st.killed,
    ledger: ledgerView(st.moment), settlementMode: 't1', instant: [], day: st.moment === 'day30' ? 'day30' : 'day20', reviewDecisions: {}, confirmed: st.confirmed ?? {},
  };
}

export type Exchange = { user: string; msgs: RayMsg[]; intent?: string; ctx: RayCtx; reply?: RayReply };

export function runConversation(model: Model, sc: Scenario, stateId: StateId): Exchange[] {
  let st = initialState(stateId);
  let conv: ConvState = { setup: null };
  const out: Exchange[] = [];
  for (const text of sc.turns) {
    const ctx = ctxFor(model, st);
    const t = converse(text, ctx, conv);
    out.push({ user: text, msgs: t.messages, intent: t.intent ?? t.reply?.intent ?? (t.setup || t.patches ? 'setup' : undefined), ctx, reply: t.reply });
    conv = { setup: t.setup, last: t.last };
    for (const p of t.patches ?? []) st = { ...st, settings: { ...st.settings, ...p.patch }, confirmed: { ...st.confirmed, ...Object.fromEntries(inputKeysOf(p.patch).map((k) => [k, p.source])) } };
  }
  return out;
}

const BAD_TOKENS = /\bundefined\b|\bNaN\b|Infinity|\[object|\bnull\b/;
const INCAPABLE = /\bI (couldn't|could not|can't|cannot|am unable to|'m unable to) (run|do|simulate|show|find|calculate|answer)\b|\bno per-group\b|\bdon't have (a|that) tool\b/i;
const OFFERS_ACTION = /(Want (me )?to|Shall I|Would you like|Do you want|Which would you like|Should I)[^?]*\?\s*$/;

/** Cards whose numbers must agree with the reply text. */
function cardProblems(text: string, cards: RayCard[] | undefined): string[] {
  const out: string[] = [];
  for (const c of cards ?? []) {
    if (c.kind === 'sim' && !text.includes(inrSigned(c.sim.profit)) && !(c.sim.rows.every((r) => r.offer === 'none') && /no offer/i.test(text))) out.push(`sim card profit ${inrSigned(c.sim.profit)} not in text`);
  }
  return out;
}

export function checkConversation(model: Model, sc: Scenario, stateId: StateId): Issue[] {
  const issues: Issue[] = [];
  const ex = runConversation(model, sc, stateId);
  ex.forEach((e, i) => {
    const last = i === ex.length - 1;
    const add = (problem: string, m?: RayMsg) => issues.push({ scenario: sc.id, state: stateId, turn: i + 1, text: e.user, problem, reply: (m?.text ?? e.msgs.map((x) => x.text).join(' | ')).slice(0, 220) });
    if (!e.msgs.length) add('no reply');
    for (const m of e.msgs) {
      if (!m.text.trim()) add('empty reply', m);
      if (BAD_TOKENS.test(m.text)) add('bad token in text', m);
      if (INCAPABLE.test(m.text) && !m.refused) add('says it cannot do something', m);
      for (const q of m.quick ?? []) {
        const preset = q.label.match(/\b30%|\b4x\b|₹50,000/);
        const said = sc.turns.slice(0, i + 1).join(' ').toLowerCase().replace(/\s+/g, '');
        if (preset && !said.includes(preset[0].replace(/[₹,]/g, '').toLowerCase()) && !said.includes(preset[0].toLowerCase())) add(`quick reply "${q.label}" presets a number the merchant didn't give`, m);
      }
      for (const p of cardProblems(m.text, m.cards)) add(p, m);
      // Every quick reply must lead somewhere (not the generic help).
      for (const q of m.quick ?? []) {
        if (e.intent === 'setup' || m.via === 'setup') continue;
        const r = route(q.message, e.ctx);
        if (r.intent === 'help') add(`quick reply "${q.label}" falls through to help`, m);
      }
    }
    const intent = e.intent ?? '';
    const live = e.ctx.approved;
    const allText = e.msgs.map((m) => m.text).join(' ');
    // Live store: never talk as if nothing is set up.
    if (live && /Nothing goes live until|Want to set it up\?|Shall I set up Smart Offers|Four quick questions/.test(allText)) add('treats a live store as not set up');
    if (live && e.msgs.some((m) => (m.quick ?? []).some((q) => q.message === 'Set up Smart Offers'))) add('offers "Set up Smart Offers" on a live store');
    // Before go-live: no chips that only work once live; and say when numbers are typical values, not the merchant's.
    if (!live && e.msgs.some((m) => (m.quick ?? []).some((q) => /^(What changed this week|How accurate were your estimates|Should I keep Smart Offers)/.test(q.message)))) add('offers a live-only chip before go-live');
    const inputTools = ['simulate_plan', 'get_current_plan', 'get_tradeoffs', 'get_recommended_offers', 'get_why_ai', 'explain_group', 'get_offer_waste'];
    const inputIntents = ['guardrails', 'break_even', 'holdout_cost', 'menu', 'plan_groups', 'edit_plan', 'impact', 'settings_draft', 'menu_draft', 'growth_draft', 'min_return_draft', 'max_discount_draft'];
    if (!live && e.reply && !e.reply.refused && (inputIntents.includes(intent) || e.reply.toolCalls.some((c) => inputTools.includes(c.name))) && !/typical values|not confirmed/.test(allText) && !['my_numbers', 'inputs_typical', 'approve_via_click', 'testing', 'cart_agent', 'stores_like_mine', 'why_no_results'].includes(intent)) add('uses unconfirmed inputs without saying they are typical values');
    // Every settings draft must change something.
    for (const m of e.msgs) for (const c of m.cards ?? []) if (c.kind === 'draft' && c.draft.type === 'settings' && /^No change$/.test(c.draft.summary)) add('settings draft changes nothing', m);
    // "Why" is a question, never a change.
    if (/^why\b|\bwhy (does|do|is|are)\b/.test(e.user.toLowerCase()) && e.msgs.some((m) => m.cards?.some((c) => c.kind === 'draft'))) add('a "why" question created a draft');
    // Drafts must change something.
    for (const m of e.msgs) for (const c of m.cards ?? []) if (c.kind === 'draft' && c.draft.type === 'override' && c.draft.from === c.draft.offer) add('draft changes nothing', m);
    if (!live && e.msgs.some((m) => m.cards?.some((c) => c.kind === 'draft' && c.draft.type === 'pause'))) add('drafts a pause before anything is live');
    if (last && sc.expect?.refused && !e.msgs.some((m) => m.refused)) add('expected a refusal');
    if (!sc.expect?.refused && e.msgs.some((m) => m.refused)) add('refused a legitimate request');
    if (intent === 'help' && !sc.expect?.helpOk) add('fell through to generic help');
    if (last && sc.expect?.intent && !sc.expect.intent.test(intent)) add(`intent ${intent} does not match ${sc.expect.intent}`);
    // A reply that offers an action must be able to carry it out on "yes".
    if (last && !sc.expect?.refused) {
      const lastMsg = e.msgs[e.msgs.length - 1];
      if (lastMsg && OFFERS_ACTION.test(lastMsg.text.trim()) && lastMsg.via !== 'setup') {
        const yes = runConversation(model, { ...sc, turns: [...sc.turns, 'yes please'] }, stateId).pop()!;
        if (yes.intent === 'help' || yes.intent === 'clarify' || yes.msgs.some((m) => INCAPABLE.test(m.text))) add('offers a next step but "yes please" does not do it', lastMsg);
      }
    }
  });
  return issues;
}

export const STATES: StateId[] = ['fresh', 'live20', 'live30', 'draft', 'killed', 'margin40'];
