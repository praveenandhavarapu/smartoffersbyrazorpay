import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useChat } from '../../ray/chatStore';
import { inr, num, pctOf, xr } from '../../lib/format';
import { fmtDate, BASELINE } from '../../lib/dates';
import { Clover } from '../components/Icons';
import { Composer } from '../components/Chat';
import { Kpi, shortGroup } from '../components/bits';

const COLORS: Record<string, string> = { new_ads_small: '#305EFF', new_ads_big: '#6F8CFF', new_organic: '#9DB2FF', lapsed: '#0E9F6E', returning: '#C9302C', new_creator: '#B54708' };

export function Home() {
  const { model, derived } = useModel();
  const nav = useNavigate();
  const queue = useChat((s) => s.queue);
  const [how, setHow] = useState(false);
  const a = derived.a10;
  const s = derived.store;
  const ask = (q: string) => { queue(q); nav('/ray'); };
  const returning = a.rows.find((r) => r.group === 'returning');

  return (
    <div className="home">
      <div className="hello">
        <span className="clover"><Clover /></span>
        <div><h1>Hello, {model.profile.founderName}</h1><p>What would you like to do for {model.profile.displayName} today?</p></div>
      </div>
      <Composer placeholder="Ask Ray anything about your business…" onSubmit={ask} />
      <div className="chips home-chips">
        {['Payments', 'Settlements'].map((c) => <span key={c} className="chip">{c}</span>)}
        <button className="chip hl" onClick={() => ask('Where did ALPHA10 go last month?')}>Offers &amp; coupons <b>New</b></button>
        {['Manage account', 'Support'].map((c) => <span key={c} className="chip">{c}</span>)}
      </div>

      <div className="label kpi-cap">Last month · {fmtDate(BASELINE.from, false)} – {fmtDate(BASELINE.to)}</div>
      <div className="kpis">
        <Kpi label="Sales collected" value={inr(s.gmv)} sub={`${num(s.orders)} orders · AOV ${inr(s.aov)}`} />
        <Kpi label="Checkout conversion" value={pctOf(s.conversion)} sub={`${num(s.orders)} orders from ${num(s.checkouts)} checkouts`} />
        <Kpi label="Discounts given" value={inr(s.discounts)} sub={`${pctOf(s.discountShare)} of sales`} tone="warn" />
      </div>

      <section className="insight" aria-labelledby="insight-h">
        <div className="insight-head"><span className="mono-tag amber">Ray insight</span><span className="muted small">{fmtDate(BASELINE.from, false)} – {fmtDate(BASELINE.to, false)}</span></div>
        <h2 id="insight-h">ALPHA10 lost you {inr(Math.abs(a.profit))} last month.</h2>
        <p>It cost {inr(a.spend)} and brought {inr(a.extraSales)} of extra sales: {xr(a.ret)} against a {xr(derived.breakEven)} break-even at your {num(derived.margin * 100)}% margin. {returning && `${pctOf(returning.spend / a.spend)} of it went to returning buyers who would have bought anyway.`}</p>
        <div className="stack" role="img" aria-label="Where ALPHA10 spend went, by shopper group">
          {a.rows.map((r) => <i key={r.group} style={{ width: `${(r.spend / a.spend) * 100}%`, background: COLORS[r.group] }} />)}
        </div>
        <div className="legend">
          {a.rows.map((r) => {
            const g = model.groups.find((x) => x.id === r.group)!;
            const bad = r.ret < derived.breakEven;
            return (
              <div key={r.group} style={{ borderColor: COLORS[r.group] }}>
                {shortGroup(g.label)}
                <b>{inr(r.spend)}</b>
                <span className={r.ret < 1 ? 'bad' : ''}>{xr(r.ret)} return{bad ? ' · below break-even' : ''}</span>
              </div>
            );
          })}
        </div>
        {how && (
          <div className="how-box">
            <p><b>How do you know?</b> ALPHA10 had no holdout, so these lifts are estimates: the typical result of offer tests at {num(model.pool.size)} similar fashion stores on a synthetic network of {num(model.pool.network)} (same price band, Instagram- and creator-led, Magic Checkout). Shoppers are grouped only by first order, days since last order, traffic source, creator code and cart value.</p>
            <p>Once live, a 10% holdout (sticky per customer, so nobody games it by waiting) measures your own store's numbers, and decisions shift from borrowed to your own results as data builds up. Real pilots also keep a 5% "old way" group; it's set to 0 here so the numbers match.</p>
          </div>
        )}
        <div className="insight-foot">
          <button className="btn secondary" onClick={() => setHow(!how)} aria-expanded={how}>{how ? 'Hide' : 'How do you know?'}</button>
          <span className="muted small">Estimates from similar stores until your holdout measures your own.</span>
          <button className="btn primary" onClick={() => nav('/ray')}>Fix with Smart Offers →</button>
        </div>
      </section>
    </div>
  );
}
