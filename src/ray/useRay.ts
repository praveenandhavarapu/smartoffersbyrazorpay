import { useCallback } from 'react';
import { useModel } from '../state/ModelContext';
import { useStore } from '../state/store';
import { route } from './demoRouter';
import { askLive } from './liveClient';
import { useChat } from './chatStore';
import type { Draft, RayCtx } from './tools';

const draftSummary = (d: Draft) => (d.type === 'override' ? `Drafted: ${d.group} → ${d.offer}` : d.type === 'pause' ? `Drafted pause (${d.scope})` : `Drafted: ${d.summary}`);

/** Ask Ray: try live mode (if the function answers), else demo mode. Never blocks the demo. */
export function useRay() {
  const { model, derived } = useModel();
  const settings = useStore((s) => s.settings);
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  return useCallback(async (text: string) => {
    const chat = useChat.getState();
    if (!text.trim() || chat.busy) return;
    const ctx: RayCtx = { model, derived, settings, approved, killed };
    chat.push({ role: 'user', text });
    // Privacy and guardrail refusals are always handled locally, before anything leaves the browser.
    const local = route(text, ctx);
    const logDraft = useStore.getState().logDraft;
    if (local.refused || chat.mode === 'demo') {
      if (local.card?.kind === 'draft') logDraft(draftSummary(local.card.draft));
      chat.push({ role: 'ray', text: local.text, card: local.card, quick: local.quick, refused: local.refused, via: 'demo' });
      return;
    }
    chat.setBusy(true);
    const live = await askLive(chat.liveHistory, text, ctx);
    chat.setBusy(false);
    if (!live) {
      chat.setMode('demo');
      if (local.card?.kind === 'draft') logDraft(draftSummary(local.card.draft));
      chat.push({ role: 'ray', text: local.text, card: local.card, quick: local.quick, via: 'demo' });
      return;
    }
    chat.setMode('live');
    chat.setLiveHistory(live.history);
    chat.push({ role: 'ray', text: live.text, via: 'live' });
    for (const d of live.drafts) logDraft(draftSummary(d));
    for (const d of live.drafts) chat.push({ role: 'ray', text: 'Draft ready. It needs your Approve.', card: { kind: 'draft', draft: d }, via: 'live' });
  }, [model, derived, settings, approved, killed]);
}
