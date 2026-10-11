/** v2 §7.5: "Now · Next · Waiting on you" — what the agent did last night, what's next, what needs the merchant. */
import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { fmtDate, pilotDayDate } from '../../lib/dates';
import { dayOf, KEYS } from '../../engine/learning';
import { offerLabel } from '../../lib/labels';
import { TABLE_NAME } from './HowAIWorks';
import { pendingActions } from '../../state/derived';

export function useNowNext() {
  const { derived } = useModel();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const decisions = useStore((s) => s.reviewDecisions);
  const L = derived.learning;
  const now = derived.nowDay;
  const big = L?.rows.find((r) => r.id === KEYS.startBig);
  let done: string | null = null;
  if (approved && now >= 1) {
    const base = killed ? 'Kill switch on: no offers served; holdout kept.' : `Refreshed ${TABLE_NAME}`;
    const note = killed || !big ? ''
      : big.status === 'running' ? ` · challenger ${offerLabel('flat_150')} vs ${offerLabel('flat_200')} running (day ${big.daysRunning} of ~${big.decisionDate && big.startedOn ? dayOf(big.decisionDate) - dayOf(big.startedOn) : big.daysRunning})`
      : big.status === 'promoted' ? ` · ${offerLabel('flat_150')} live for big carts since ${fmtDate(big.decisionDate ?? '', false)}`
      : big.status === 'waiting' ? ' · ₹150 off promotion waiting on you' : '';
    done = `${fmtDate(pilotDayDate(now), false)} 06:00 · ${base}${note}`;
  }
  let next: string | null = null;
  if (approved && derived.nextReview) {
    const ev = L?.events.find((e) => e.day === dayOf(derived.nextReview!) && e.needsApproval && !e.decision);
    next = `Mon ${fmtDate(derived.nextReview, false)} 06:00 · weekly review${ev ? `; likely proposal: ${ev.type === 'promotion_proposed' ? `promote ${offerLabel('flat_150')}` : ev.type === 'promotion_expected' ? 'promote the organic challenger' : 'a playbook test'}` : '; re-plan with this week\'s results'}`;
  } else if (approved && now === 0) next = `${fmtDate(pilotDayDate(1), false)} 06:00 · first run: publishes ${TABLE_NAME}`;
  const waiting = pendingActions(derived.reviews, decisions).map((i) => ({ id: i.id, label: i.title, to: '/studio/smart-offers?tab=reviews' }));
  if (derived.hasDraft) waiting.push({ id: 'draft', label: 'Plan changes (draft, not live)', to: '/offers/smart?tab=plan' });
  return { done, next, waiting };
}

export function NowStrip({ compact }: { compact?: boolean }) {
  const nav = useNavigate();
  const approved = useStore((s) => s.approved);
  const { done, next, waiting } = useNowNext();
  if (!approved) return null;
  return (
    <div className={`now-strip ${compact ? 'compact' : ''}`} role="region" aria-label="Now, next and waiting on you">
      <div><span className="ns-k">Done last night</span><span className="ns-v">{done ?? 'Not started yet: goes live at the next 06:00 run.'}</span></div>
      <div><span className="ns-k">Next</span><span className="ns-v">{next ?? '—'}</span></div>
      <div className={waiting.length ? 'wait' : ''}>
        <span className="ns-k">Waiting on you ({waiting.length})</span>
        <span className="ns-v">{waiting.length === 0 ? 'Nothing.' : waiting.slice(0, compact ? 2 : 4).map((w) => <button key={w.id} className="linkish ns-item" onClick={() => nav(w.to)}>{w.label}</button>)}{compact && waiting.length > 2 ? <span className="small"> +{waiting.length - 2} more</span> : null}</span>
      </div>
    </div>
  );
}
