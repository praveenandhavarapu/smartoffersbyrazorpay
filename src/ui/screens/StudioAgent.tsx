import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { useLedger } from '../../state/useLedger';
import { dailyRuns } from '../../engine/runs';
import { DAILY_SPEND_CAP, MAX_DISCOUNT_PER_ORDER, STEP_DOWN_DAYS, CHECKOUT_BUDGET_MS, BANNED_SIGNALS } from '../../engine/guardrails';
import { OFFER_BY_ID, PILOT_TRUTH } from '../../data/fixtures';
import { DEMO_DATES, fmtDate } from '../../lib/dates';
import { dateTimeIST, inr, inrP2, inrSigned, num, xr } from '../../lib/format';
import { Check, X } from '../components/Icons';
import { Pager, Status, Tabs } from '../components/kit';
import { ExperimentsList, ReviewsList, StopButton, WhyAI } from '../components/lifecycle';
import { ImpactView } from '../components/Impact';
import { OfferChip, shortGroup } from '../components/bits';
import type { GroupId } from '../../data/types';
import { FEATURES } from '../../config/features';
import { humanise } from '../../lib/labels';
import { AI_NIGHTLY, HowAIWorks } from '../components/HowAIWorks';

type Tab = 'overview' | 'reviews' | 'impact' | 'runs' | 'transactions' | 'guardrails' | 'activity';
const CAN = ['Read checkout, order and coupon data', 'Run approved offers within budget', 'Simulate plans and scenarios', 'Pause offers that fall below break-even'];
const CANNOT = ['Change product prices', 'Exceed the monthly budget', 'Launch without your approval', 'Message shoppers', 'Use device, gender or income'];
const PAGE = 25;

