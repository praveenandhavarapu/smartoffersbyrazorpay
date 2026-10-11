import { useState } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { useDemo } from '../components/demoStore';
import { AFTER_DELIVERY, OFFER_BY_ID } from '../../data/fixtures';
import { NEW_GROUPS } from '../../data/types';
import { explainGroup } from '../../engine/explain';
import { inr, inrSigned, num, pctOf, pp, xr } from '../../lib/format';
import { fmtDate, pilotDayDate } from '../../lib/dates';
import { SNAP_DAYS } from '../../state/derived';
import { AccuracyTable, HoldoutNote, PilotDecisionCard } from '../components/lifecycle';
import { Alert, Clover, Power } from '../components/Icons';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../../ray/chatStore';
import { Banner, Kpi, OfferChip, shortGroup } from '../components/bits';
import { OverrideDrawer } from '../components/OverrideDrawer';
import { FEATURES } from '../../config/features';
import { RETURN_LABEL } from '../../engine/net';
import { NowStrip } from '../components/NowStrip';
import { ModeChip } from '../components/Experiments';
import { WhyPlaybook } from '../components/Playbook';
import { dayOf } from '../../engine/learning';
import { HeroMetric } from '../components/HeroMetric';

export function Results() {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const kill = useStore((s) => s.kill);
  const resume = useStore((s) => s.resume);
  const snapshot = useStore((s) => s.snapshot);
  const setSnapshot = useStore((s) => s.setSnapshot);
  const creatorFix = useStore((s) => s.creatorFix);
  const setCreatorFix = useStore((s) => s.setCreatorFix);
  const overrides = useStore((s) => s.overrides);
  const openOverride = useDemo((s) => s.openOverride);
  const [why, setWhy] = useState<string | null>(null);
  const nav = useNavigate();
  const queue = useChat((s) => s.queue);
  const [showCodes, setShowCodes] = useState(false);
  const s = derived.snapshots[snapshot];
  const be = derived.breakEven;
  const budget = derived.live.settings.budget;
  const pilotDays = 30;
  const alpha10Restored = useStore((x) => x.alpha10Restored);
  const moment = useStore((x) => x.moment);
  const v2 = FEATURES.netReturns;
  const pilotDecision = useStore((x) => x.pilotDecision);
  const nowDay = v2 ? derived.nowDay : moment === 'day30' ? 30 : 20;
  const viewDate = pilotDayDate(s.days);
  const festive = derived.festive;
  const showFestive = !v2 || (derived.liveSettings.festiveWindow && viewDate <= festive.end);
  const label = (g: string) => model.groups.find((x) => x.id === g)!.label;

  // Display-only: share of extra sales kept after failed COD and returns.
  const cod = model.profile.codSharePct / 100;
  const keptShare = (1 - cod * AFTER_DELIVERY.rtoRateOfCod) * (1 - AFTER_DELIVERY.returnRate);
  // New-shopper conversion: ALPHA10 month vs pilot (treated + holdout).
  const newG = model.groups.filter((g) => NEW_GROUPS.includes(g.id));
  const convBefore = newG.reduce((a, g) => a + g.checkouts * (g.baseConversion + g.today.reduce((t, u) => t + (u.share * u.liftPp) / 100, 0)), 0) / newG.reduce((a, g) => a + g.checkouts, 0);
  const newRows = s.rows.filter((r) => NEW_GROUPS.includes(r.group));
  const convNow = newRows.reduce((a, r) => a + r.treatedOrders + r.holdoutOrders, 0) / newRows.reduce((a, r) => a + r.treatedCheckouts + r.holdoutCheckouts, 0);
  const meera = derived.creators.rows.find((r) => r.flag);
  const maxRate = Math.max(...s.rows.map((r) => r.treatedRate));
  const offerRows = s.rows.filter((r) => r.offer !== 'none');
  // WhatsApp summary: the week's experiment outcome (latest agent event up to the viewed day).
  const weekEvent = (() => {
    const e = [...(derived.learning?.events ?? [])].reverse().find((x) => x.day <= s.days && x.day > s.days - 7 && x.type !== 'lift_decay');
    if (!e) return null;
    const short = e.summary.replace(/^Week \d+ review: /, '').split('. ')[0];
    return `${short}${e.needsApproval ? (e.decision ? ` (${e.decision === 'approved' ? 'approved' : 'kept as is'}).` : ' (waiting on you).') : '.'}`;
  })();

  return (
    <div className="res">
      <div className="res-head">
        {v2 ? (
          <h2><span className="clover"><Clover /></span>Smart Offers · {killed ? 'Paused' : 'Live'} · {nowDay === 0 ? 'pilot starts today' : nowDay < pilotDays ? `pilot day ${nowDay} of ${pilotDays} · Free pilot` : nowDay === pilotDays ? `pilot day ${pilotDays} of ${pilotDays} · ${pilotDecision === 'keep' ? 'kept' : pilotDecision === 'extend' ? 'pilot extended' : pilotDecision === 'stop' ? 'stopped' : 'decision due'}` : 'after pilot'}</h2>
        ) : (
          <h2><span className="clover"><Clover /></span>Smart Offers · {killed ? 'Paused' : 'Live'} · day {s.days}{s.days <= pilotDays ? ` of ${pilotDays} · Free pilot` : ' · after pilot'}</h2>
        )}
        <span className="sp" />
        <div className="seg sm" role="tablist" aria-label="Snapshot">
          {(['day7', 'day14', 'day20', 'day30', 'day60'] as const).map((k) => {
            const d = SNAP_DAYS[k];
            const future = d > nowDay;
            return <button key={k} role="tab" aria-selected={snapshot === k} className={snapshot === k ? 'on' : ''} onClick={() => setSnapshot(k)} title={future ? 'Projection from the count formulas' : fmtDate(pilotDayDate(d))}>Day {d}{future ? ' (proj.)' : ''}</button>;
          })}
        </div>
        {killed ? <button className="btn primary sm" onClick={resume}>Resume</button> : <button className="btn danger sm" onClick={kill}><Power width={14} /> Kill switch</button>}
      </div>
      <div className="res-main">
        {!approved && <Banner>Showing the default plan (not yet approved).</Banner>}
        {approved && derived.approvedDiffersFromPilot && <Banner>Your approved plan differs from the default; the synthetic pilot data was generated for the default plan, so results below measure that plan.</Banner>}
        {killed && <Banner tone="warn">{alpha10Restored ? 'Smart Offers stopped and ALPHA10 restored for everyone.' : 'Kill switch on: every group sees no offer. Shoppers get the store\'s default checkout.'} Logged in the audit log.</Banner>}
        {SNAP_DAYS[snapshot] > nowDay && <Banner>Day {s.days} is a projection from today's measured rates, not measured data.</Banner>}
        {FEATURES.experiments && <NowStrip compact />}
        {FEATURES.heroMetric && <HeroMetric day={snapshot} />}
        {approved && <PilotDecisionCard />}

        <div className="k4">
          <Kpi label="Offer spend" value={inr(s.spend)} sub={<>budget pace {inr(s.budgetPace)} · <span>{inr(budget)}/mo</span></>} />
          <Kpi label="Extra sales vs holdout" value={inr(s.extraSales)} sub={`${num(s.extraOrders)} extra orders (range ${num(s.extraOrdersLow)}–${num(s.extraOrdersHigh)})`} tone="up" />
          <Kpi label={RETURN_LABEL} value={xr(s.ret)} sub={`range ${xr(s.retLow)}–${xr(s.retHigh)} · break-even ${xr(be)}`} />
          <Kpi label={v2 ? 'Extra profit after returns' : 'Extra profit'} value={inrSigned(s.profit)} sub={`ALPHA10 same period: ${inrSigned(s.alpha10SamePeriod)}`} tone="up" />
        </div>
        <p className="small muted kept">{v2
          ? <>{pctOf(derived.kept, 0)} of extra sales are kept after returns and failed COD (your last 90 days): {inr(s.metrics.keptSales)} of {inr(s.extraSales)}. Profit and returns above already count this. Discounts on returned orders are still counted as spend.{s.days < AFTER_DELIVERY.returnWindowDays ? ' Return window still open.' : ''}</>
          : <>Kept after returns ≈ {inr(s.extraSales * keptShare)} of extra sales ({pctOf(keptShare, 0)} after failed COD and returns){s.days < AFTER_DELIVERY.returnWindowDays ? ' · return window still open' : ''}.</>} New-shopper conversion {pctOf(convNow)} vs {pctOf(convBefore)} in the ALPHA10 month (a small dip is expected; ad platforms see slightly fewer purchases). Returning buyers not given ALPHA10: {inr(s.returningNotGiven)}.</p>

        <section className="panel">
          <div className="panel-h"><h4>Proof: treated vs 10% holdout</h4><div className="leg"><span><i style={{ background: 'var(--blue)' }} />Saw offer</span><span><i style={{ background: '#C7CDD8' }} />Holdout</span></div></div>
          {v2 ? <p className="honest">Day {s.days}{SNAP_DAYS[snapshot] > nowDay ? ' (projection)' : ''}: {num(s.extraOrders)} extra orders (90% range {num(s.extraOrdersLow)}–{num(s.extraOrdersHigh)}). {s.proof}</p>
            : <p className="honest">Offers have created extra orders (90% range {num(s.extraOrdersLow)}–{num(s.extraOrdersHigh)}). {s.retLow < be ? 'Profitability is not proven yet. Typical at day 20; clearer by about day 60.' : 'Profitability is above break-even even at the low end of the range.'}</p>}
          <div className="proof">
            {s.rows.map((r) => (
              <div className="prow" key={r.group}>
                <div className="nm">{shortGroup(label(r.group))}<span>{r.offer === 'none' ? 'no offer' : OFFER_BY_ID[r.offer].label} · trust {pctOf(r.trustWeight, 0)}</span></div>
                <div className="pbars">
                  <div className="a"><i style={{ width: `${(r.treatedRate / maxRate) * 100}%` }} />{pctOf(r.treatedRate)}</div>
                  <div className="h"><i style={{ width: `${(r.holdoutRate / maxRate) * 100}%` }} />{pctOf(r.holdoutRate)}</div>
                </div>
                <div className="lift">
                  {r.offer === 'none' ? <span className="st saving">control check</span> : <>{pp(r.lift * 100)}<span className="sub">{pp(r.liftLow * 100)} to {pp(r.liftHigh * 100)}</span>{r.stillLearning && <span className="st saving">still learning</span>}</>}
                </div>
              </div>
            ))}
            <p className="small muted">No-offer groups are a control check: no difference expected. Trust = how much decisions lean on this store's own results vs similar stores (holdout ÷ (holdout + 300)).</p>
          </div>
        </section>

        <AccuracyTable snap={s} />
        <HoldoutNote />

        <section className="panel">
          <div className="panel-h"><h4>By group</h4><span className="muted small">Override any row; cost is shown before you apply.</span></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Group</th><th>Offer</th><th>Spend</th><th>Extra sales</th><th>{RETURN_LABEL}</th><th>Status</th><th /></tr></thead>
              <tbody>
                {s.rows.map((r) => {
                  const live = derived.liveOffers[r.group];
                  const shown = FEATURES.experiments ? (killed ? 'none' : r.offer) : live;
                  const xrow = derived.learning?.rows.find((x) => x.group === r.group);
                  const running = Boolean(xrow?.challenger && xrow.status === 'running' && SNAP_DAYS[snapshot] >= (xrow.startedOn ? dayOf(xrow.startedOn) : 999));
                  const planRow = derived.live.rows.find((x) => x.group === r.group)!;
                  const g = model.groups.find((x) => x.id === r.group)!;
                  return [
                    <tr key={r.group}>
                      <td>{shortGroup(g.label)}</td>
                      <td><OfferChip offer={shown} />{running && xrow?.challenger && <span className="chip-run" title={`${OFFER_BY_ID[xrow.challenger].label} on ${Math.round(xrow.trafficShare * 100)}% of treated shoppers`}>challenger running</span>}{overrides[r.group] && <span className="sub">override</span>}{FEATURES.experiments && shown !== live && <span className="sub">today: {OFFER_BY_ID[live].label}</span>}{FEATURES.experiments && xrow && xrow.mode.mode !== 'none' && <span className="sub"><ModeChip mode={xrow.mode.mode} days={xrow.mode.days} /></span>}</td>
                      <td>{r.offer === 'none' ? '—' : inr(r.spend)}</td>
                      <td>{r.offer === 'none' ? '—' : inr(r.extraSales)}</td>
                      <td>{r.offer === 'none' ? '—' : xr(r.ret)}</td>
                      <td>{r.offer === 'none' ? <span className="st saving">control check</span> : r.stillLearning ? <span className="st saving">still learning</span> : <span className="st ok">proven lift</span>}</td>
                      <td className="nowrap">
                        <button className="whyl" onClick={() => setWhy(why === r.group ? null : r.group)} aria-expanded={why === r.group}>Why?</button>{' '}
                        <button className="whyl" onClick={() => openOverride(r.group, live === 'none' ? (Object.keys(g.priorLiftsPp)[0] as typeof live) : 'none')}>Override</button>
                      </td>
                    </tr>,
                    why === r.group && <tr key={r.group + 'w'} className="why-row show"><td colSpan={7}>{explainGroup(g, planRow, derived.margin, derived.kept)}{FEATURES.playbook && <WhyPlaybook group={r.group} offer={r.offer} />}</td></tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h"><h4>Creator codes</h4><button className="btn secondary sm" onClick={() => setShowCodes(!showCodes)} aria-expanded={showCodes}>{showCodes ? 'Hide' : `Show ${derived.creators.rows.length} codes`}</button></div>
          {v2 && creatorFix !== 'pending' && meera
            ? <p className="honest">{creatorFix === 'limited' ? `Fixed on ${derived.creatorFixDate ? fmtDate(derived.creatorFixDate, false) : 'approval'}: ${meera.code} is limited to first orders, saving about ${inr(derived.creators.firstOrderOnlyNetGain)} a month net.` : `Kept as is on ${derived.creatorFixDate ? fmtDate(derived.creatorFixDate, false) : 'your decision'}: ${meera.code} still gives returning buyers about ${inr(meera.discountToReturning)} a month.`} Creator tracking stays untouched.</p>
            : <p className="honest">Creator codes gave returning buyers {inr(derived.creators.monthlyDiscountToReturning)} a month. Limiting them to first orders would net about {inr(derived.creators.firstOrderOnlyNetGain)} a month (≈{num(derived.creators.lostOrders, v2 ? 0 : 1)} orders lost). Creator tracking stays untouched.</p>}
          {showCodes && (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Code</th><th>Creator</th><th>Uses</th><th>By returning buyers</th><th>Flag</th></tr></thead>
                <tbody>{derived.creators.rows.map((c) => <tr key={c.code}><td><b>{c.code}</b></td><td>{c.creator}</td><td>{c.uses}</td><td>{c.returningUses} ({num(c.returningSharePct)}%)</td><td>{c.flag ? <span className="st warn-st">⚑ leaking</span> : '—'}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <div className="ask-ray card pad">
          <span className="clover"><Clover /></span>
          <span>Questions about these results?</span>
          {['How are the results so far?', 'Why does returning get no offer?', 'Give returning customers ₹100 off'].map((q) => <button key={q} className="chip" onClick={() => { queue(q); nav('/ray'); }}>{q}</button>)}
        </div>
      </div>

      <aside className="side">
        <div className="card alert">
          <span className="mono-tag amber"><Alert width={12} /> Alerts</span>
          {meera && (
            <>
              <h5>{meera.code} is leaking</h5>
              <p>{meera.returningUses} of {meera.uses} uses were by returning buyers: {inr(meera.discountToReturning)} a month.</p>
              {creatorFix === 'pending' ? (
                <div className="btns"><button className="btn primary" onClick={() => setCreatorFix('limited')}>Limit to first orders</button><button className="btn secondary" onClick={() => setCreatorFix('kept')}>Keep as is</button></div>
              ) : <p className="small good">{creatorFix === 'limited' ? `Limited to first orders${v2 && derived.creatorFixDate ? ` on ${fmtDate(derived.creatorFixDate, false)}` : ''}. Creator tracking unchanged.` : `Kept as is${v2 && derived.creatorFixDate ? ` on ${fmtDate(derived.creatorFixDate, false)}` : ''}. I won't ask again.`}</p>}
            </>
          )}
          {s.nearBreakEven.map((r) => <div key={r.group}><h5>Near break-even</h5><p>{shortGroup(label(r.group))}, {OFFER_BY_ID[r.offer].label.toLowerCase()} at {xr(r.ret)} (break-even {xr(be)}). Watching; it steps down automatically after 7 days below.</p></div>)}
          {showFestive && <>
            <h5>{festive.name} {!v2 || viewDate < festive.launch ? `starts ${fmtDate(festive.launch, false)}` : `is on until ${fmtDate(festive.end, false)}`}</h5>
            <p>No offers on its {festive.styles} styles for {festive.fullPriceDays} days, as you set.</p>
          </>}
          {v2 && !meera && s.nearBreakEven.length === 0 && !showFestive && <p className="small muted">No alerts for day {s.days}.</p>}
        </div>
        <div className="card">
          <span className="mono-tag green">Weekly summary · WhatsApp</span>
          <div className="wa"><div className="wa-b">Smart Offers, last 7 days (approx.): {inr(s.weekly.spend)} spent, {num(s.weekly.extraOrders)} extra orders, {inr(s.weekly.extraSales)} extra sales, {inrSigned(s.weekly.profit)} profit{v2 ? ' after returns' : ''}. {v2 ? `${offerRows.filter((r) => r.stillLearning).length} of ${offerRows.length} offer groups still learning.` : 'Still learning on most groups.'}{FEATURES.experiments && weekEvent ? ` This week: ${weekEvent}` : ''}<small>Mon 9:00</small></div></div>
        </div>
        <div className="card">
          <span className="mono-tag">Billing</span>
          {v2 ? (derived.daysLeft > 0 ? <h5>Free pilot · {derived.daysLeft} days left</h5> : <h5>Pilot ended {fmtDate(derived.pilotEndDate, false)}</h5>)
            : s.days <= pilotDays ? <h5>Free pilot · {pilotDays - s.days} days left</h5> : <h5>After the pilot</h5>}
          <p>Fee: 1% of proven extra sales, capped at 20% of extra profit. If billed today: about <b>{inr(s.fee.fee)}</b>, based on the lower bound ({num(s.fee.provenExtraOrders)} orders × {inr(s.fee.avgExtraOrderValue)}).</p>
        </div>
        <div className="card">
          <span className="mono-tag">Offer groups</span>
          <p className="small">{offerRows.length} offer groups live · {offerRows.filter((r) => r.stillLearning).length} still learning · holdout {model.profile.holdoutPct}%</p>
        </div>
      </aside>
      <OverrideDrawer />
    </div>
  );
}
