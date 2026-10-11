/**
 * Ray's conversation core (pure): guided setup, local routing and follow-ups. useRay wires it to the
 * stores; the scenario tests call it directly, so tests exercise exactly what the app does.
 */
import { route, FOLLOW_UPS, type RayReply } from './demoRouter';
import { question, parseAnswer, SETUP_ORDER } from './setupFlow';
import { T } from './templates';
import { tools, type RayCtx } from './tools';
import type { ChatMsg, SetupStep } from './chatStore';
import type { Settings } from '../state/store';

export type RayMsg = Omit<ChatMsg, 'id'>;
export type ConvState = { setup: SetupStep | null };
export type Turn = {
  /** Messages Ray posts (none when the turn goes to Live mode). */
  messages: RayMsg[];
  setup: SetupStep | null;
  /** Settings the merchant gave during setup (form inputs, not approvals). */
  patch?: Partial<Settings>;
  /** The routed reply, when the turn was answered locally (for logging drafts and tests). */
  reply?: RayReply;
  /** true = not a setup turn and not refused: Live mode may answer it instead. */
  liveEligible: boolean;
};

export function converse(text: string, ctx: RayCtx, conv: ConvState): Turn {
  const festive = ctx.model.profile.upcomingDrop.name;
  if (conv.setup) {
    if (/^(cancel|stop|exit|quit)\b/i.test(text.trim())) return { messages: [{ role: 'ray', text: 'Setup cancelled. Nothing changed.', via: 'setup' }], setup: null, liveEligible: false };
    const step = conv.setup;
    const a = parseAnswer(step, text);
    if (!a.ok) { const q = question(step, festive); return { messages: [{ role: 'ray', text: a.hint, quick: q.quick, via: 'setup' }], setup: step, liveEligible: false }; }
    const next = SETUP_ORDER[SETUP_ORDER.indexOf(step) + 1];
    if (next) {
      const q = question(next, festive);
      return { messages: [{ role: 'ray', text: (a.note ? a.note + '\n\n' : '') + q.text, quick: q.quick, via: 'setup' }], setup: next, patch: a.patch, liveEligible: false };
    }
    const s = tools.simulate_plan({ ...ctx, settings: { ...ctx.settings, ...a.patch } }, {});
    return { messages: [{ role: 'ray', text: T.plan(s), cards: [{ kind: 'plan_live' }], quick: FOLLOW_UPS.plan, via: 'setup' }], setup: null, patch: a.patch, liveEligible: false };
  }
  const local = route(text, ctx);
  if (local.startSetup) {
    const q = question('budget', festive);
    return { messages: [{ role: 'ray', text: `${local.text}\n\n${q.text}`, quick: q.quick, via: 'setup' }], setup: 'budget', reply: local, liveEligible: false };
  }
  return {
    messages: [{ role: 'ray', text: local.text, cards: local.card ? [local.card] : undefined, quick: local.quick, refused: local.refused, via: 'demo' }],
    setup: null, reply: local, liveEligible: !local.refused,
  };
}
