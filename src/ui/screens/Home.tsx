import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { useLedger } from '../../state/useLedger';
import { DataEndNote } from '../components/lifecycle';
import { useChat } from '../../ray/chatStore';
import { lastDays, monthly, paymentSummary, settlementSummary } from '../../data/ledgerQueries';
import { dateTimeIST, inr, inrP, inrP2, inrSigned, num, pctOf, xr } from '../../lib/format';
import { Clover } from '../components/Icons';
import { MethodMix, MonthlyBars } from '../components/charts';
import { Stat, Status } from '../components/kit';

export function Home() {
  const { model, derived } = useModel();
  const nav = useNavigate();
  const v = useLedger();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const moment = useStore((s) => s.moment);
  const queue = useChat((s) => s.queue);
  const r30 = lastDays(v, 30);
  const s30 = paymentSummary(v, r30);
  const st = settlementSummary(v, lastDays(v, 30));
  const months = monthly(v);
  const recent = v.payments.slice(-6).reverse();
  const ask = (q: string) => { queue(q); nav('/ray'); };
  const lastMonthKey = months[months.length - 1]?.month;

  return (
    <div className="page">
      <div className="hello-row">
        <div><h1>Hello, {model.profile.founderName}</h1><p className="muted">{model.profile.legalName} · payments overview</p></div>
        <button className="btn secondary" onClick={() => nav('/ray')}><Clover width={14} style={{ color: 'var(--clover)' }} /> Ask Ray</button>
      </div>

      <DataEndNote />
      <section className="ray-banner" aria-label="Ray insight">
        <div className="rb-ic"><Clover /></div>
        <div className="rb-body">
          {approved && moment === 'day30' && !killed ? (
            <>
              <b>Your free pilot ended. Keep Smart Offers?</b>
              <span> Expected {inrSigned(derived.pilot.expectedProfitMonth)} a month; fee about {inr(derived.pilot.fee.fee)}, only on proven extra sales.</span>
            </>
          ) : approved ? (
            <>
              <b>Smart Offers is {killed ? 'paused' : 'live'}.</b>
              <span> Day 20: {inrSigned(derived.snapshots.day20.profit)} extra profit vs the holdout, return {xr(derived.snapshots.day20.ret)}. ALPHA10 would have lost {inr(Math.abs(derived.snapshots.day20.alpha10SamePeriod))} in the same period.</span>
            </>
          ) : (
            <>
              <b>ALPHA10 lost you {inr(Math.abs(derived.a10.profit))} last month.</b>
              <span> It cost {inr(derived.a10.spend)} for {xr(derived.a10.ret)} back, below your {xr(derived.breakEven)} break-even. {pctOf((derived.a10.rows.find((r) => r.group === 'returning')?.spend ?? 0) / derived.a10.spend, 0)} went to returning buyers who'd buy anyway.</span>
            </>
          )}
        </div>
        <div className="rb-actions">
          {approved && moment === 'day30' && !killed ? <button className="btn primary sm" onClick={() => nav('/offers/smart')}>Decide</button> : approved ? <button className="btn primary sm" onClick={() => nav('/offers/smart')}>View results</button> : <button className="btn primary sm" onClick={() => ask('How are my offers and coupons doing?')}>Ask Ray why</button>}
          <button className="btn secondary sm" onClick={() => nav(approved ? '/studio/smart-offers?tab=reviews' : '/offers/smart')}>{approved ? 'Weekly review' : 'Fix with Smart Offers'}</button>
        </div>
      </section>

      <div className="stats4">
        <Stat label="Collected · last 30 days" value={inrP(s30.collected)} sub={`from ${num(s30.capturedCount)} captured payments`} onClick={() => nav('/transactions?d=30')} />
        <Stat label="Success rate" value={pctOf(s30.successRate)} sub={`${num(s30.failedCount)} failed payments`} onClick={() => nav('/transactions?d=30&status=failed')} />
        <Stat label="Refunds · last 30 days" value={inrP(s30.refunded)} sub={`${num(s30.refundsCount)} processed`} onClick={() => nav('/transactions?tab=refunds')} />
        <Stat label="Next settlement" value={st.next ? inrP(st.next.amount) : '—'} sub={st.next ? `${dateTimeIST(st.next.created_at)} · T+1` : 'nothing scheduled'} onClick={() => nav('/settlements')} />
      </div>

      <div className="grid2">
        <section className="card pad">
          <div className="sec-h"><h3>Collected per month</h3><span className="muted small">online payments, last 6 months · * part month</span></div>
          <MonthlyBars data={months} partial={[months[0]?.month ?? '', lastMonthKey ?? '']} />
        </section>
        <section className="card pad">
          <div className="sec-h"><h3>Payment methods · last 30 days</h3></div>
          <MethodMix mix={s30.byMethod} />
          <div className="mini-kv">
            <div><span>Fees (2%)</span><b>{inrP(s30.fees)}</b></div>
            <div><span>GST on fees</span><b>{inrP(s30.tax)}</b></div>
            <div><span>Settled · 30 days</span><b>{inrP(st.amount)}</b></div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="sec-h pad-x"><h3>Recent payments</h3><button className="btn ghost sm" onClick={() => nav('/transactions')}>View all →</button></div>
        <div className="tbl-wrap">
          <table className="dtable">
            <thead><tr><th>Payment ID</th><th>Amount</th><th>Method</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="row-link" onClick={() => nav(`/transactions?q=${p.id}`)}>
                  <td className="mono">{p.id}{p.offer_id && <span className="tag-so">Smart Offer</span>}</td><td>{inrP2(p.amount)}</td><td>{p.method}</td><td>{dateTimeIST(p.created_at)}</td><td><Status s={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
