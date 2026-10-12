import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useChat, type ChatMsg } from '../../ray/chatStore';
import { useRay } from '../../ray/useRay';
import type { RayCard } from '../../ray/demoRouter';
import type { Draft } from '../../ray/tools';
import { useStore } from '../../state/store';
import { inr, inrSigned, num, pctSigned, xr } from '../../lib/format';
import { OFFER_BY_ID } from '../../data/fixtures';
import { Clover, Send } from './Icons';
import { Markdown } from './Markdown';
import { AccuracyTable, ExperimentsList, OpportunityPanel, PilotDecisionCard, ReviewCard, WhyAI } from './lifecycle';
import { useModel } from '../../state/ModelContext';
import { ImpactMini } from './RayCards';
import { OfferChip, shortGroup } from './bits';
import { PlanCard } from './PlanCard';
import { ApprovedCard, CreatorsCard, DailyCard, PaymentsCard, PaymentsListCard, RefundsCard, ResultsCard, SettlementsCard, WasteCard } from './RayCards';
import { FEATURES } from '../../config/features';
import { TradeoffCard } from './Tradeoffs';
import { RecommendCard } from './Recommend';
import { SetupCard } from './SetupCard';

/** Live/Demo switch. Live is disabled (with the reason) when the function has no key or isn't deployed. */
export function ModeToggle() {
  const mode = useStore((s) => s.rayMode);
  const setMode = useStore((s) => s.setRayMode);
  const health = useChat((s) => s.health);
  const ready = health.state === 'ready';
  const effective = mode === 'live' && ready ? 'live' : 'demo';
  const reason = health.state === 'off' ? health.reason : health.state === 'checking' ? 'Checking live mode…' : `Live: ${health.model}`;
  return (
    <div className="mode-toggle" title={reason}>
      <div className="seg sm" role="radiogroup" aria-label="Ray mode">
        <button role="radio" aria-checked={effective === 'live'} className={effective === 'live' ? 'on' : ''} disabled={!ready} onClick={() => setMode('live')}><i className={`dot ${ready ? 'ok' : ''}`} />Live</button>
        <button role="radio" aria-checked={effective === 'demo'} className={effective === 'demo' ? 'on' : ''} onClick={() => setMode('demo')}>Demo</button>
      </div>
      <span className="mode-note">{health.state === 'ready' ? (effective === 'live' ? `Claude (${health.model})` : 'Scripted answers') : reason}</span>
    </div>
  );
}

function SimCard({ title, sim }: Extract<RayCard, { kind: 'sim' }>) {
  return (
    <div className="plan mini">
      <div className="plan-head"><div className="plan-title">{title}</div><span className="pill grey">Preview · not applied</span></div>
      {sim.over_budget && <p className="plan-note warn">Spends {inr(sim.spend)}, over the {inr(sim.budget)} budget: the hard stop would switch offers off when it runs out.</p>}
      <div className="mini-rows">
        {sim.rows.map((r) => <div key={r.group}><span>{shortGroup(r.label)}</span><OfferChip offer={r.offer} /></div>)}
      </div>
      <div className="totals">
        <div><div className="s">Spend</div><div className="v">{inr(sim.spend)}</div></div>
        <div><div className="s">Return</div><div className="v">{sim.spend ? xr(sim.return_x) : '—'}</div></div>
        <div><div className="s">Profit / month</div><div className="v">{inrSigned(sim.profit)}</div></div>
        <div><div className="s">Orders vs today</div><div className="v">{pctSigned(sim.orders_change_pct)}</div></div>
      </div>
    </div>
  );
}

