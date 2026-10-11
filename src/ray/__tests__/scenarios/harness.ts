/**
 * Runs merchant conversations through Ray's conversation core in several store states and checks
 * invariants on every reply. Used by conversations.test.ts (strict) and by the audit report.
 */
import { converse, type ConvState, type RayMsg } from '../../converse';
import { route, type RayCard } from '../../demoRouter';
import type { RayCtx } from '../../tools';
import { derive, type DerivedInput } from '../../../state/derived';
import { DEFAULT_USER_SETTINGS, type Settings } from '../../../state/store';
import type { Model } from '../../../state/model';
import { ledgerView } from '../../../data/ledgerQueries';
import { inrSigned } from '../../../lib/format';
import type { Scenario } from './corpus';

export type StateId = 'fresh' | 'live20' | 'live30' | 'draft' | 'killed' | 'margin40';
export type Issue = { scenario: string; state: StateId; turn: number; text: string; problem: string; reply: string };

type StoreSim = DerivedInput & { moment: NonNullable<DerivedInput['moment']> };

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
    ledger: ledgerView(st.moment), settlementMode: 't1', instant: [], day: st.moment === 'day30' ? 'day30' : 'day20', reviewDecisions: {},
  };
}

export type Exchange = { user: string; msgs: RayMsg[]; intent?: string; ctx: RayCtx };

export function runConversation(model: Model, sc: Scenario, stateId: StateId): Exchange[] {
  let st = initialState(stateId);
  let conv: ConvState = { setup: null };
  const out: Exchange[] = [];
  for (const text of sc.turns) {
    const ctx = ctxFor(model, st);
    const t = converse(text, ctx, conv);
    out.push({ user: text, msgs: t.messages, intent: t.reply?.intent ?? (t.setup ? 'setup' : undefined), ctx });
    conv = { setup: t.setup, ...('last' in t ? { last: (t as { last?: unknown }).last } : {}) } as ConvState;
    if (t.patch) st = { ...st, settings: { ...st.settings, ...t.patch } };
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
    if (c.kind === 'sim' && !text.includes(inrSigned(c.sim.profit))) out.push(`sim card profit ${inrSigned(c.sim.profit)} not in text`);
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
      if (INCAPABLE.test(m.text)) add('says it cannot do something', m);
      for (const p of cardProblems(m.text, m.cards)) add(p, m);
      // Every quick reply must lead somewhere (not the generic help).
      for (const q of m.quick ?? []) {
        if (e.intent === 'setup' || m.via === 'setup') continue;
        const r = route(q.message, e.ctx);
        if (r.intent === 'help') add(`quick reply "${q.label}" falls through to help`, m);
      }
    }
    const intent = e.intent ?? '';
    if (last && sc.expect?.refused && !e.msgs.some((m) => m.refused)) add('expected a refusal');
    if (!sc.expect?.refused && e.msgs.some((m) => m.refused)) add('refused a legitimate request');
    if (intent === 'help' && !sc.expect?.helpOk) add('fell through to generic help');
    if (last && sc.expect?.intent && !sc.expect.intent.test(intent)) add(`intent ${intent} does not match ${sc.expect.intent}`);
    // A reply that offers an action must be able to carry it out on "yes".
    if (last && !sc.expect?.refused) {
      const lastMsg = e.msgs[e.msgs.length - 1];
      if (lastMsg && OFFERS_ACTION.test(lastMsg.text.trim()) && lastMsg.via !== 'setup') {
        const yes = runConversation(model, { ...sc, turns: [...sc.turns, 'yes please'] }, stateId).pop()!;
        if (yes.intent === 'help' || yes.msgs.some((m) => INCAPABLE.test(m.text))) add('offers a next step but "yes please" does not do it', lastMsg);
      }
    }
  });
  return issues;
}

export const STATES: StateId[] = ['fresh', 'live20', 'live30', 'draft', 'killed', 'margin40'];
