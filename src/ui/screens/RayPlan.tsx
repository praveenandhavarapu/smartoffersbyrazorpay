import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { useChat } from '../../ray/chatStore';
import { useRay } from '../../ray/useRay';
import { inr, xr } from '../../lib/format';
import { fmtDate } from '../../lib/dates';
import { Check, Clover } from '../components/Icons';
import { ChatThread, Composer } from '../components/Chat';
import { PlanCard } from '../components/PlanCard';
import { SetupCard } from '../components/SetupCard';

export const MERCHANT_SENTENCE = "I can spend ₹1 lakh a month on offers. I keep about ₹400 from a ₹1,000 sale. I want the most profit, and no offers on the festive drop.";

export function RayPlan() {
  const { derived } = useModel();
  const nav = useNavigate();
  const approved = useStore((s) => s.approved);
  const moment = useStore((s) => s.moment);
  const jump20 = useStore((s) => s.jump20);
  const pending = useChat((s) => s.pending);
  const queue = useChat((s) => s.queue);
  const ask = useRay();
  const live = derived.live;
  const liveOffers = live.rows.filter((r) => r.offer !== 'none').length;

  useEffect(() => {
    if (pending) { queue(null); void ask(pending); }
  }, [pending, queue, ask]);

  return (
    <div className="thread">
      <div className="msg-ray">
        <div className="ray-line"><span className="clover"><Clover /></span><b>Ray</b></div>
        <h3>Let's replace ALPHA10 with offers that pay back.</h3>
        <p>ALPHA10 returned {xr(derived.a10.ret)} last month against a {xr(derived.breakEven)} break-even. Tell me your budget, what you keep from a sale, your goal and any rules, or edit the setup card. I'll pick an offer, or none, for each shopper group.</p>
      </div>
      <SetupCard />
      <div className="msg-ray">
        <div className="ray-line"><span className="clover"><Clover /></span><b>Ray</b><span className="muted small">uses the engine; every number below is computed</span></div>
        <PlanCard onAsk={(q) => void ask(q)} />
      </div>

      {approved && (
        <div className="msg-ray approved-msg">
          <div className="ray-line"><span className="clover"><Clover /></span><b>Ray</b><span className="pill live"><i />Live</span></div>
          <div className="done-card">
            <div><Check /> ALPHA10 retired on {fmtDate('2026-09-21')}</div>
            <div><Check /> {liveOffers} group offers live on Magic Checkout ({inr(live.spend)} of {inr(live.settings.budget)} budget)</div>
            <div><Check /> 10% holdout sees no offer, so results are measured, not guessed</div>
            <div><Check /> Weekly summary every Monday on WhatsApp</div>
          </div>
          {moment === 'before' ? (
            <button className="btn primary jump" onClick={() => { jump20(); nav('/results'); }}>Jump 20 days → results</button>
          ) : (
            <button className="btn secondary jump" onClick={() => nav('/results')}>Open results (day 20)</button>
          )}
        </div>
      )}

      <ChatThread />
      <div className="dock-static">
        <Composer suggestions={['I want 4x return', 'What if my margin is 30%?', 'Give returning customers ₹100 off', 'How much will I make next month exactly?']} />
        {useChat.getState().messages.length === 0 && <button className="btn ghost small-btn" onClick={() => void ask(MERCHANT_SENTENCE)}>Type the merchant's sentence for me</button>}
      </div>
    </div>
  );
}