/** v3: every scenario Ray ran, side by side, so the text and the card always describe the same plans. */
function ScenariosCard({ items }: Extract<RayCard, { kind: 'scenarios' }>) {
  const groups = items[0]?.sim.rows ?? [];
  return (
    <div className="plan mini scen">
      <div className="plan-head"><div className="plan-title">{items.length} scenarios compared</div><span className="pill grey">Preview · not applied</span></div>
      <div className="tbl-wrap">
        <table className="dtable compact scen-table">
          <thead><tr><th>Scenario</th>{items.map((x, i) => <th key={i}>{i + 1}. {x.title}</th>)}</tr></thead>
          <tbody>
            {groups.map((g) => <tr key={g.group}><td>{shortGroup(g.label)}</td>{items.map((x, i) => <td key={i}><OfferChip offer={x.sim.rows.find((r) => r.group === g.group)!.offer} /></td>)}</tr>)}
            <tr><td><b>Spend</b></td>{items.map((x, i) => <td key={i}>{inr(x.sim.spend)}{x.sim.over_budget && <span className="sub warn">over the {inr(x.sim.budget)} budget</span>}</td>)}</tr>
            <tr><td><b>Return after returns</b></td>{items.map((x, i) => <td key={i}>{x.sim.spend ? xr(x.sim.return_x) : '—'}</td>)}</tr>
            <tr><td><b>Profit / month</b></td>{items.map((x, i) => <td key={i}><b className={x.sim.profit < 0 ? 'bad' : ''}>{inrSigned(x.sim.profit)}</b></td>)}</tr>
            <tr><td><b>Orders vs today</b></td>{items.map((x, i) => <td key={i}>{pctSigned(x.sim.orders_change_pct)}</td>)}</tr>
            <tr><td><b>New customers / month</b></td>{items.map((x, i) => <td key={i}>{num(x.sim.new_customers_month)}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DraftCard({ draft }: { draft: Draft }) {
  const applyOverride = useStore((s) => s.applyOverride);
  const kill = useStore((s) => s.kill);
  const resume = useStore((s) => s.resume);
  const setSettings = useStore((s) => s.setSettings);
  const approveChanges = useStore((s) => s.approveChanges);
  const [state, setState] = useState<'open' | 'done' | 'dismissed'>('open');
  if (state === 'dismissed') return <div className="draft muted small">Draft dismissed. Nothing changed.</div>;
  if (state === 'done') return <div className="draft ok small">Applied by you. Logged in the audit log.</div>;
  const approve = () => {
    if (draft.type === 'override') applyOverride(draft.group, draft.offer, draft.from, `${OFFER_BY_ID[draft.offer].label} (${inrSigned(draft.profit)} / month)`);
    else if (draft.type === 'pause') kill();
    else if (draft.type === 'resume') resume();
    else {
      setSettings(draft.patch);
      // Ray's card is the merchant's explicit approval: once live, the change goes through Approve changes (logged with its summary).
      if (FEATURES.netReturns && useStore.getState().approved) approveChanges(draft.summary);
    }
    setState('done');
  };
  return (
    <div className="draft card">
      <div className="mono-tag amber">Draft · needs your approval</div>
      {draft.type === 'override' && (draft.offer === 'none' && draft.vsNow ? (
        <p>{draft.groupLabel}: <OfferChip offer={draft.from} muted /> → <OfferChip offer={draft.offer} />. Saves {inr(-draft.vsNow.spend)} / month · about {num(Math.abs(draft.vsNow.extraOrders))} fewer orders · profit change <b className={draft.vsNow.profit < 0 ? 'bad' : 'good'}>{inrSigned(draft.vsNow.profit)} / month</b>.</p>
      ) : (
        <p>{draft.groupLabel}: <OfferChip offer={draft.from} muted /> → <OfferChip offer={draft.offer} />. Cost {inr(draft.spend)} / month for about {num(draft.extraOrders)} extra orders ({xr(draft.ret)}{FEATURES.netReturns ? ' after returns' : ''}): <b className={draft.profit < 0 ? 'bad' : 'good'}>{inrSigned(draft.profit)} / month</b>{draft.vsNow ? <> ({inrSigned(draft.vsNow.profit)} vs now)</> : null}.</p>
      ))}
      {draft.type === 'override' && draft.planAfter && <p className={`small ${draft.planAfter.over_budget ? 'warn' : 'muted'}`}>Whole plan after this change: {inr(draft.planAfter.spend)} of {inr(draft.planAfter.budget)} budget, {inrSigned(draft.planAfter.profit)} a month.{draft.planAfter.over_budget && draft.planAfter.budget_needed ? ` Over budget: the hard stop switches offers off when it runs out. You'd need about ${inr(draft.planAfter.budget_needed)}.` : ''}</p>}
      {draft.type === 'pause' && <p>Pause {draft.scope === 'all' ? 'all Smart Offers' : draft.scope}. Shoppers see the store default checkout.</p>}
      {draft.type === 'resume' && <p>Resume Smart Offers: the approved plan serves again from the next checkout; the holdout stays on.</p>}
      {draft.type === 'settings' && (FEATURES.rayV2 && draft.summary.includes('→')
        ? <><p className="small">Changes (draft, not live until you approve):</p><ul className="small">{draft.summary.split('; ').map((x) => <li key={x}>{x}</li>)}</ul></>
        : <p>{draft.summary}</p>)}
      <div className="btns">
        <button className="btn primary sm" onClick={approve}>{draft.type === 'pause' ? 'Confirm pause' : draft.type === 'resume' ? 'Confirm resume' : 'Approve'}</button>
        <button className="btn secondary sm" onClick={() => setState('dismissed')}>Cancel</button>
      </div>
    </div>
  );
}

function LatestReview() {
  const { derived } = useModel();
  return derived.reviews[0] ? <ReviewCard review={derived.reviews[0]} /> : null;
}

function CurrentAccuracy() {
  const { derived } = useModel();
  const moment = useStore((s) => s.moment);
  return <AccuracyTable snap={moment === 'day30' ? derived.snapshots.day30 : derived.snapshots.day20} />;
}

function CardView({ card, onAsk }: { card: RayCard; onAsk: (q: string) => void }) {
  const approved = useStore((s) => s.approved);
  switch (card.kind) {
    case 'plan_live': return <><PlanCard onAsk={onAsk} inlineSetup />{approved && <ApprovedCard />}</>;
    case 'sim': return <SimCard {...card} />;
    case 'scenarios': return <ScenariosCard {...card} />;
    case 'tradeoff': return <TradeoffCard initial={card.view} />;
    case 'recommendations': return <RecommendCard limit={4} />;
    case 'inputs': return <SetupCard embedded />;
    case 'draft': return <DraftCard draft={card.draft} />;
    case 'waste': return <WasteCard onFix={() => onAsk('Set up Smart Offers')} />;
    case 'payments': return <PaymentsCard d={card.data} />;
    case 'daily': return <DailyCard d={card.data} />;
    case 'payments_list': return <PaymentsListCard title={card.title} d={card.data} />;
    case 'settlements': return <SettlementsCard d={card.data} />;
    case 'refunds': return <RefundsCard d={card.data} />;
    case 'results': return <ResultsCard d={card.data} />;
    case 'creators': return <CreatorsCard />;
    case 'opportunities': return <OpportunityPanel />;
    case 'why_ai': return <WhyAI />;
    case 'review': return <LatestReview />;
    case 'accuracy': return <CurrentAccuracy />;
    case 'decision': return <PilotDecisionCard />;
    case 'impact': return <ImpactMini />;
    case 'experiments': return <ExperimentsList />;
    case 'help': return <div className="chips">{card.items.map((i) => <button key={i.label} className="chip" onClick={() => onAsk(i.message)}>{i.label}</button>)}</div>;
    default: return null;
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="msg-act" onClick={() => { void navigator.clipboard?.writeText(text.replace(/\*\*/g, '')).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }} aria-label="Copy answer">
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Msg({ m, onAsk, last }: { m: ChatMsg; onAsk: (q: string) => void; last: boolean }) {
  if (m.role === 'user') return <div className="msg-user">{m.text}</div>;
  return (
    <div className="msg-ray">
      <div className="ray-line"><span className="clover"><Clover /></span><b>Ray</b>{m.refused && <span className="mono-tag amber">Declined</span>}{m.via === 'live' && <span className="mono-tag green">Live</span>}</div>
      {m.note && <div className="ray-note" role="status">{m.note}</div>}
      <div className="ray-doc"><Markdown text={m.text} /><div className="msg-acts"><CopyButton text={m.text} /></div></div>
      {m.cards?.map((c, i) => <CardView key={i} card={c} onAsk={onAsk} />)}
      {last && m.quick && <div className="chips quick">{m.quick.map((q) => <button key={q.label} className="chip hl" onClick={() => onAsk(q.message)}>{q.label}</button>)}</div>}
    </div>
  );
}

export function ChatThread() {
  const messages = useChat((s) => s.messages);
  const busy = useChat((s) => s.busy);
  const ask = useRay();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }); }, [messages.length, busy]);
  const lastRay = [...messages].reverse().find((m) => m.role === 'ray')?.id;
  return (
    <div className="chat" aria-live="polite">
      {messages.map((m) => <Msg key={m.id} m={m} onAsk={(q) => void ask(q)} last={m.id === lastRay} />)}
      {busy && <div className="msg-ray"><div className="ray-line"><span className="clover pulse"><Clover /></span><b>Ray</b><span className="muted small">thinking…</span></div></div>}
      <div ref={end} />
    </div>
  );
}

export function Composer({ placeholder = 'Ask Ray about payments, settlements, offers…', onSubmit, autoFocus }: { placeholder?: string; onSubmit?: (q: string) => void; autoFocus?: boolean }) {
  const ask = useRay();
  const busy = useChat((s) => s.busy);
  const setup = useChat((s) => s.setup);
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    if (onSubmit) onSubmit(q); else void ask(q);
    setText('');
  };
  return (
    <form className="composer row-form" onSubmit={submit}>
      <input aria-label="Message Ray" value={text} onChange={(e) => setText(e.target.value)} placeholder={setup ? 'Type your answer, or tap an option above (say "cancel" to stop)' : placeholder} autoFocus={autoFocus} />
      <button className="send" aria-label="Send" type="submit" disabled={busy}><Send /></button>
    </form>
  );
}
