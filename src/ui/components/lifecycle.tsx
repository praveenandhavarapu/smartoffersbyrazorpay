/** Lifecycle features: notifications, opportunity signals, why AI, weekly reviews, accuracy, pilot decision, experiments, exit. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { useChat } from '../../ray/chatStore';
import { OFFER_BY_ID } from '../../data/fixtures';
import { accuracyRows, accuracySummary } from '../../engine/accuracy';
import type { ReviewItem, WeeklyReview } from '../../engine/review';
import { fmtDate } from '../../lib/dates';
import { inr, inrSigned, num, xr } from '../../lib/format';
import { Alert as AlertIcon, Check, X } from './Icons';
import { Drawer } from './kit';
import { OfferChip, shortGroup } from './bits';
import type { Snapshot } from '../../engine/measure';
import { FEATURES } from '../../config/features';
import { RETURN_LABEL } from '../../engine/net';
import { groupLabel, offerLabel } from '../../lib/labels';
import { AI_NIGHTLY, HowAIWorks } from './HowAIWorks';

/** 🔔 in the top bar: opportunities and lifecycle prompts. */
export function NotificationsBell() {
  const { derived } = useModel();
  const nav = useNavigate();
  const queue = useChat((s) => s.queue);
  const read = useStore((s) => s.notificationsRead);
  const markRead = useStore((s) => s.markRead);
  const [open, setOpen] = useState(false);
  const unread = derived.alerts.filter((a) => !read.includes(a.id));
  return (
    <div className="bell-wrap">
      <button className="bell" aria-label={`Notifications (${unread.length} new)`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 004 0" /></svg>
        {unread.length > 0 && <span className="bell-n">{unread.length}</span>}
      </button>
      {open && (
        <div className="bell-menu" role="dialog" aria-label="Notifications">
          <div className="bell-h"><b>From Ray</b>{unread.length > 0 && <button className="linkish dark-ink" onClick={() => markRead(derived.alerts.map((a) => a.id))}>Mark all read</button>}</div>
          {derived.alerts.length === 0 && <p className="muted small">Nothing new.</p>}
          {derived.alerts.map((a) => (
            <button key={a.id} className={`bell-item ${a.tone} ${read.includes(a.id) ? 'read' : ''}`} onClick={() => { markRead([a.id]); setOpen(false); if (a.ask) { queue(a.ask); nav('/ray'); } else if (a.to) nav(a.to); }}>
              <b>{a.title}</b><span>{a.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "How Ray found this": the signals, thresholds and eligibility. */
export function OpportunityPanel({ compact }: { compact?: boolean }) {
  const { derived } = useModel();
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag amber">How Ray found this</span><span className="muted small">checked every Monday 06:00</span></div>
      <div className="sig-list">
        {derived.signals.map((s) => (
          <div key={s.label} className={`sig ${s.breached ? 'bad' : 'ok'}`}>
            <span className="sig-ic" aria-hidden="true">{s.breached ? '!' : '✓'}</span>
            <span className="sig-l">{s.label}</span><b>{s.value}</b><span className="sig-t">{s.threshold}</span>
          </div>
        ))}
      </div>
      {!compact && (
        <>
          <div className="muted small">Why this store is eligible for Smart Offers:</div>
          <div className="elig">{derived.eligibility.map((e) => <span key={e.label} className={e.ok ? 'ok' : 'bad'}>{e.ok ? '✓' : '✗'} {e.label}: <b>{e.value}</b></span>)}</div>
        </>
      )}
    </div>
  );
}

/** Blanket code vs simple rule vs Smart Offers, plus what the AI does that a rule can't. */
export function WhyAI({ which }: { which?: 'draft' | 'live' }) {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  if (!FEATURES.netReturns) return <WhyAIv1 />;
  const w = which ?? (approved ? 'live' : 'draft');
  const cmp = w === 'live' ? derived.comparison : derived.draftComparison;
  const por = w === 'live' ? derived.profitOverRatio : derived.draftProfitOverRatio;
  const max = Math.max(...cmp.rows.map((s) => Math.abs(s.profit)), 1);
  const capped = cmp.rows.filter((r) => r.capped);
  return (
    <div className="rcard why-ai">
      <div className="rc-h"><span className="mono-tag">Why AI, not a fixed rule</span><span className="muted small">same {num(cmp.coverage * 100)}% of shoppers, same {inr(cmp.budget)} budget, after returns, per month</span></div>
      <div className="strat">
        {cmp.rows.map((s) => (
          <div key={s.id} className={`strat-row ${s.id}`}>
            <span className="strat-l">{s.label}</span>
            <span className="strat-bar"><i className={s.profit < 0 ? 'neg' : 'pos'} style={{ width: `${(Math.abs(s.profit) / max) * 100}%` }} /></span>
            <b className={s.profit < 0 ? 'bad' : 'good'}>{inrSigned(s.profit)}</b>
          </div>
        ))}
      </div>
      {capped.length > 0 && <p className="small muted">{capped.map((r) => r.id === 'blanket' ? 'ALPHA10' : 'The rule').join(' and ')} would overspend, so {capped.length > 1 ? 'they are' : 'it is'} capped at your budget: when it runs out, offers stop for the rest of the month.</p>}
      {cmp.verdict === 'ai_wins' ? (
        <ol className="why-list">
          <li><b>Starts smart on day one.</b> A rule needs history this store doesn't have. Smart Offers borrows offer-test results from {num(model.pool.size)} similar stores (averages only) to estimate each group's lift.</li>
          {por && <li><b>Chooses for profit, not for a ratio.</b> {groupLabel(por.group)} get {offerLabel(por.offer)} at {xr(por.ret)} although {offerLabel(por.alt)} returns more per rupee ({xr(por.altRet)}), because {offerLabel(por.offer)} makes {inr(por.extraProfitMonth)} more a month. A rule can't make that trade-off per group.</li>}
          <li><b>Learns this store's own truth.</b> A {model.profile.holdoutPct}% holdout measures real lift; each week the plan leans more on measured results (trust weight) and less on borrowed ones.</li>
          <li><b>Adapts every week.</b> The Monday review re-plans with what was learned and asks you to approve changes. A rule stays wrong until someone notices.</li>
        </ol>
      ) : (
        <p className="small"><b>{cmp.verdict === 'tie' ? 'At your margin a simple rule does about as well.' : 'At your margin a simple rule does as well or better on paper.'}</b> Smart Offers still adds: proof via the holdout, weekly re-testing, and stopping offers that stop paying.</p>
      )}
      {FEATURES.heroMetric ? <>
        <HowAIWorks compact />
        <p className="small muted">{AI_NIGHTLY} No AI model sits in the payment path.</p>
      </> : <p className="small muted">The language model (Ray) only explains and drafts. Checkout decisions come from a precomputed table, so AI never sits in the payment path.</p>}
    </div>
  );
}

/** v1 version, kept for the netReturns flag off. */
function WhyAIv1() {
  const { model, derived } = useModel();
  const max = Math.max(...derived.strategies.map((s) => Math.abs(s.profit)), 1);
  const big = derived.draft.rows.find((r) => r.group === 'new_ads_big');
  const g = model.groups.find((x) => x.id === 'new_ads_big')!;
  const alt100 = g.priorLiftsPp.flat_100 !== undefined ? (() => { const l = g.priorLiftsPp.flat_100 / 100; const n = g.checkouts * 0.9; return n * (l * g.aovInr * derived.margin - (g.baseConversion + l) * 100); })() : null;
  return (
    <div className="rcard why-ai">
      <div className="rc-h"><span className="mono-tag">Why AI, not a fixed rule</span><span className="muted small">same 90% of shoppers, per month</span></div>
      <div className="strat">
        {derived.strategies.map((s) => (
          <div key={s.id} className={`strat-row ${s.id}`}>
            <span className="strat-l">{s.label}</span>
            <span className="strat-bar"><i className={s.profit < 0 ? 'neg' : 'pos'} style={{ width: `${(Math.abs(s.profit) / max) * 100}%` }} /></span>
            <b className={s.profit < 0 ? 'bad' : 'good'}>{inrSigned(s.profit)}</b>
          </div>
        ))}
      </div>
      <ol className="why-list">
        <li><b>Starts smart on day one.</b> A rule needs history this store doesn't have. Smart Offers borrows offer-test results from {num(model.pool.size)} similar stores (averages only) to estimate each group's lift.</li>
        {big && big.offer === 'flat_200' && <li><b>Chooses for profit, not for a ratio.</b> Big new carts get ₹200 off at {xr(big.ret)} although ₹100 off returns more per rupee, because ₹200 makes {alt100 !== null ? inr(big.profit - alt100) : 'more'} more a month. A rule can't make that trade-off per group.</li>}
        <li><b>Learns this store's own truth.</b> A 10% holdout measures real lift; each week the plan leans more on measured results (trust weight) and less on borrowed ones.</li>
        <li><b>Adapts every week.</b> The Monday review re-plans with what was learned and asks you to approve changes. A rule stays wrong until someone notices.</li>
      </ol>
      <p className="small muted">The language model (Ray) only explains and drafts. Checkout decisions come from a precomputed table, so AI never sits in the payment path.</p>
    </div>
  );
}

function ItemIcon({ kind }: { kind: ReviewItem['kind'] }) {
  const map: Record<ReviewItem['kind'], string> = { proven: '✓', learning: '…', early: '◷', watch: '!', switch: '⇄', no_lift: '∅', creator: '%', festive: '★', budget: '₹', control: '=', experiment: '⟳' };
  return <span className={`ri-ic ${kind}`} aria-hidden="true">{map[kind]}</span>;
}

/** One Monday review with approve / dismiss for items that change something. */
export function ReviewCard({ review, open: startOpen = true }: { review: WeeklyReview; open?: boolean }) {
  const decisions = useStore((s) => s.reviewDecisions);
  const decide = useStore((s) => s.decideReview);
  const applyOverride = useStore((s) => s.applyOverride);
  const setCreatorFix = useStore((s) => s.setCreatorFix);
  const decideLearning = useStore((s) => s.decideLearning);
  const openReview = useStore((s) => s.openReview);
  const [open, setOpen] = useState(startOpen);
  const pending = review.items.filter((i) => i.action && !decisions[i.id]);
  const approve = (i: ReviewItem) => {
    if (i.action?.type === 'override') applyOverride(i.action.group, i.action.offer, i.action.from, `Week ${review.week} review: ${OFFER_BY_ID[i.action.offer].label}`);
    if (i.action?.type === 'creator') setCreatorFix('limited');
    if (i.action?.type === 'learning') decideLearning(i.action.key, 'approved', i.title);
    decide(i.id, 'approved', i.title, i.action?.type === 'learning');
  };
  return (
    <div className="rcard review" onMouseEnter={() => openReview(review.id)} onFocus={() => openReview(review.id)}>
      <button className="rv-h" onClick={() => { setOpen(!open); openReview(review.id); }} aria-expanded={open}>
        <span className="mono-tag green">Week {review.week} review</span>
        <b>Mon {fmtDate(review.date, false)} · 06:00</b>
        <span className="muted small">data from {review.dataDays} days</span>
        <span className="sp" />
        {pending.length > 0 ? <span className="status warn">{pending.length} to approve</span> : <span className="status ok">done</span>}
      </button>
      {open && (
        <div className="rv-items">
          {review.items.map((i) => (
            <div key={i.id} className={`rv-item ${i.kind}`}>
              <ItemIcon kind={i.kind} />
              <div><b>{i.title}</b><p>{i.detail}</p></div>
              {i.action && (decisions[i.id] ? <span className={`status ${decisions[i.id] === 'approved' ? 'ok' : ''}`}>{decisions[i.id]}</span> : (
                <div className="btns"><button className="btn primary sm" onClick={() => approve(i)}>Approve</button><button className="btn secondary sm" onClick={() => { if (i.action?.type === 'creator') setCreatorFix('kept'); if (i.action?.type === 'learning') decideLearning(i.action.key, 'declined', i.title); decide(i.id, 'dismissed', i.title, i.action?.type === 'learning'); }}>Keep as is</button></div>
              ))}
            </div>
          ))}
          {pending.length > 1 && <button className="btn primary sm" onClick={() => pending.forEach(approve)}>Approve all {pending.length}</button>}
        </div>
      )}
    </div>
  );
}

export function ReviewsList() {
  const { derived } = useModel();
  if (!derived.reviews.length) return <div className="rcard"><p>No reviews yet. The first Monday review arrives one week after you approve a plan.</p></div>;
  return (
    <div className="stack-gap">
      {derived.nextReview && <div className="rcard next-review"><b>Next review: Mon {fmtDate(derived.nextReview, false)}, 06:00</b><span className="muted small">Ray checks measured results, re-plans with what it learned, and asks you to approve any change. You also get it on WhatsApp.</span></div>}
      {derived.reviews.map((r, i) => <ReviewCard key={r.id} review={r} open={i === 0} />)}
    </div>
  );
}

/** Similar-store estimate before launch vs what the holdout measured. */
export function AccuracyTable({ snap }: { snap: Snapshot }) {
  const { model } = useModel();
  const rows = useMemo(() => accuracyRows(model.groups, snap, model.pool.p25, model.pool.p75), [model, snap]);
  const s = accuracySummary(rows);
  const label = (g: string) => shortGroup(model.groups.find((x) => x.id === g)!.label);
  return (
    <div className="rcard">
      <div className="rc-h"><span className="mono-tag">Predicted vs measured · day {snap.days}</span><span className="small"><b>{s.inside} of {s.total}</b> estimates inside the measured range · median error {num(s.medianAbsErrorPp, 1)} pp</span></div>
      <div className="tbl-wrap">
        <table className="dtable compact">
          <thead><tr><th>Group</th><th>Offer</th><th>Estimate before launch</th><th>Measured (90% range)</th><th>Estimate inside?</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.group}>
              <td>{label(r.group)}</td><td><OfferChip offer={r.offer as never} /></td>
              <td>+{num(r.priorPp, 1)} pp{r.poolLowPp !== null && <span className="sub">similar stores {num(r.poolLowPp, 1)}–{num(r.poolHighPp ?? 0, 1)}</span>}</td>
              <td>{r.measuredPp >= 0 ? '+' : ''}{num(r.measuredPp, 1)} pp<span className="sub">{num(r.lowPp, 1)} to {num(r.highPp, 1)}</span></td>
              <td>{r.inside ? <span className="status ok">yes</span> : <span className="status bad">no</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Day-30 pilot decision (preview before day 30). */
export function PilotDecisionCard() {
  const { derived } = useModel();
  const moment = useStore((s) => s.moment);
  const decision = useStore((s) => s.pilotDecision);
  const decidePilot = useStore((s) => s.decidePilot);
  const jump30 = useStore((s) => s.jump30);
  const p = derived.pilot;
  const due = moment === 'day30';
  const verdict = p.verdict === 'profitable_proven' ? 'Profitable even at the low end of the range.'
    : FEATURES.netReturns && p.verdict === 'orders_proven' && p.expectedProfitMonth < 0 ? 'Extra orders are proven, but after returns at your margin the expected profit is below zero. Change offers or margin before keeping it.'
    : p.verdict === 'orders_proven' ? 'Extra orders are proven. Profit is likely but its range still dips below break-even.' : 'Not proven yet.';
  return (
    <div className={`rcard decision ${due ? 'due' : ''}`}>
      <div className="rc-h"><span className={`mono-tag ${due ? 'green' : ''}`}>{due ? 'Pilot ended · your decision' : `Pilot ends ${fmtDate(derived.pilotEndDate, false)} · ${derived.daysLeft} days left`}</span>{!due && <button className="btn ghost sm" onClick={jump30}>Jump to day 30 →</button>}</div>
      <h3>{due ? 'Keep Smart Offers?' : 'What you will decide on day 30'}</h3>
      <div className="rc-grid">
        <div><span>Expected extra profit{FEATURES.netReturns ? ' after returns' : ''}</span><b>{inrSigned(p.expectedProfitMonth)}</b><em>a month</em></div>
        <div><span>Extra orders (30 days)</span><b>{num(p.extraOrders, 0)}</b><em>proven at least {num(p.extraOrdersLow)}</em></div>
        <div><span>{RETURN_LABEL}</span><b>{xr(p.ret)}</b><em>range {xr(p.retLow)}–{xr(p.retHigh)} · break-even {xr(derived.breakEven)}</em></div>
        <div><span>Fee if billed</span><b>{inr(p.fee.fee)}</b><em>1% of proven sales, capped</em></div>
      </div>
      <p className="small">{verdict} The fee only counts the proven lower bound ({num(p.fee.provenExtraOrders)} orders × {inr(p.fee.avgExtraOrderValue)}).</p>
      {due && (decision ? <div className="status ok">Decision: {decision === 'keep' ? 'kept, billed monthly on proven results' : decision === 'extend' ? 'pilot extended by 15 days' : 'stopped'}</div> : (
        <div className="btns">
          <button className="btn primary sm" onClick={() => decidePilot('keep', `Kept Smart Offers after the pilot (fee about ${inr(p.fee.fee)} for the period)`)}>Keep Smart Offers</button>
          <button className="btn secondary sm" onClick={() => decidePilot('extend', 'Extended the free pilot by 15 days')}>Extend pilot 15 days</button>
          <StopButton label="Stop" />
        </div>
      ))}
    </div>
  );
}

/** Proposed next experiments, each needing approval. */
export function ExperimentsList() {
  const { derived } = useModel();
  const decided = useStore((s) => s.experiments);
  const decide = useStore((s) => s.decideExperiment);
  return (
    <div className="exp-list">
      {derived.experiments.map((e) => (
        <div key={e.id} className="rcard exp">
          <div className="rc-h"><b>{e.title}</b>{decided[e.id] ? <span className={`status ${decided[e.id] === 'approved' ? 'ok' : ''}`}>{decided[e.id] === 'approved' ? 'queued after pilot' : 'declined'}</span> : <span className="mono-tag">hypothesis</span>}</div>
          <p className="small"><b>Why:</b> {e.why}</p>
          <p className="small"><b>Test:</b> {e.design}</p>
          <p className="small"><b>Success metric:</b> {e.metric}</p>
          {!decided[e.id] && <div className="btns"><button className="btn primary sm" onClick={() => decide(e.id, 'approved', e.title)}>Approve test</button><button className="btn secondary sm" onClick={() => decide(e.id, 'declined', e.title)}>Not now</button></div>}
        </div>
      ))}
    </div>
  );
}

/** Clean exit: pause everything, or restore ALPHA10. Ray states the cost once. */
export function StopButton({ label = 'Stop Smart Offers', className = 'btn secondary sm' }: { label?: string; className?: string }) {
  const { derived } = useModel();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const stop = useStore((s) => s.stopSmartOffers);
  const decidePilot = useStore((s) => s.decidePilot);
  const moment = useStore((s) => s.moment);
  const [open, setOpen] = useState(false);
  if (!approved || killed) return null;
  const diff = derived.live.profit - derived.a10.profit;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Drawer title="Stop Smart Offers" onClose={() => setOpen(false)}>
          <p className="small">Once, so you have the numbers: Smart Offers is planned at <b>{inrSigned(derived.live.profit)}</b> a month; ALPHA10 lost <b>{inr(Math.abs(derived.a10.profit))}</b> last month. Going back costs about <b>{inr(diff)}</b> a month. Your call.</p>
          <div className="stack-gap">
            <button className="btn secondary" onClick={() => { stop(false, 'Stopped Smart Offers: every group set to no offer'); if (moment === 'day30') decidePilot('stop', 'Stopped after the pilot'); setOpen(false); }}><X width={14} /> Turn off all offers</button>
            <button className="btn secondary" onClick={() => { stop(true, 'Stopped Smart Offers and restored ALPHA10 for everyone'); if (moment === 'day30') decidePilot('stop', 'Stopped after the pilot; ALPHA10 restored'); setOpen(false); }}><AlertIcon width={14} /> Stop and restore ALPHA10</button>
            <button className="btn primary" onClick={() => setOpen(false)}><Check width={14} /> Keep Smart Offers running</button>
          </div>
          <p className="small muted">Either way it's logged, and you can resume any time.</p>
        </Drawer>
      )}
    </>
  );
}

/** "Proof costs ₹X a month" framing for the holdout (cost of the plan being shown: draft or live). */
export function HoldoutNote({ which }: { which?: 'draft' | 'live' }) {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  const w = which ?? (approved ? 'live' : 'draft');
  const cost = FEATURES.netReturns && w === 'live' ? derived.holdoutCostMonthLive : derived.holdoutCostMonth;
  return <p className="plan-note">The {model.profile.holdoutPct}% holdout costs about <b>{inr(cost)}</b> a month in missed extra profit. That's the price of proof: without it, last month's <b>{inr(derived.a10.spend)}</b> of ALPHA10 discounts was a guess.</p>;
}

/** Shown on payments pages when the demo date is past the end of the synthetic payments data. */
export function DataEndNote() {
  const moment = useStore((s) => s.moment);
  if (moment !== 'day30') return null;
  return <div className="banner" role="status">Demo date is 20 Oct (pilot day 30). Synthetic payments data in this demo runs to 10 Oct 2026.</div>;
}

export const reviewStatus = (r: WeeklyReview, decisions: Record<string, string>) => r.items.filter((i) => i.action && !decisions[i.id]).length;
