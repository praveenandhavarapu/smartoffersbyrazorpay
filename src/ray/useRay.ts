import { useCallback } from 'react';
import { useModel } from '../state/ModelContext';
import { useStore } from '../state/store';
import { route, FOLLOW_UPS, type RayCard, type QuickReply } from './demoRouter';
import { askLive } from './liveClient';
import { useChat } from './chatStore';
import { question, parseAnswer, SETUP_ORDER } from './setupFlow';
import { T } from './templates';
import { tools, type Draft, type RayCtx, type ToolCall } from './tools';
import { ledgerView } from '../data/ledgerQueries';
import { FEATURES } from '../config/features';

const draftSummary = (d: Draft) => (d.type === 'override' ? `Drafted: ${d.group} → ${d.offer}` : d.type === 'pause' ? `Drafted pause (${d.scope})` : `Drafted: ${d.summary}`);

/** Cards for a live answer, built from the tools Claude called (last one of each kind, at most two). */
function cardsFromCalls(calls: ToolCall[]): { cards: RayCard[]; quick: QuickReply[] } {
  const byKind = new Map<string, RayCard>();
  let quick: QuickReply[] = [];
  for (const c of calls) {
    const r = c.result as Record<string, unknown>;
    if (!r || 'error' in r) continue;
    switch (c.name) {
      case 'get_payments_summary': byKind.set('payments', { kind: 'payments', data: r as never }); quick = FOLLOW_UPS.payments; break;
      case 'get_daily_payments': byKind.set('daily', { kind: 'daily', data: r as never }); quick = FOLLOW_UPS.payments; break;
      case 'list_payments': byKind.set('list', { kind: 'payments_list', title: 'Payments', data: r as never }); quick = FOLLOW_UPS.payments; break;
      case 'get_settlements': byKind.set('settlements', { kind: 'settlements', data: r as never }); quick = FOLLOW_UPS.settlements; break;
      case 'get_refunds_and_disputes': byKind.set('refunds', { kind: 'refunds', data: r as never }); quick = FOLLOW_UPS.refunds; break;
      case 'simulate_plan': byKind.set('sim', { kind: 'sim', title: FEATURES.rayV2 ? 'Scenario (not applied)' : 'Plan preview (not applied)', sim: r as never }); quick = FOLLOW_UPS.plan; break;
      case 'get_current_plan': byKind.set('sim', { kind: 'sim', title: 'Current plan', sim: r as never }); quick = FOLLOW_UPS.plan; break;
      case 'get_offer_waste': byKind.set('waste', { kind: 'waste' }); quick = FOLLOW_UPS.offers; break;
      case 'get_results': byKind.set('results', { kind: 'results', data: r as never }); quick = FOLLOW_UPS.results; break;
      case 'get_creator_code_report': byKind.set('creators', { kind: 'creators' }); quick = FOLLOW_UPS.offers; break;
      case 'get_opportunities': byKind.set('opportunities', { kind: 'opportunities' }); quick = FOLLOW_UPS.offers; break;
      case 'get_why_ai': byKind.set('why_ai', { kind: 'why_ai' }); quick = FOLLOW_UPS.offers; break;
      case 'get_weekly_review': if ((r as { available?: boolean }).available) byKind.set('review', { kind: 'review' }); quick = FOLLOW_UPS.results; break;
      case 'get_prediction_accuracy': byKind.set('accuracy', { kind: 'accuracy' }); quick = FOLLOW_UPS.results; break;
      case 'get_pilot_decision': byKind.set('decision', { kind: 'decision' }); quick = FOLLOW_UPS.results; break;
      case 'get_impact_summary': byKind.set('impact', { kind: 'impact' }); quick = FOLLOW_UPS.results; break;
      case 'get_next_experiments': byKind.set('experiments', { kind: 'experiments' }); quick = FOLLOW_UPS.results; break;
      case 'draft_plan_change': case 'request_pause': case 'draft_settings_change': { const d = (r as { draft?: Draft }).draft; if (d) byKind.set('draft', { kind: 'draft', draft: d }); break; }
      default: break;
    }
  }
  return { cards: [...byKind.values()].slice(-2), quick };
}

/** Ask Ray. Setup is a guided flow; privacy refusals are always local; everything else goes to Claude in Live mode. */
export function useRay() {
  const { model, derived } = useModel();
  return useCallback(async (text: string) => {
    const chat = useChat.getState();
    if (!text.trim() || chat.busy) return;
    // Read the latest inputs at call time (the demo player calls this several times in a row).
    const st = useStore.getState();
    const ctx: RayCtx = { model, derived, settings: st.settings, approved: st.approved, killed: st.killed, ledger: ledgerView(st.moment, st.instantSettlements), settlementMode: st.settlementMode, instant: st.instantSettlements, day: st.snapshot, reviewDecisions: st.reviewDecisions };
    const rayMode = st.rayMode;
    chat.push({ role: 'user', text });
    const festive = model.profile.upcomingDrop.name;

    // Guided setup.
    if (chat.setup) {
      if (/^(cancel|stop|exit|quit)\b/i.test(text.trim())) { chat.setSetup(null); chat.push({ role: 'ray', text: 'Setup cancelled. Nothing changed.', via: 'setup' }); return; }
      const step = chat.setup;
      const a = parseAnswer(step, text);
      if (!a.ok) { const q = question(step, festive); chat.push({ role: 'ray', text: a.hint, quick: q.quick, via: 'setup' }); return; }
      useStore.getState().setSettings(a.patch);
      const next = SETUP_ORDER[SETUP_ORDER.indexOf(step) + 1];
      if (next) {
        const q = question(next, festive);
        chat.setSetup(next);
        chat.push({ role: 'ray', text: (a.note ? a.note + '\n\n' : '') + q.text, quick: q.quick, via: 'setup' });
        return;
      }
      chat.setSetup(null);
      const s = tools.simulate_plan({ ...ctx, settings: useStore.getState().settings }, {});
      chat.push({ role: 'ray', text: T.plan(s), cards: [{ kind: 'plan_live' }], quick: FOLLOW_UPS.plan, via: 'setup' });
      return;
    }

    const local = route(text, ctx);
    if (local.startSetup) {
      const q = question('budget', festive);
      chat.setSetup('budget');
      chat.push({ role: 'ray', text: `${local.text}\n\n${q.text}`, quick: q.quick, via: 'setup' });
      return;
    }
    const logDraft = useStore.getState().logDraft;
    const answerLocally = (note?: string) => {
      if (local.card?.kind === 'draft') logDraft(draftSummary(local.card.draft));
      chat.push({ role: 'ray', text: local.text, cards: local.card ? [local.card] : undefined, quick: local.quick, refused: local.refused, via: 'demo', note });
    };
    const h = chat.health;
    if (local.refused || rayMode === 'demo') return answerLocally();
    if (h.state !== 'ready') return answerLocally(h.state === 'off' ? `Live mode unavailable: ${h.reason} Answered in Demo mode.` : undefined);

    chat.setBusy(true);
    const live = await askLive(chat.liveHistory, text, ctx);
    chat.setBusy(false);
    if (!live.ok) return answerLocally(`Live mode error: ${live.reason} Answered in Demo mode.`);
    chat.setLiveHistory(live.history);
    const { cards, quick } = cardsFromCalls(live.toolCalls);
    for (const c of cards) if (c.kind === 'draft') logDraft(draftSummary(c.draft));
    chat.push({ role: 'ray', text: live.text, cards, quick, via: 'live' });
  }, [model, derived]);
}
