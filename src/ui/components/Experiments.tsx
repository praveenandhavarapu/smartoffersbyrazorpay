/** v2 §7.4: Experiments tab — champion vs challenger per group, re-test triggers, proof vs playbook mode. */
import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore, EXPERIMENT_SPACE_TEXT } from '../../state/store';
import { fmtDate } from '../../lib/dates';
import { inr, inrSigned, num, pctOf } from '../../lib/format';
import { groupLabel, offerLabel } from '../../lib/labels';
import { KEYS, LEARNING_DAYS, TRAFFIC_SHARE, type ExperimentRead, type ExperimentRow } from '../../engine/learning';
import { OfferChip } from './bits';

const pp = (x: number) => `${x >= 0 ? '+' : ''}${num(x, 1)} pp`;
const STATUS: Record<ExperimentRow['status'], string> = { running: 'running', promoted: 'promoted', retired: 'retired', paused: 'paused', waiting: 'waiting on you', proposed: 'waiting on you', none: '—' };

export function ModeChip({ mode, days }: { mode: 'proof' | 'playbook' | 'none'; days: number | null }) {
  if (mode === 'none') return <span className="muted small">—</span>;
  return mode === 'proof'
    ? <span className="status ok" title={`Holdout can prove this lift in about ${days} days`}>Proof mode</span>
    : <span className="status warn" title={`Runs on evidence from similar stores; your own proof expected by ~day ${days}`}>Playbook mode</span>;
}

function ReadCard({ title, read, rule, rto }: { title: string; read: ExperimentRead; rule?: boolean; rto?: { champion: number; challenger: number } }) {
  const arm = (label: string, a: ExperimentRead['champion']) => (
    <tr>
      <td>{label}<span className="sub">{offerLabel(a.offer)} · {num(a.checkouts)} shoppers</span></td>
      <td>{pp(a.liftPp)}<span className="sub">{num(a.lowPp, 1)} to {num(a.highPp, 1)}</span></td>
      <td>{inr(a.spendPerShopper)}</td>
      <td>{a.costPerExtraOrder === null ? '—' : inr(a.costPerExtraOrder)}</td>
      <td>{inr(a.profitPerShopper)}<span className="sub">blended {pp(a.blendedLiftPp)}</span></td>
    </tr>
  );
  return (
    <div className="rcard exp-read">
      <div className="rc-h"><b>{title}</b><span className="muted small">{read.days} days of data · holdout {pctOf(read.holdout.ratePct / 100)} buy without an offer</span></div>
      <div className="tbl-wrap">
        <table className="dtable compact">
          <thead><tr><th>Arm</th><th>Lift vs holdout (90% range)</th><th>Spend / shopper</th><th>Cost per extra order</th><th>Profit / shopper after returns</th></tr></thead>
          <tbody>{arm('Champion', read.champion)}{arm('Challenger', read.challenger)}</tbody>
        </table>
      </div>
      <p className="small"><b>{read.verdict === 'promote' ? 'On course to promote.' : read.verdict === 'retire' ? 'On course to retire.' : 'Keep testing.'}</b> {read.reason} Lift gap {pp(read.gapPp)} (90% range {num(read.gapLowPp, 1)} to {num(read.gapHighPp, 1)}), {num(read.spendCutPct)}% less spend per shopper, about {inrSigned(read.gainMonth)} a month.</p>
      {rto && <p className="small">Failed deliveries avoided per 100 orders: champion {num(rto.champion, 1)}, challenger {num(rto.challenger, 1)} (shoppers moved from COD to prepaid). Not yet counted in profit above.</p>}
      {rule && <p className="small muted">Decision rule: promote only if the challenger costs less per shopper, makes at least as much profit per shopper once this store's result is blended with the playbook (trust = shoppers ÷ (shoppers + 300)), and this store's own lift gap is within noise. Promotions always need your approval.</p>}
    </div>
  );
}

