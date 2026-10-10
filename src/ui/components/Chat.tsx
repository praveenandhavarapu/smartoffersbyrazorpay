import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useChat, type ChatMsg } from '../../ray/chatStore';
import { useRay } from '../../ray/useRay';
import type { RayCard } from '../../ray/demoRouter';
import type { Draft } from '../../ray/tools';
import { useStore } from '../../state/store';
import { inr, inrSigned, num, pctSigned, xr } from '../../lib/format';
import { OFFER_BY_ID } from '../../data/fixtures';
import { Clover, Send } from './Icons';
import { OfferChip, shortGroup } from './bits';
import { PlanCard } from './PlanCard';

export function ModeChip() {
  const mode = useChat((s) => s.mode);
  return <span className="mono-tag" title="Live mode is used only when the site has an API key; otherwise Ray runs in demo mode.">{mode === 'live' ? 'Live mode' : 'Demo mode'}</span>;
}

function SimCard({ title, sim }: Extract<RayCard, { kind: 'sim' }>) {
  return (
    <div className="plan mini">
      <div className="plan-head"><div className="plan-title">{title}</div><span className="pill grey">Preview · not applied</span></div>
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

export function DraftCard({ draft }: { draft: Draft }) {
  const applyOverride = useStore((s) => s.applyOverride);
  const kill = useStore((s) => s.kill);
  const setSettings = useStore((s) => s.setSettings);
  const [state, setState] = useState<'open' | 'done' | 'dismissed'>('open');
  if (state === 'dismissed') return <div className="draft muted small">Draft dismissed. Nothing changed.</div>;
  if (state === 'done') return <div className="draft ok small">Applied by you. Logged in the audit log.</div>;
  const approve = () => {
    if (draft.type === 'override') applyOverride(draft.group, draft.offer, draft.from, `${OFFER_BY_ID[draft.offer].label} (${inrSigned(draft.profit)} / month)`);
    else if (draft.type === 'pause') kill();
    else setSettings(draft.patch);
    setState('done');
  };
  return (
    <div className="draft card">
      <div className="mono-tag amber">Draft · needs your approval</div>
      {draft.type === 'override' && (
        <p>{draft.groupLabel}: <OfferChip offer={draft.from} muted /> → <OfferChip offer={draft.offer} />. Cost {inr(draft.spend)} / month for {num(draft.extraOrders, 1)} extra orders ({xr(draft.ret)}): <b className={draft.profit < 0 ? 'bad' : 'good'}>{inrSigned(draft.profit)} / month</b>.</p>
      )}
      {draft.type === 'pause' && <p>Pause {draft.scope === 'all' ? 'all Smart Offers' : draft.scope}. Shoppers see the store default checkout.</p>}
      {draft.type === 'settings' && <p>{draft.summary}</p>}
      <div className="btns">
        <button className="btn primary sm" onClick={approve}>{draft.type === 'pause' ? 'Confirm pause' : 'Approve'}</button>
        <button className="btn secondary sm" onClick={() => setState('dismissed')}>Cancel</button>
      </div>
    </div>
  );
}

function CardView({ card, onAsk }: { card: RayCard; onAsk: (q: string) => void }) {
  if (card.kind === 'plan_live') return <PlanCard onAsk={onAsk} />;
  if (card.kind === 'sim') return <SimCard {...card} />;
  if (card.kind === 'draft') return <DraftCard draft={card.draft} />;
  return <div className="chips">{card.items.map((i) => <button key={i.label} className="chip" onClick={() => onAsk(i.message)}>{i.label}</button>)}</div>;
}

function Msg({ m, onAsk }: { m: ChatMsg; onAsk: (q: string) => void }) {
  if (m.role === 'user') return <div className="msg-user">{m.text}</div>;
  return (
    <div className="msg-ray">
      <div className="ray-line"><span className="clover"><Clover /></span><b>Ray</b>{m.refused && <span className="mono-tag amber">Declined</span>}</div>
      <p>{m.text}</p>
      {m.card && <CardView card={m.card} onAsk={onAsk} />}
      {m.quick && <div className="chips quick">{m.quick.map((q) => <button key={q.label} className="chip hl" onClick={() => onAsk(q.message)}>{q.label}</button>)}</div>}
    </div>
  );
}

export function ChatThread() {
  const messages = useChat((s) => s.messages);
  const busy = useChat((s) => s.busy);
  const ask = useRay();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [messages.length]);
  return (
    <div className="chat" aria-live="polite">
      {messages.map((m) => <Msg key={m.id} m={m} onAsk={ask} />)}
      {busy && <div className="msg-ray"><div className="ray-line"><span className="clover"><Clover /></span><b>Ray</b><span className="muted small">thinking…</span></div></div>}
      <div ref={end} />
    </div>
  );
}

export function Composer({ suggestions, placeholder = 'Ask Ray about offers, results or your plan…', onSubmit }: { suggestions?: string[]; placeholder?: string; onSubmit?: (q: string) => void }) {
  const ask = useRay();
  const [text, setText] = useState('');
  const go = (q: string) => (onSubmit ? onSubmit(q) : void ask(q));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    go(text.trim());
    setText('');
  };
  return (
    <div className="composer-wrap">
      {suggestions && <div className="chips">{suggestions.map((s) => <button key={s} className="chip" onClick={() => go(s)}>{s}</button>)}</div>}
      <form className="composer row-form" onSubmit={submit}>
        <input aria-label="Message Ray" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <ModeChip />
        <button className="send" aria-label="Send" type="submit"><Send /></button>
      </form>
    </div>
  );
}