export function StudioAgent() {
  const { model, derived } = useModel();
  const nav = useNavigate();
  const v = useLedger();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) ?? 'overview';
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const moment = useStore((s) => s.moment);
  const kill = useStore((s) => s.kill);
  const resume = useStore((s) => s.resume);
  const audit = useStore((s) => s.audit);
  // Live surfaces read the approved settings (v2 §3.3); the edit buffer is only for Setup & plan.
  const draftBuffer = useStore((s) => s.settings);
  const settings = FEATURES.netReturns ? derived.liveSettings : draftBuffer;
  const [group, setGroup] = useState<'all' | GroupId>('all');
  const [page, setPage] = useState(0);
  const live = approved && moment !== 'before';
  const runs = useMemo(() => (live ? dailyRuns(model.pilotSessions, PILOT_TRUTH.planOffers, derived.live.settings.budget, PILOT_TRUTH.alpha10RetiredOn, DEMO_DATES.day20, killed ? DEMO_DATES.day20 : undefined).reverse() : []), [live, model, derived, killed]);
  const orderById = useMemo(() => new Map(v.orders.map((o) => [o.id, o])), [v]);
  const pilotOrders = useMemo(() => v.orders.filter((o) => o.notes.arm && o.notes.arm !== 'pre_pilot' && (group === 'all' || o.notes.group_id === group)).reverse(), [v, group]);
  const payByOrder = useMemo(() => new Map(v.payments.filter((p) => p.captured || p.status === 'refunded').map((p) => [p.order_id, p])), [v]);
  const d20 = FEATURES.netReturns ? derived.snapshots[derived.today ?? 'day20'] : derived.snapshots.day20;
  const status = !approved ? 'Not installed' : killed ? 'Paused (kill switch)' : moment === 'before' ? 'Approved · first run 06:00' : 'Running daily · 06:00';
  const label = (g: string) => shortGroup(model.groups.find((x) => x.id === g)!.label);
  const decisions = useStore((x) => x.reviewDecisions);
  const pendingReviews = derived.reviews.reduce((a, r) => a + r.items.filter((i) => i.action && !decisions[i.id]).length, 0);

  return (
    <div className="studio">
      <div className="st-nav">
        <button className="st-back" onClick={() => nav('/studio')}>← Agent Studio</button>
        <span className="st-brand">Smart Offers Agent</span>
        <span className={`st-status ${approved && !killed ? 'on' : ''}`}>{status}</span>
        <span className="sp" />
        {!approved ? <button className="btn primary sm" onClick={() => nav('/offers/smart?tab=plan')}>Install &amp; set up</button>
          : killed ? <button className="btn primary sm" onClick={resume}>Resume</button>
          : <><StopButton className="btn dark sm" label="Stop…" /><button className="btn dark sm" onClick={kill}>Kill switch</button></>}
      </div>
      <div className="st-tabs"><Tabs<Tab> value={tab} onChange={(t) => setSp({ tab: t })} items={[{ id: 'overview', label: 'Overview' }, { id: 'reviews', label: <>Weekly reviews{pendingReviews > 0 && <span className="tab-n">{pendingReviews}</span>}</> }, { id: 'impact', label: 'Impact' }, { id: 'runs', label: 'Runs' }, { id: 'transactions', label: 'Transactions' }, { id: 'guardrails', label: 'Guardrails' }, { id: 'activity', label: 'Activity log' }]} /></div>

      {tab === 'overview' && (
        <>
          <div className="st-hero">
            <div>
              <div className="st-label"><i />Smart Offers Agent</div>
              <h1>Pay for the sale, <em>not the coupon.</em></h1>
              <p>Every day at 06:00 it checks yesterday's checkouts, keeps spend within your {inr(settings.budget)} monthly budget, and publishes which shopper groups get which offer, or none. A 10% holdout proves what offers add.</p>
              <div className="btns">
                <button className="btn primary" onClick={() => nav(approved ? '/offers/smart' : '/offers/smart?tab=plan')}>{approved ? 'Open results' : 'Set up plan'}</button>
                <button className="btn dark" onClick={() => setSp({ tab: 'runs' })}>Daily runs</button>
              </div>
            </div>
            <div className="feed" aria-label="Live feed">
              <div className="fcard"><div className="t"><span>Plan</span><b>{approved ? (killed ? 'paused' : 'live') : 'draft'}</b></div><div className="m"><strong>{derived.live.rows.filter((r) => r.offer !== 'none').length} group offers</strong> · {inr(derived.live.spend)} of {inr(derived.live.settings.budget)} · {xr(derived.live.ret)}{FEATURES.netReturns ? ' after returns' : ''}</div></div>
              {live && runs[0] && <div className="fcard"><div className="t"><span>Last run · {fmtDate(runs[0].date, false)} 06:00</span><b>{runs[0].status}</b></div><div className="m">{runs[0].action}. Spend so far {inr(runs[0].cumulativeSpend)} vs pace {inr(runs[0].pace)}.</div></div>}
              {live && <div className="fcard"><div className="t"><span>Proof · day {d20.days}</span><b>{d20.retLow < derived.breakEven ? 'learning' : 'proven'}</b></div><div className="m">{num(d20.extraOrders, FEATURES.netReturns ? 0 : 1)} extra orders (range {num(d20.extraOrdersLow)}–{num(d20.extraOrdersHigh)}) · {inrSigned(d20.profit)}{FEATURES.netReturns ? ' after returns' : ''}</div></div>}
              <div className="fcard dim"><div className="t"><span>Next run</span><b>scheduled</b></div><div className="m">{approved ? `${fmtDate(moment === 'before' ? DEMO_DATES.before : '2026-10-11', false)} 06:00 IST` : 'After you approve a plan'}</div></div>
            </div>
          </div>
          <section className="st-sec">
            <div className="st-label">How it works</div>
            <h3>Find, decide, prove</h3>
            <div className="how">
              <div className="fcard"><div className="n">01</div><h6>Find</h6><p>Reads coupons and checkouts; shows where discounts went to buyers who'd buy anyway (ALPHA10: {xr(derived.a10.ret)}).</p></div>
              <div className="fcard"><div className="n">02</div><h6>Decide</h6><p>Per shopper group, the approved offer with the most profit above break-even, or none, within budget. {FEATURES.heroMetric ? AI_NIGHTLY : 'No AI at checkout: a precomputed table.'}</p></div>
              <div className="fcard"><div className="n">03</div><h6>Prove</h6><p>A 10% holdout sees no offer. Results show measured lift with 90% ranges and "still learning" until the data is clear.</p></div>
            </div>
            {FEATURES.heroMetric && <><div className="st-label ai-sub">The AI behind it</div><HowAIWorks /></>}
          </section>
          <section className="st-sec">
            <div className="st-label">Permissions</div>
            <h3>What the agent can and cannot do</h3>
            <div className="perm">
              {CAN.map((c) => <div key={c} className="y"><Check />{c}</div>)}
              {CANNOT.map((c) => <div key={c} className="n2"><X />Cannot: {c.toLowerCase()}</div>)}
            </div>
          </section>
          <section className="st-sec st-light">
            <div className="st-label">Why AI</div>
            <h3>What it does that a fixed rule can't</h3>
            <WhyAI />
          </section>
          <section className="st-sec st-light">
            <div className="st-label">Grow</div>
            <h3>Next experiments (each needs your approval)</h3>
            <ExperimentsList />
          </section>
          <section className="st-sec">
            <div className="pricebar">
              <div><b>Free 30-day pilot</b><span>Then 1% of proven extra sales, capped at 20% of extra profit. Proven = lower bound of the 90% range.</span></div>
              <span className="mono-tag">Day {d20.days} example: {inr(d20.fee.fee)}</span>
            </div>
          </section>
        </>
      )}

      {tab === 'reviews' && (
        <section className="st-sec st-light">
          <h3>Weekly reviews</h3>
          <p className="st-p">Every Monday at 06:00 Ray reads what the holdout measured, re-plans with it, and lists what to keep, watch or change. Changes need your approval.</p>
          <ReviewsList />
        </section>
      )}

      {tab === 'impact' && (
        <section className="st-sec st-light">
          <h3>Impact</h3>
          <p className="st-p">How we know Smart Offers works: one north-star metric, the outcomes behind it, and the guardrails that must not get worse.</p>
          <ImpactView />
        </section>
      )}

      {tab === 'runs' && (
        <section className="st-sec">
          <h3>Daily runs</h3>
          <p className="st-p">Runs every day at 06:00 IST. Daily budget pace: {inr(derived.live.settings.budget / 30)} · daily cap {inr(DAILY_SPEND_CAP)}.</p>
          {!live ? <div className="fcard"><div className="m">No runs yet. {approved ? 'The first run is at 06:00 after go-live.' : 'Install the agent by approving a plan.'}</div></div> : (
            <div className="tbl-wrap st-table">
              <table className="dtable dark">
                <thead><tr><th>Run</th><th>Data day</th><th>Checkouts</th><th>Orders with offer</th><th>Holdout</th><th>Spend</th><th>Spend vs pace</th><th>Action</th></tr></thead>
                <tbody>{runs.map((r) => (
                  <tr key={r.date}><td>{fmtDate(r.date, false)} 06:00</td><td>{r.dataDay ? fmtDate(r.dataDay, false) : '—'}</td><td>{num(r.checkouts)}</td><td>{num(r.offerOrders)}</td><td>{num(r.holdoutCheckouts)}</td><td>{inr(r.spend)}</td><td>{inr(r.cumulativeSpend)} / {inr(r.pace)}</td><td><Status s={r.status} /> {r.action}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'transactions' && (
        <section className="st-sec">
          <h3>Checkouts the agent decided</h3>
          <p className="st-p">Orders since go-live with the group, the arm (treated or 10% holdout) and the offer shown.</p>
          {!live ? <div className="fcard"><div className="m">No transactions yet.</div></div> : (
            <>
              <label className="filter dark">Group
                <select value={group} onChange={(e) => { setGroup(e.target.value as 'all' | GroupId); setPage(0); }}>
                  <option value="all">All groups</option>
                  {model.groups.map((g) => <option key={g.id} value={g.id}>{shortGroup(g.label)}</option>)}
                </select>
              </label>
              <div className="tbl-wrap st-table">
                <table className="dtable dark">
                  <thead><tr><th>Order</th><th>Created</th><th>Group</th><th>Arm</th><th>Offer shown</th><th>Amount</th><th>Payment</th></tr></thead>
                  <tbody>{pilotOrders.slice(page * PAGE, page * PAGE + PAGE).map((o) => {
                    const p = payByOrder.get(o.id);
                    const offer = o.notes.offer_id ?? 'none';
                    return (
                      <tr key={o.id} className="row-link" onClick={() => p && nav(`/transactions?q=${p.id}`)}>
                        <td className="mono">{o.id}</td><td>{dateTimeIST(o.created_at)}</td><td>{label(o.notes.group_id!)}</td><td>{o.notes.arm}</td>
                        <td><OfferChip offer={offer} />{offer !== 'none' && <span className="sub">−{inr(OFFER_BY_ID[offer].costPerOrderInr)}</span>}</td>
                        <td>{inrP2(o.amount)}</td><td>{o.notes.cod ? 'COD' : p ? <Status s={p.status} /> : '—'}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <Pager page={page} pages={Math.ceil(pilotOrders.length / PAGE)} onPage={setPage} total={pilotOrders.length} />
              <p className="st-p small">{orderById.size.toLocaleString('en-IN')} orders in the six-month ledger; this list shows only orders since go-live.</p>
            </>
          )}
        </section>
      )}

      {tab === 'guardrails' && (
        <section className="st-sec">
          <h3>Guardrails</h3>
          <div className="perm">
            {[
              `Monthly budget hard stop: ${inr(settings.budget)}`, `Daily spend cap: ${inr(DAILY_SPEND_CAP)}`, `Max discount per order: ${inr(MAX_DISCOUNT_PER_ORDER)}`,
              'One offer per order; a typed code replaces the Smart Offer', `Never below break-even (${xr(derived.breakEven)}); step down after ${STEP_DOWN_DAYS} days below`,
              `10% holdout, sticky per customer`, `Checkout lookup ${CHECKOUT_BUDGET_MS} ms budget; store default on timeout`,
              settings.festiveWindow ? `No offers on ${model.profile.upcomingDrop.name} (${model.profile.upcomingDrop.styles} styles) for ${model.profile.upcomingDrop.fullPriceDays} days` : 'No festive window set',
              `Never uses: ${BANNED_SIGNALS.slice(0, 5).join(', ')}`,
            ].map((g) => <div key={g} className="y"><Check />{g}</div>)}
          </div>
          <p className="st-p">Change budget, margin and rules in <button className="linkish" onClick={() => nav('/offers/smart?tab=plan')}>Smart Offers → Setup &amp; plan</button>.</p>
          <h3>Plan by group</h3>
          <div className="perm">{derived.live.rows.map((r) => <div key={r.group} className="y">{label(r.group)}: <OfferChip offer={killed ? 'none' : r.offer} /></div>)}</div>
        </section>
      )}

      {tab === 'activity' && (
        <section className="st-sec">
          <h3>Activity log</h3>
          {audit.length === 0 ? <div className="fcard"><div className="m">No actions yet. Approvals, overrides, pauses, rule changes and the kill switch appear here.</div></div> : (
            <div className="tbl-wrap st-table">
              <table className="dtable dark">
                <thead><tr><th>#</th><th>Demo date</th><th>Actor</th><th>Action</th><th>Before → after</th></tr></thead>
                <tbody>{[...audit].reverse().map((a) => <tr key={a.id}><td>{a.id}</td><td>{fmtDate(a.demoDate)}</td><td>{a.actor}</td><td>{FEATURES.netReturns ? humanise(a.summary) : a.summary}</td><td>{(FEATURES.netReturns ? humanise(a.before) : a.before) ?? '—'} → {(FEATURES.netReturns ? humanise(a.after) : a.after) ?? '—'}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