export function ExperimentsTab() {
  const { model, derived } = useModel();
  const nav = useNavigate();
  const approved = useStore((s) => s.approved);
  const space = useStore((s) => s.experimentSpace);
  const setSpace = useStore((s) => s.setExperimentSpace);
  const L = derived.learning;
  if (!L) return null;
  const now = derived.nowDay;
  const big = L.rows.find((r) => r.id === KEYS.startBig);
  const org = L.rows.find((r) => r.id === KEYS.organicTest && r.read);
  const decay = L.events.find((e) => e.type === 'lift_decay');
  const pre = L.rows.find((r) => r.id === KEYS.prepaidTest && r.read);
  return (
    <div className="stack-gap exp-tab">
      <p className="exp-lead"><b>The experiment never stops: {model.profile.holdoutPct}% holdout always on, challengers refreshed weekly.</b> Champion = today's offer for the group. Challenger = a cheaper or better variant tested on {pctOf(TRAFFIC_SHARE, 0)} of the group's treated shoppers; the holdout is never used for tests.</p>
      <div className={`rcard space ${space ? 'on' : ''}`}>
        <div><b>Experiment space: {space ? 'on' : 'off'}</b><span className="small muted"> You approved once: {EXPERIMENT_SPACE_TEXT} New offer types and every promotion still need your OK.</span></div>
        {approved && <button className="btn secondary sm" onClick={() => setSpace(!space)}>{space ? 'Turn off' : 'Turn on'}</button>}
      </div>
      {!approved && <div className="rcard"><p className="small">Experiments start after you approve a plan.</p></div>}
      <div className="tbl-wrap">
        <table className="dtable exp-table">
          <thead><tr><th>Group</th><th>Mode</th><th>Champion</th><th>Challenger</th><th>Test</th><th>Status</th></tr></thead>
          <tbody>{L.rows.map((r) => (
            <tr key={r.group}>
              <td>{groupLabel(r.group)}</td>
              <td><ModeChip mode={r.mode.mode} days={r.mode.days} />{r.mode.mode === 'playbook' && <span className="sub">your proof ~day {r.mode.days}</span>}</td>
              <td><OfferChip offer={r.champion} /></td>
              <td>{r.challenger ? <OfferChip offer={r.challenger} /> : null}{r.reason && <span className="sub">{r.reason}</span>}</td>
              <td>{r.trafficShare ? <>{pctOf(1 - r.trafficShare, 0)} / {pctOf(r.trafficShare, 0)} split</> : r.daysRunning ? 'ended' : '—'}{r.daysRunning > 0 && <span className="sub">{num(r.daysRunning)} days run</span>}{r.decisionDate && r.status !== 'none' && <span className="sub">decision {fmtDate(r.decisionDate, false)}{r.daysToDecision && r.status === 'running' ? ` (in ${r.daysToDecision} days)` : ''}</span>}</td>
              <td>{r.status === 'none' ? '—' : <span className={`status ${r.status === 'promoted' ? 'ok' : r.status === 'running' ? 'info' : r.status === 'retired' ? '' : 'warn'}`}>{STATUS[r.status]}</span>}{r.lastRefreshed && r.status !== 'none' && <span className="sub">refreshed {fmtDate(r.lastRefreshed, false)} 06:00</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {big?.read && <ReadCard title={`${offerLabel('flat_200')} vs ${offerLabel('flat_150')} · ${groupLabel('new_ads_big')}`} read={big.read} rule />}
      {org?.read && <ReadCard title={`${offerLabel('free_shipping')} vs ${offerLabel('free_shipping_999')} · ${groupLabel('new_organic')}`} read={org.read} />}
      {pre?.read && <ReadCard title={`${offerLabel('free_shipping')} vs ${offerLabel('free_shipping_prepaid')} · ${groupLabel('new_ads_small')}`} read={pre.read} rto={pre.rto} />}
      {(big?.status === 'waiting' || L.rows.some((r) => r.status === 'proposed')) && <div><button className="btn primary sm" onClick={() => nav('/studio/smart-offers?tab=reviews')}>Decide in the weekly review →</button></div>}
      <div className="rcard">
        <div className="rc-h"><b>Re-test triggers</b><span className="muted small">any of these re-opens a group for testing</span></div>
        <ul className="triggers">{L.triggers.map((t) => (
          <li key={t.id} className={t.fired ? 'fired' : ''}>
            <span className="tr-ic" aria-hidden="true">{t.fired ? '●' : '○'}</span>
            <b>{t.label}</b>
            <span className="small">{t.fired && t.date ? `${t.projected ? 'expected' : 'fired'} ${fmtDate(t.date, false)}${t.projected && t.day !== null && t.day > now ? ' (proj.)' : ''}: ` : 'not fired: '}{t.detail}</span>
          </li>
        ))}</ul>
        <p className="small muted">Lift decay is checked every 4 weeks per group; a re-test starts the champion again against a fresh challenger, inside your experiment space.{decay && LEARNING_DAYS.decayCheck > now ? ` Next check ${fmtDate(decay.date, false)}.` : ''}</p>
      </div>
    </div>
  );
}
