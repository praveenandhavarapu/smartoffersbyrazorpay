import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { useChat } from '../../ray/chatStore';
import { checkHealth } from '../../ray/liveClient';
import { INSTANT_FEE_RATE, FEE_RATE } from '../../data/generator/ledger';
import { CHECKOUT_BUDGET_MS } from '../../engine/guardrails';
import { num } from '../../lib/format';
import { fmtDate } from '../../lib/dates';
import { ModeToggle } from '../components/Chat';
import { MonoTag } from '../components/bits';
import { PageHeader } from '../components/kit';

export function Settings() {
  const { model } = useModel();
  const nav = useNavigate();
  const outage = useStore((s) => s.outage);
  const setOutage = useStore((s) => s.setOutage);
  const audit = useStore((s) => s.audit);
  const reset = useStore((s) => s.reset);
  const mode = useStore((s) => s.settlementMode);
  const setMode = useStore((s) => s.setSettlementMode);
  const health = useChat((s) => s.health);
  const setHealth = useChat((s) => s.setHealth);
  const p = model.profile;
  return (
    <div className="page">
      <PageHeader title="Account & Settings" />
      <div className="set-grid">
        <section className="card pad">
          <MonoTag>Business</MonoTag>
          <ul className="plain">
            <li><b>{p.legalName}</b> ({p.displayName})</li>
            <li>Account ID: <span className="mono">{p.merchantId}</span></li>
            <li>Shopify store with Magic Checkout · fashion apparel</li>
            <li>Platform fee: {(FEE_RATE * 100).toFixed(0)}% per payment + 18% GST on the fee</li>
          </ul>
        </section>

        <section className="card pad" id="ray">
          <MonoTag>Ray AI mode</MonoTag>
          <div className="row-gap"><ModeToggle /><button className="btn secondary sm" onClick={() => { setHealth({ state: 'checking' }); void checkHealth().then(setHealth); }}>Re-check</button></div>
          {health.state === 'ready' && <p className="small">Live mode is ready: Ray answers with Claude ({health.model}) and runs tools on your data in the browser. Privacy refusals and the setup form always run locally.</p>}
          {health.state === 'off' && <p className="small warn">{health.reason}</p>}
          <p className="small muted">The key is read only by the server function, never sent to the browser. Live answers use your Anthropic API credit.</p>
        </section>

        <section className="card pad" id="settlement">
          <MonoTag>Settlement schedule</MonoTag>
          <div className="radio-list">
            <label className={mode === 't1' ? 'on' : ''}><input type="radio" name="setl" checked={mode === 't1'} onChange={() => setMode('t1')} /><span><b>Standard · T+1</b><br /><span className="muted small">Each day's payments are paid out the next day at 10:00. No extra fee.</span></span></label>
            <label className={mode === 'instant' ? 'on' : ''}><input type="radio" name="setl" checked={mode === 'instant'} onChange={() => setMode('instant')} /><span><b>Instant · on demand</b><br /><span className="muted small">Settle today's balance any time from Settlements. {(INSTANT_FEE_RATE * 100).toFixed(2)}% fee per instant settlement (demo pricing); the rest still settles T+1.</span></span></label>
          </div>
          <button className="btn ghost sm" onClick={() => nav('/settlements')}>Go to Settlements →</button>
        </section>

        <section className="card pad">
          <MonoTag>Data sources</MonoTag>
          <ul className="plain">
            <li><b>Connected:</b> {model.source}</li>
            <li><b>Network:</b> {num(model.pool.network)} synthetic merchants ({num(model.pool.size)} in the similar-store pool; averages only)</li>
            <li><b>Razorpay adapter:</b> not connected (Orders, Payments, Settlements, Magic Checkout promotions; see README)</li>
          </ul>
        </section>

        <section className="card pad">
          <MonoTag tone="amber">Smart Offers fail-safe</MonoTag>
          <p className="small">The checkout lookup has a {CHECKOUT_BUDGET_MS} ms budget. On timeout or error the shopper sees the store's default checkout.</p>
          <label className="chk"><input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} /> Simulate engine outage (see Smart Offers → Checkout preview)</label>
        </section>

        <section className="card pad">
          <MonoTag>Demo</MonoTag>
          <p className="small">Reset returns to {fmtDate('2026-09-21')}, before approval, and clears settings, overrides, instant settlements and the audit log.</p>
          <button className="btn secondary sm" onClick={() => { if (confirm('Reset the demo?')) reset(); }}>Reset demo</button>
        </section>
      </div>

      <section className="card pad audit">
        <MonoTag>Audit log</MonoTag>
        {audit.length === 0 ? <p className="muted">No actions yet. Approvals, overrides, pauses, rule and schedule changes, instant settlements and the kill switch appear here.</p> : (
          <div className="tbl-wrap">
            <table className="dtable">
              <thead><tr><th>#</th><th>Demo date</th><th>Actor</th><th>Action</th><th>Before → after</th></tr></thead>
              <tbody>{[...audit].reverse().map((a) => <tr key={a.id}><td>{a.id}</td><td>{fmtDate(a.demoDate)}</td><td>{a.actor}</td><td>{a.summary}</td><td className="small">{a.before ?? '—'} → {a.after ?? '—'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
