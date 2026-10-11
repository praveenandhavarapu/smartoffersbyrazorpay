/**
 * v2 §8: Network playbook "Stores like yours" — what WORKED in offer tests at similar stores, beside this store's own result.
 * Illustrative synthetic network data; aggregates of ≥ 20 stores; never what other stores charge, never store names.
 */
import { useState } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { num, pctOf } from '../../lib/format';
import { groupLabel } from '../../lib/labels';
import { playbook, playbookFor, PEER_DEFINITION, PLAYBOOK_FOOTER, type PlaybookRow } from '../../data/network/playbook';
import { KEYS } from '../../engine/learning';
import { FEATURES } from '../../config/features';
import type { GroupId, OfferId } from '../../data/types';

const pp = (x: number) => `${x >= 0 ? '+' : ''}${num(x, 1)} pp`;

/** This store's measured lift for a group × offer today (null if it hasn't run here). */
function useYourStore() {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  return (group: GroupId, offer: OfferId | 'early_access') => {
    if (!approved || !derived.today) return null;
    const row = derived.snapshots[derived.today].rows.find((r) => r.group === group && r.offer === offer);
    const g = model.groups.find((x) => x.id === group)!;
    if (!row) return { estimate: offer !== 'early_access' ? g.priorLiftsPp[offer] ?? null : null };
    return { measured: row.lift * 100, low: row.liftLow * 100, high: row.liftHigh * 100, days: row.treatedCheckouts + row.holdoutCheckouts, learning: row.stillLearning };
  };
}

/** Side-by-side "Playbook · Your store" for one row's Why? drawer. */
export function WhyPlaybook({ group, offer }: { group: GroupId; offer: OfferId }) {
  const { model, derived } = useModel();
  const your = useYourStore();
  const pb = playbookFor(group, offer);
  if (!pb || offer === 'none') return null;
  const y = your(group, offer);
  const lo = model.pool.p25[group]?.[offer], hi = model.pool.p75[group]?.[offer];
  return (
    <div className="pb-side">
      <div><span className="pb-k">Playbook ({num(model.pool.size)} stores like yours)</span><b>{pp(pb.medianLiftPp)}</b><span className="small">{lo !== undefined && hi !== undefined ? `typical ${num(lo, 1)}–${num(hi, 1)} pp · ` : ''}beat no offer in {pb.beatNoOfferPct}% of {pb.storesTested} tests</span></div>
      <div><span className="pb-k">Your store{derived.today ? ` · day ${derived.snapshots[derived.today].days}` : ''}</span>{y && 'measured' in y && y.measured !== undefined ? <><b>{pp(y.measured)}</b><span className="small">90% range {num(y.low!, 1)} to {num(y.high!, 1)} pp{y.learning ? ' · still learning' : ''}</span></> : <><b>—</b><span className="small">not measured yet; the holdout measures it once it runs</span></>}</div>
    </div>
  );
}

function AddChallenger({ row }: { row: PlaybookRow }) {
  const decisions = useStore((s) => s.learningDecisions);
  const decide = useStore((s) => s.decideLearning);
  const approved = useStore((s) => s.approved);
  const [confirm, setConfirm] = useState(false);
  const key = row.group === 'new_organic' && row.offer === 'free_shipping_999' ? KEYS.organicTest
    : FEATURES.paymentAware && row.group === 'new_ads_small' && row.offer === 'free_shipping_prepaid' ? KEYS.prepaidTest : `pb:${row.group}:${row.offer}`;
  const d = decisions[key];
  if (d) return <span className={`status ${d === 'approved' ? 'ok' : ''}`}>{d === 'approved' ? (key === KEYS.organicTest || key === KEYS.prepaidTest ? 'running as challenger' : 'queued as next challenger') : 'not now'}</span>;
  if (!approved) return <span className="muted small">after you approve a plan</span>;
  if (!row.inMenu && !confirm) return <button className="btn secondary sm" onClick={() => setConfirm(true)}>Add as challenger</button>;
  if (!row.inMenu) {
    return (
      <span className="pb-confirm">
        <span className="small">Needs your OK to add to your offer menu.</span>
        <button className="btn primary sm" onClick={() => decide(key, 'approved', `Added "${row.label}" to the offer menu as a challenger for ${groupLabel(row.group)}`)}>Add to menu and test</button>
        <button className="btn ghost sm" onClick={() => setConfirm(false)}>Cancel</button>
      </span>
    );
  }
  return <button className="btn secondary sm" onClick={() => decide(key, 'approved', `Queued "${row.label}" as the next challenger for ${groupLabel(row.group)}`)}>Add as challenger</button>;
}

