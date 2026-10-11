/** Cards Ray shows inside the conversation. Every number comes from a tool result or the engine. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import type { tools } from '../../ray/tools';
import { inr, inrSigned, num, pctOf, xr } from '../../lib/format';
import { fmtDate } from '../../lib/dates';
import { Check } from './Icons';
import { DailyBars, MethodMix } from './charts';
import { Status } from './kit';
import { shortGroup } from './bits';
import { FEATURES } from '../../config/features';
import { RETURN_LABEL } from '../../engine/net';

const COLORS: Record<string, string> = { new_ads_small: '#2a78d6', new_ads_big: '#86b6ef', new_organic: '#1baf7a', lapsed: '#eda100', returning: '#eb6834', new_creator: '#e87ba4' };

/** "ALPHA10 lost you ₹X last month" (engine value) with where the money went, by group. */
export function WasteCard({ onFix }: { onFix: () => void }) {
  const { model, derived } = useModel();
  const [how, setHow] = useState(false);
  const a = derived.a10;
  return (
    <div className="rcard insight">
      <h3>ALPHA10 lost you {inr(Math.abs(a.profit))} last month.</h3>
      <p>It cost {inr(a.spend)} and brought {inr(a.extraSales)} of extra sales: {xr(a.ret)}{FEATURES.netReturns ? ' after returns' : ''} against a {xr(derived.breakEven)} break-even at your {num(derived.margin * 100)}% margin.</p>
      <div className="stack" role="img" aria-label="Where ALPHA10 spend went, by shopper group">
        {a.rows.map((r) => <i key={r.group} style={{ width: `${(r.spend / a.spend) * 100}%`, background: COLORS[r.group] }} />)}
      </div>
      <div className="legend">
        {a.rows.map((r) => (
          <div key={r.group} style={{ borderColor: COLORS[r.group] }}>
            {shortGroup(model.groups.find((g) => g.id === r.group)!.label)}
            <b>{inr(r.spend)}</b>
            <span className={r.ret < 1 ? 'bad' : ''}>{xr(r.ret)} return{r.ret < derived.breakEven ? ' · below break-even' : ''}</span>
          </div>
        ))}
      </div>
      {how && <p className="how-box">These are estimates: ALPHA10 had no holdout, so lifts come from offer tests at {num(model.pool.size)} similar fashion stores (aggregates only). Once Smart Offers runs, a 10% holdout measures your own numbers.</p>}
      <div className="btns">
        <button className="btn secondary sm" onClick={() => setHow(!how)} aria-expanded={how}>{how ? 'Hide' : 'How do you know?'}</button>
        <button className="btn primary sm" onClick={onFix}>Fix with Smart Offers</button>
      </div>
    </div>
  );
}

export function PaymentsCard({ d }: { d: ReturnType<typeof tools.get_payments_summary> }) {
  const nav = useNavigate();
  const mix = Object.fromEntries(Object.entries(d.method_mix).map(([k, v]) => [k, { count: v.count, amount: v.amount }]));
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag">Payments · {d.window}</span><button className="btn ghost sm" onClick={() => nav(`/transactions?d=${d.days > 90 ? 183 : d.days > 30 ? 90 : d.days > 7 ? 30 : d.days > 1 ? 7 : 1}`)}>Open transactions →</button></div>
      <div className="rc-grid">
        <div><span>Collected</span><b>{inr(d.collected)}</b></div>
        <div><span>Payments</span><b>{num(d.captured_payments)}</b></div>
        <div><span>Success rate</span><b>{num(d.success_rate_pct, 1)}%</b></div>
        <div><span>Refunded</span><b>{inr(d.refunded)}</b></div>
      </div>
      <MethodMix mix={mix} />
    </div>
  );
}

export function DailyCard({ d }: { d: ReturnType<typeof tools.get_daily_payments> }) {
  const nav = useNavigate();
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag">Collected per day · {d.window}</span><button className="btn ghost sm" onClick={() => nav(`/transactions?d=${d.days > 30 ? 90 : d.days > 7 ? 30 : 7}`)}>Open transactions →</button></div>
      <DailyBars data={d.daily} />
      <div className="rc-grid">
        <div><span>Total</span><b>{inr(d.total_collected)}</b></div>
        <div><span>Average / day</span><b>{inr(d.average_per_day)}</b></div>
        <div><span>Best day</span><b>{inr(d.best_day.collected)}</b><em>{d.best_day.date}</em></div>
        <div><span>Lowest day</span><b>{inr(d.lowest_day.collected)}</b><em>{d.lowest_day.date}</em></div>
      </div>
    </div>
  );
}

