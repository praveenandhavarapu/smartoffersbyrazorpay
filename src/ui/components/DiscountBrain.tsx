/** v2 §9: "Decisions served to other agents" — Smart Offers as the discount policy every Razorpay agent checks. */
import { useMemo, useState } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { DEMO_DATES, toUnix } from '../../lib/dates';
import { dateTimeIST, inr, inrSigned, num, pctOf } from '../../lib/format';
import { groupLabel } from '../../lib/labels';
import { generateRequests } from '../../data/generator/agentDecisions';
import { answer, brainSummary } from '../../engine/discountBrain';
import { OfferChip } from './bits';

export const BRAIN_LINE = 'One discount brain for every Razorpay touchpoint: checkout, abandoned-cart recovery, payment links. Agents can only offer what Smart Offers authorises.';

export function DiscountBrain() {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const moment = useStore((s) => s.moment);
  const [api, setApi] = useState(false);
  const answers = useMemo(() => {
    const end = toUnix(DEMO_DATES[moment]) + 6 * 3600;
    return generateRequests(model.groups, end).map((r) => answer(r, derived.learning?.groupsV2 ?? model.groups, derived.liveOffers, derived.margin, derived.kept, groupLabel, killed));
  }, [model, derived, moment, killed]);
  if (!approved) return <p className="st-p">{BRAIN_LINE} Starts when you approve a plan: Cart Abandonment will ask Smart Offers before offering any discount.</p>;
  const s = brainSummary(answers, derived.learning?.groupsV2 ?? model.groups);
  const neha = answers.find((a) => a.shopper === 'Neha')!;
  const rows = answers.slice(0, 20);
  const contract = {
    request: { channel: 'abandoned_cart', shopper_group: neha.group, cart_value: neha.cartInr, requested_offer: neha.asked },
    response: { decision: neha.decision === 'none' ? 'no_offer' : neha.decision, reason: neha.reason, recovery_without: Number(neha.recoveryWithout.toFixed(2)), recovery_with: Number(neha.recoveryWith.toFixed(2)), expected_profit_change: Math.round(neha.expectedProfitChange), holdout: neha.holdout, decision_id: neha.decisionId },
  };
  return (
    <div className="brain">
      <p className="st-p">{BRAIN_LINE} The {model.profile.holdoutPct}% holdout applies to recovery decisions too.</p>
      <div className="brain-kpis">
        <div><span>Requests this month</span><b>{num(s.requests)}</b><em>from Cart Abandonment (simulated)</em></div>
        <div><span>Answered "no discount needed"</span><b>{pctOf(s.noDiscountShare, 0)}</b><em>incl. {num(s.holdout)} in the holdout</em></div>
        <div><span>Discount avoided</span><b>{inr(s.discountAvoided)}</b><em>expected, vs giving what was asked</em></div>
        <div><span>Recoveries</span><b>{num(s.recoveries)}</b><em>expected carts won back</em></div>
      </div>
      <div className="tbl-wrap st-table">
        <table className="dtable dark">
          <thead><tr><th>Time · agent</th><th>Shopper group</th><th>Cart</th><th>Asked</th><th>Answer</th><th>Reason</th><th>Holdout</th></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.id}>
              <td className="nowrap">{dateTimeIST(a.at).replace(/ 2026,/, ',')}<span className="sub">{a.agent}</span></td>
              <td>{a.shopper ? `${a.shopper} · ` : ''}{groupLabel(a.group)}</td><td>{inr(a.cartInr)}</td><td>{a.askedText}</td>
              <td><OfferChip offer={a.decision} /></td><td className="act">{a.reason}</td><td>{a.holdout ? 'yes' : 'no'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="small st-p">Recovery rates are illustrative assumptions for this concept; requests are synthetic. Expected profit change per request for {neha.shopper}: {inrSigned(neha.expectedProfitChange)}.</p>
      <button className="btn dark sm" onClick={() => setApi(!api)} aria-expanded={api}>{api ? 'Hide' : 'Show'} API contract (illustrative)</button>
      {api && <pre className="api">{`POST /v1/smart-offers/decide\n${JSON.stringify(contract.request, null, 2)}\n→ ${JSON.stringify(contract.response, null, 2)}`}</pre>}
    </div>
  );
}
