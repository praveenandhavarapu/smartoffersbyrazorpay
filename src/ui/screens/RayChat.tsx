import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useChat } from '../../ray/chatStore';
import { useRay } from '../../ray/useRay';
import { Clover } from '../components/Icons';
import { ChatThread, Composer, ModeToggle } from '../components/Chat';

const CHIPS: { label: string; message: string; hl?: boolean }[] = [
  { label: 'Payments', message: 'Show my payments for the last 7 days' },
  { label: 'Settlements', message: 'Show my settlements for the last 7 days' },
  { label: 'Offers & coupons', message: 'How are my offers and coupons doing?', hl: true },
  { label: 'Refunds & disputes', message: 'Show refunds and disputes for the last 30 days' },
  { label: 'Manage account', message: 'Manage account' },
  { label: 'Support', message: 'Support' },
];

export function RayChat() {
  const { model } = useModel();
  const ask = useRay();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const messages = useChat((s) => s.messages);
  const pending = useChat((s) => s.pending);
  const queue = useChat((s) => s.queue);
  const clear = useChat((s) => s.clear);
  const busy = useChat((s) => s.busy);

  useEffect(() => {
    const q = sp.get('ask');
    if (q) { setSp({}, { replace: true }); void ask(q); }
    else if (pending && !busy) { queue(null); void ask(pending); }
  }, [pending, sp, setSp, queue, ask, busy]);

  const empty = messages.length === 0;
  return (
    <div className={`ray-page ${empty ? 'empty' : ''}`}>
      <div className="ray-top">
        <span className="ray-title"><span className="clover"><Clover /></span>Ray AI</span>
        <ModeToggle />
        {!empty && <button className="btn secondary sm" onClick={clear}>New chat</button>}
      </div>
      {empty ? (
        <div className="ray-hero">
          <div className="hello"><span className="clover"><Clover /></span><div><h1>Hello, {model.profile.founderName}</h1><p>What would you like to know about {model.profile.displayName} today?</p></div></div>
          <Composer placeholder="Ask Ray anything about your business…" autoFocus />
          <div className="chips">
            {CHIPS.map((c) => <button key={c.label} className={`chip ${c.hl ? 'hl' : ''}`} onClick={() => void ask(c.message)}>{c.label}{c.hl && <b>New</b>}</button>)}
          </div>
          <div className="ray-sugg">
            {['What did I collect in the last 5 days?', 'When is my next settlement?', 'Where did ALPHA10 go last month?', 'Set up Smart Offers'].map((q) => <button key={q} className="sugg" onClick={() => void ask(q)}>{q} →</button>)}
          </div>
          <button className="btn ghost sm" onClick={() => nav('/studio/smart-offers')}>Smart Offers Agent in Agent Studio →</button>
        </div>
      ) : (
        <>
          <div className="ray-thread"><ChatThread /></div>
          <div className="ray-dock"><Composer /></div>
        </>
      )}
    </div>
  );
}
