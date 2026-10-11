import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { inr, inrSigned, xr } from '../../lib/format';
import { FEATURES } from '../../config/features';

const OTHER_AGENTS = [
  { name: 'Cart Abandonment', desc: 'Recovers dropped checkouts with reminders.', tag: 'Existing agent' },
  { name: 'Dispute Responder', desc: 'Drafts chargeback replies with evidence.', tag: 'Existing agent' },
  { name: 'Subscription Recovery', desc: 'Retries failed renewals at the right time.', tag: 'Existing agent' },
];

export function Studio() {
  const { derived } = useModel();
  const nav = useNavigate();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  return (
    <div className="studio">
      <div className="st-nav"><span className="st-brand">Agent Studio</span><span className="lnk"><span className="on">Agents</span></span><span className="mono-tag">concept</span></div>
      <section className="st-sec">
        <div className="st-label"><i />Your agents</div>
        <h3>Agents that work on your payments</h3>
        <div className="agent-grid">
          <button className="fcard agent me" onClick={() => nav('/studio/smart-offers')}>
            <div className="t"><span>Smart Offers Agent</span><b>{approved ? (killed ? 'paused' : 'running daily') : 'not installed'}</b></div>
            <div className="m"><strong>Pay for the sale, not the coupon.</strong> Picks an offer, or none, per shopper group within your budget; proves it with a holdout.</div>
            <div className="m small-m">{approved ? (FEATURES.netReturns ? (() => { const t = derived.snapshots[derived.today ?? 'day20']; return `Day ${t.days}: ${inrSigned(t.profit)} after returns · ${xr(t.ret)} · ${inr(derived.live.spend)}/mo budget use`; })() : `Day 20: ${inrSigned(derived.snapshots.day20.profit)} · ${xr(derived.snapshots.day20.ret)} · ${inr(derived.live.spend)}/mo budget use`) : `Last month ALPHA10 returned ${xr(derived.a10.ret)}${FEATURES.netReturns ? ' after returns' : ''}.`}</div>
            <span className="btn primary sm">{approved ? 'Open agent' : 'Install'}</span>
          </button>
          {OTHER_AGENTS.map((a) => (
            <div key={a.name} className="fcard agent dim">
              <div className="t"><span>{a.name}</span><b>{a.tag}</b></div>
              <div className="m">{a.desc}</div>
              <div className="m small-m">Shown for context; not part of this concept.</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
