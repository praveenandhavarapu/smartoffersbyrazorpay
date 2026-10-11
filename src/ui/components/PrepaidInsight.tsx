/** v2 §10.1: a blanket prepaid discount mostly pays shoppers who'd prepay anyway. Every number computed. */
import { useState } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { inr, inrSigned, pctOf } from '../../lib/format';
import { groupLabel, offerLabel } from '../../lib/labels';
import { blanketPrepaid, PREPAID, rtoSavedPer100 } from '../../engine/paymentAware';
import { KEYS } from '../../engine/learning';

export function PrepaidInsight({ compact }: { compact?: boolean }) {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  const decision = useStore((s) => s.learningDecisions[KEYS.prepaidTest]);
  const decide = useStore((s) => s.decideLearning);
  const [confirm, setConfirm] = useState(false);
  const b = blanketPrepaid(model.groups, derived.margin);
  const n = b.rows.length;
  const head = b.paying.length === 0
    ? `A blanket ${inr(PREPAID.nudgeInr)} prepaid discount would lose money in all ${n} groups: it mostly pays shoppers who'd pay prepaid anyway.`
    : `A blanket ${inr(PREPAID.nudgeInr)} prepaid discount would lose money in ${b.losing.length} of ${n} groups: it mostly pays shoppers who'd pay prepaid anyway. It pays only for ${b.paying.map(groupLabel).join(', ')}, where COD is the norm.`;
  const small = b.rows.find((r) => r.group === 'new_ads_small')!;
  return (
    <div className={`card ${compact ? '' : 'pad'} prepaid`}>
      <span className="mono-tag amber">Payment-aware · insight</span>
      <h5>{head}</h5>
      {!compact && (
        <div className="tbl-wrap">
          <table className="dtable compact">
            <thead><tr><th>Group</th><th>Prepaid today → with ₹{PREPAID.nudgeInr} off</th><th>Discount cost / month</th><th>Failed deliveries saved / month</th><th>Net</th></tr></thead>
            <tbody>{b.rows.map((r) => <tr key={r.group}><td>{groupLabel(r.group)}</td><td>{pctOf(r.p0, 0)} → {pctOf(r.p1, 0)}</td><td>{inr(r.cost)}</td><td>{inr(r.benefit)}</td><td className={r.pays ? 'good' : 'bad'}>{inrSigned(r.net)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="small">Better lever: keep one offer per order and make the free shipping that small ad carts already get <b>prepaid only</b>. Prepaid share {pctOf(small.p0, 0)} → {pctOf(small.p1, 0)}, about {rtoSavedPer100('new_ads_small', true).toFixed(1)} failed deliveries avoided per 100 orders.</p>
      <p className="small muted">COD orders fail {pctOf(PREPAID.rtoCod, 0)} of the time here vs {pctOf(PREPAID.rtoPrepaid, 0)} prepaid (assumption); a failed delivery costs {inr(PREPAID.rtoCostInr)} plus half the lost sale's margin. Prepaid shares are synthetic.</p>
      {approved && (decision ? <span className={`small ${decision === 'approved' ? 'good' : 'muted'}`}>{decision === 'approved' ? `${offerLabel('free_shipping_prepaid')} test approved: runs on 15% of ${groupLabel('new_ads_small')} shoppers` : 'Not now'}</span>
        : !confirm ? <button className="btn secondary sm" onClick={() => setConfirm(true)}>Test "{offerLabel('free_shipping_prepaid')}" for {groupLabel('new_ads_small')}</button>
        : <span className="pb-confirm"><span className="small">Changes payment terms for 15% of that group's treated shoppers, so it needs your OK.</span><button className="btn primary sm" onClick={() => decide(KEYS.prepaidTest, 'approved', `Started "${offerLabel('free_shipping_prepaid')}" vs "${offerLabel('free_shipping')}" for ${groupLabel('new_ads_small')}`)}>Approve test</button><button className="btn ghost sm" onClick={() => setConfirm(false)}>Cancel</button></span>)}
    </div>
  );
}