export function PaymentsListCard({ title, d }: { title: string; d: ReturnType<typeof tools.list_payments> }) {
  const nav = useNavigate();
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag">{title}</span></div>
      <div className="rc-list">
        {d.payments.map((p) => (
          <button key={p.id} className="rc-row" onClick={() => nav(`/transactions?q=${p.id}`)}>
            <span className="mono">{p.id}</span><span>{inr(p.amount)}</span><span>{p.method}</span><Status s={p.status} />
            {p.error && <span className="small muted rc-err">{p.error}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettlementsCard({ d }: { d: ReturnType<typeof tools.get_settlements> }) {
  const nav = useNavigate();
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag">Settlements · {d.window}</span><button className="btn ghost sm" onClick={() => nav('/settlements')}>Open settlements →</button></div>
      <div className="rc-grid">
        <div><span>Settled</span><b>{inr(d.settled_amount)}</b></div>
        <div><span>Settlements</span><b>{num(d.settled_count)}</b></div>
        <div><span>Fees + GST</span><b>{inr(d.fees_and_gst)}</b></div>
        <div><span>Next</span><b>{d.next_scheduled ? inr(d.next_scheduled.amount) : '—'}</b></div>
      </div>
      <div className="rc-list">
        {d.settlements.slice(0, 5).map((x) => <div key={x.id} className="rc-row static"><span>{x.date}</span><span>{inr(x.amount)}</span><span>{x.type === 'instant' ? 'Instant' : 'T+1'}</span><Status s={x.status} /></div>)}
      </div>
    </div>
  );
}

export function RefundsCard({ d }: { d: ReturnType<typeof tools.get_refunds_and_disputes> }) {
  const nav = useNavigate();
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag">Refunds &amp; disputes · {d.window}</span><button className="btn ghost sm" onClick={() => nav('/transactions?tab=refunds')}>Open →</button></div>
      <div className="rc-grid">
        <div><span>Refunds</span><b>{num(d.refunds)}</b></div>
        <div><span>Refunded</span><b>{inr(d.refunded)}</b></div>
        <div><span>Open disputes</span><b>{num(d.open_disputes)}</b></div>
      </div>
      <div className="rc-list">{d.disputes_all_time.map((x) => <div key={x.id} className="rc-row static"><span>{x.opened}</span><span>{inr(x.amount)}</span><span>{x.reason.replace(/_/g, ' ')}</span><Status s={x.status} /></div>)}</div>
    </div>
  );
}

export function ResultsCard({ d }: { d: ReturnType<typeof tools.get_results> }) {
  const nav = useNavigate();
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag green">Smart Offers · day {d.days}</span><button className="btn ghost sm" onClick={() => nav('/offers/smart')}>Full results →</button></div>
      <div className="rc-grid">
        <div><span>Extra orders</span><b>{num(d.extra_orders)}</b><em>range {num(d.extra_orders_range[0])}–{num(d.extra_orders_range[1])}</em></div>
        <div><span>{RETURN_LABEL}</span><b>{xr(d.return_x)}</b><em>{xr(d.return_range[0])}–{xr(d.return_range[1])}</em></div>
        <div><span>Extra profit</span><b>{inrSigned(d.profit)}</b></div>
        <div><span>Offer spend</span><b>{inr(d.spend)}</b></div>
      </div>
    </div>
  );
}

export function CreatorsCard() {
  const { derived } = useModel();
  const c = derived.creators;
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag amber">Creator codes</span></div>
      <div className="rc-list">{c.rows.filter((r) => r.flag || r.uses > 40).map((r) => <div key={r.code} className="rc-row static"><b>{r.code}</b><span>{r.uses} uses</span><span>{pctOf(r.returningSharePct / 100, 0)} returning</span>{r.flag ? <span className="status bad">leaking</span> : <span className="status ok">ok</span>}</div>)}</div>
      <p className="small">First-order-only fix: about {inr(c.firstOrderOnlyNetGain)} a month net. A suggestion; you can keep codes as they are.</p>
    </div>
  );
}

/** Shown under the plan once approved. */
export function ApprovedCard() {
  const { derived } = useModel();
  const moment = useStore((s) => s.moment);
  const jump20 = useStore((s) => s.jump20);
  const nav = useNavigate();
  const live = derived.live;
  return (
    <div className="rcard ok-card">
      <div className="done-card">
        <div><Check /> ALPHA10 retired on {fmtDate('2026-09-21')}</div>
        <div><Check /> {live.rows.filter((r) => r.offer !== 'none').length} group offers live on Magic Checkout ({inr(live.spend)} of {inr(live.settings.budget)} a month)</div>
        <div><Check /> Smart Offers Agent runs every day at 06:00 within your budget</div>
        <div><Check /> 10% holdout sees no offer, so results are measured, not guessed</div>
      </div>
      {moment === 'before'
        ? <button className="btn primary" onClick={() => { jump20(); nav('/offers/smart'); }}>Jump 20 days → results</button>
        : <button className="btn secondary" onClick={() => nav('/offers/smart')}>Open results (day {derived.nowDay || 20})</button>}
    </div>
  );
}

/** Compact impact summary for the chat; full view is Agent Studio → Impact. */
export function ImpactMini() {
  const { derived } = useModel();
  const nav = useNavigate();
  const approved = useStore((s) => s.approved);
  const moment = useStore((s) => s.moment);
  const snap = FEATURES.netReturns ? derived.snapshots[derived.today ?? 'day20'] : moment === 'day30' ? derived.snapshots.day30 : derived.snapshots.day20;
  const live = approved && moment !== 'before';
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag green">Impact</span><button className="btn ghost sm" onClick={() => nav('/studio/smart-offers?tab=impact')}>Full metrics →</button></div>
      <div className="rc-grid">
        <div><span>North star: extra profit{FEATURES.netReturns ? ' after returns' : ''}</span><b>{inrSigned(live ? (snap.profit * 30) / snap.days : FEATURES.netReturns ? derived.live.profit : derived.draft.profit)}</b><em>{live ? 'a month, vs holdout' : 'a month, planned'}</em></div>
        <div><span>{RETURN_LABEL}</span><b>{xr(live ? snap.ret : FEATURES.netReturns ? derived.live.ret : derived.draft.ret)}</b><em>break-even {xr(derived.breakEven)}</em></div>
        <div><span>Extra orders</span><b>{live ? num((snap.extraOrders * 30) / snap.days) : num(FEATURES.netReturns ? derived.live.extraOrders : derived.draft.extraOrders)}</b><em>a month</em></div>
        <div><span>Budget</span><b>{inr(derived.live.settings.budget)}</b><em>hard stop</em></div>
      </div>
    </div>
  );
}
