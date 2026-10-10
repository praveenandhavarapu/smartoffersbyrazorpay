import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { DAILY_SPEND_CAP, MAX_DISCOUNT_PER_ORDER, CHECKOUT_BUDGET_MS, STEP_DOWN_DAYS, NEAR_BREAK_EVEN_BAND, BANNED_SIGNALS, ALLOWED_SIGNALS } from '../../engine/guardrails';
import { inr, num, xr } from '../../lib/format';
import { fmtDate } from '../../lib/dates';
import { MonoTag } from '../components/bits';

export function Settings() {
  const { model, derived } = useModel();
  const outage = useStore((s) => s.outage);
  const setOutage = useStore((s) => s.setOutage);
  const audit = useStore((s) => s.audit);
  const reset = useStore((s) => s.reset);
  const settings = useStore((s) => s.settings);
  const drop = model.profile.upcomingDrop;
  return (
    <div className="settings">
      <h2>Guardrails and data</h2>
      <div className="set-grid">
        <section className="card pad">
          <MonoTag>Data sources</MonoTag>
          <ul className="plain">
            <li><b>Connected:</b> {model.source}</li>
            <li><b>Network:</b> {num(model.pool.network)} synthetic merchants ({num(model.pool.size)} in {model.profile.displayName}'s similar pool)</li>
            <li><b>Razorpay adapter:</b> not connected <span className="muted small">(Orders, Payments, Magic Checkout promotions; see README)</span></li>
          </ul>
          <p className="small muted">Peer data is only ever shown as averages from 20+ stores, with no store above 25% of the sample. Names and single-store values never leave the network module.</p>
        </section>
        <section className="card pad">
          <MonoTag>Guardrails</MonoTag>
          <ul className="plain">
            <li>Max discount per order: <b>{inr(MAX_DISCOUNT_PER_ORDER)}</b> · one offer per order (typed codes replace Smart Offers)</li>
            <li>Daily spend cap: <b>{inr(DAILY_SPEND_CAP)}</b> · monthly budget hard stop: <b>{inr(settings.budget)}</b></li>
            <li>Return floor: <b>break-even {xr(derived.breakEven)}</b> · near break-even watch ±{NEAR_BREAK_EVEN_BAND}x · step down after {STEP_DOWN_DAYS} days below</li>
            <li>Holdout: <b>{model.profile.holdoutPct}%</b> of shoppers, sticky per customer (hash of customer id)</li>
            <li>No-offer window: {drop.name}, {drop.styles} styles, from {fmtDate(drop.launch)} for {drop.fullPriceDays} days {settings.festiveWindow ? '' : '(off)'}</li>
            <li>Allowed signals: {ALLOWED_SIGNALS.join(', ').replace(/_/g, ' ')}</li>
            <li>Banned signals: {BANNED_SIGNALS.slice(0, 5).join(', ')} and other personal traits</li>
          </ul>
          <p className="small muted">Fairness: shoppers in the same group always see the same offer. A time-window rotation (offers on alternate days) is an option for stores that want to test without a holdout.</p>
        </section>
        <section className="card pad">
          <MonoTag tone="amber">Fail-safe</MonoTag>
          <p>The checkout lookup has a {CHECKOUT_BUDGET_MS} ms budget. On timeout or error the shopper sees the store's default checkout.</p>
          <label className="chk"><input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} /> Simulate engine outage (see Checkout)</label>
        </section>
        <section className="card pad">
          <MonoTag>Demo</MonoTag>
          <p>Reset returns to {fmtDate('2026-09-21')}, before approval, and clears overrides and the audit log.</p>
          <button className="btn secondary" onClick={() => { if (confirm('Reset the demo?')) reset(); }}>Reset demo</button>
        </section>
      </div>
      <section className="card pad audit">
        <MonoTag>Audit log</MonoTag>
        {audit.length === 0 ? <p className="muted">No actions yet. Approvals, overrides, pauses, rule changes and the kill switch appear here with who and when.</p> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>#</th><th>Demo date</th><th>Actor</th><th>Action</th><th>Before → after</th></tr></thead>
              <tbody>
                {[...audit].reverse().map((a) => (
                  <tr key={a.id}><td>{a.id}</td><td>{fmtDate(a.demoDate)}<span className="sub">{new Date(a.at).toLocaleTimeString()}</span></td><td>{a.actor}</td><td>{a.summary}</td><td className="small">{a.before ?? '—'} → {a.after ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