/** Card for Setup & plan: the benchmark table, this store beside it, and offers it hasn't tried. */
export function PlaybookCard() {
  const { model, derived } = useModel();
  const your = useYourStore();
  const give = useStore((s) => s.giveToGet);
  const setGive = useStore((s) => s.setGiveToGet);
  const rows = playbook();
  const current = derived.liveOffers;
  const tried = (g: GroupId, o: OfferId | 'early_access') => current[g] === o || (g === 'new_ads_big' && o === 'flat_150' && derived.learning?.flags.bigRunning);
  // Suggest only what usually works (beat no offer in most tests) or a non-cash perk; never re-suggest what's running.
  const notTried = rows.filter((r) => !tried(r.group, r.offer) && (r.beatNoOfferPct === null || r.beatNoOfferPct >= 50));
  return (
    <div className="rcard playbook">
      <div className="rc-h"><span className="mono-tag">Playbook · {num(model.pool.size)} stores like yours</span><span className="muted small">vs your store</span></div>
      <p className="small muted">{PEER_DEFINITION}</p>
      <div className="tbl-wrap">
        <table className="dtable compact">
          <thead><tr><th>Group</th><th>Offer</th><th>Stores tested</th><th>Beat no offer</th><th>Median lift</th><th>Your store</th></tr></thead>
          <tbody>{rows.map((r) => {
            const y = your(r.group, r.offer);
            return (
              <tr key={`${r.group}-${r.offer}`}>
                <td>{groupLabel(r.group)}</td>
                <td>{r.label}{!r.inMenu && <span className="sub">not on your menu</span>}</td>
                <td>{num(r.storesTested)}</td>
                <td>{r.beatNoOfferPct === null ? '—' : pctOf(r.beatNoOfferPct / 100, 0)}</td>
                <td>{pp(r.medianLiftPp)}{r.note && <span className="sub">{r.note}</span>}</td>
                <td>{y && 'measured' in y && y.measured !== undefined ? <>{pp(y.measured)}<span className="sub">measured · {num(y.low!, 1)} to {num(y.high!, 1)}</span></> : current[r.group] === r.offer ? <span className="sub">running; measured after go-live</span> : <span className="muted">not run here</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="pb-try">
        <b>Offers you haven't tried</b>
        {notTried.map((r) => (
          <div key={`${r.group}-${r.offer}`} className="pb-try-row">
            <span>{groupLabel(r.group)}: <b>{r.label}</b> <span className="small muted">{pp(r.medianLiftPp)}{r.beatNoOfferPct !== null ? `, beat no offer in ${r.beatNoOfferPct}% of ${r.storesTested} stores` : ` in ${r.storesTested} stores`}{r.note ? ` (${r.note})` : ''}</span></span>
            <AddChallenger row={r} />
          </div>
        ))}
      </div>
      <label className="space-row"><input type="checkbox" checked={give} onChange={(e) => setGive(e.target.checked)} /><span>Give-to-get: stores that share anonymised results get the playbook.</span></label>
      <p className="small muted">{PLAYBOOK_FOOTER} What worked in tests, not what others charge. Aggregates of 20 or more stores; no store names.</p>
    </div>
  );
}
