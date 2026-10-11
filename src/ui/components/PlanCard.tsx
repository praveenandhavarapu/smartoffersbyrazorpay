import { useState } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { inr, inrSigned, num, pctSigned, xr } from '../../lib/format';
import { fmtDate } from '../../lib/dates';
import { explainGroup } from '../../engine/explain';
import { MAX_DISCOUNT_PER_ORDER } from '../../engine/guardrails';
import { RETURN_LABEL } from '../../engine/net';
import { FEATURES } from '../../config/features';
import { groupLabel, offerLabel } from '../../lib/labels';
import { Check, Shield } from './Icons';
import { OfferChip, shortGroup } from './bits';
import { HoldoutNote } from './lifecycle';
import { WhyPlaybook } from './Playbook';

/** Yellow "Draft · not live" bar: what changes, and the only two ways out (Approve changes / Discard). */
function DraftBar() {
  const { derived } = useModel();
  const approveChanges = useStore((s) => s.approveChanges);
  const discard = useStore((s) => s.discardDraft);
  if (!derived.hasDraft) return null;
  return (
    <div className="draft-bar" role="status">
      <b>Draft · not live. Live numbers on every other screen are unchanged until you approve.</b>
      <ul>{derived.draftDiff.map((d) => <li key={d}>{d}</li>)}</ul>
      <span className="small">Plan profit {inrSigned(derived.live.profit)} → {inrSigned(derived.draft.profit)} a month · spend {inr(derived.live.spend)} → {inr(derived.draft.spend)}</span>
      <div className="btns">
        <button className="btn primary sm" onClick={() => approveChanges(derived.draftDiff.join('; '))}>Approve changes</button>
        <button className="btn secondary sm" onClick={discard}>Discard</button>
      </div>
    </div>
  );
}

export function PlanCard({ onAsk }: { onAsk?: (q: string) => void }) {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  const approve = useStore((s) => s.approve);
  const approvedOn = useStore((s) => s.approvedOn);
  const space = useStore((s) => s.experimentSpace);
  const setSpace = useStore((s) => s.setExperimentSpace);
  const draftSettings = useStore((s) => s.settings);
  const [compare, setCompare] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const v2 = FEATURES.netReturns;
  // Approved and no pending edits: show what is live. Otherwise show the draft.
  const showLive = v2 && approved && !derived.hasDraft;
  const p = showLive ? derived.live : derived.draft;
  const settings = showLive ? derived.liveSettings : draftSettings;
  const margin = showLive ? derived.margin : derived.draftMargin;
  const range = showLive ? derived.liveRange : derived.range;
  const por = showLive ? derived.profitOverRatio : derived.draftProfitOverRatio;
  const cmp = showLive ? derived.comparison : derived.draftComparison;
  const allNone = p.rows.every((r) => r.offer === 'none');
  const v1Chosen = p.rows.find((r) => r.group === 'new_ads_big' && r.offer === 'flat_200');
  const pill = !approved ? <span className="pill blue">Draft · recalculates live</span>
    : !v2 ? <span className="pill live"><i />Approved</span>
    : derived.hasDraft ? <span className="pill draft">Draft · not live</span>
    : <span className="pill live"><i />Approved · Live since {approvedOn ? fmtDate(approvedOn, false) : '—'}</span>;

  return (
    <div className="plan" id="plan-card">
      <div className="plan-head">
        <div className="plan-title">Smart Offers plan · {model.profile.displayName}</div>
        {pill}
      </div>
      {v2 && <DraftBar />}
      {allNone && <p className="plan-note warn">At {num(margin * 100)}% margin no offer pays back; the honest plan is no offers.</p>}
      {p.infeasible && (
        <p className="plan-note warn">
          Can't keep orders within {settings.ordersFloorPct}% at break-even within budget. Best reachable: {pctSigned(p.infeasible.bestChangePct)}.
          {p.infeasible.raiseBudgetTo ? ` Raising the budget to ${inr(p.infeasible.raiseBudgetTo)} would reach it.` : ' No budget up to ₹10,00,000 reaches it at break-even.'} Or switch the goal to Most profit.
        </p>
      )}
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Shopper group</th><th>Buys without offer</th><th>Offer</th><th>{RETURN_LABEL}</th><th>Profit / month</th></tr></thead>
          <tbody>
            {p.rows.map((r) => {
              const g = model.groups.find((x) => x.id === r.group)!;
              return [
                <tr key={r.group}>
                  <td>{shortGroup(r.label)}<span className="sub">{num(g.checkouts)} checkouts / month</span></td>
                  <td>{num(g.baseConversion * 100)} in 100</td>
                  <td><OfferChip offer={r.offer} />{r.overridden && <span className="sub">override</span>}</td>
                  <td>{r.offer === 'none' ? '—' : xr(r.ret)}</td>
                  <td>
                    {r.offer === 'none' ? '—' : inrSigned(r.profit)}
                    <button className="whyl" onClick={() => setWhy(why === r.group ? null : r.group)} aria-expanded={why === r.group}>Why?</button>
                  </td>
                </tr>,
                why === r.group && (
                  <tr key={r.group + '-why'} className="why-row show"><td colSpan={5}>{explainGroup(g, r, margin, p.settings.keptRate ?? 1)}{FEATURES.playbook && <WhyPlaybook group={r.group} offer={r.offer} />}</td></tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {v2 ? (por && <p className="plan-note">{groupLabel(por.group)} get {offerLabel(por.offer)} at {xr(por.ret)} even though {offerLabel(por.alt)} has a higher ratio ({xr(por.altRet)}): it makes {inr(por.extraProfitMonth)} more a month. <b>Chosen for profit, not ratio.</b></p>)
        : (v1Chosen && <p className="plan-note">Big new carts get ₹200 off at {xr(v1Chosen.ret)} even though ₹100 off has a higher ratio: it makes more profit. <b>Chosen for profit, not ratio.</b></p>)}
      <div className="totals">
        <div><div className="s">Offer spend</div><div className="v">{inr(p.spend)}</div><div className="s">of {inr(settings.budget)} budget</div></div>
        <div><div className="s">Extra sales</div><div className="v">{inr(p.extraSales)}</div><div className="s">{num(p.extraOrders)} extra orders</div></div>
        <div><div className="s">{RETURN_LABEL}</div><div className="v">{p.spend ? xr(p.ret) : '—'}</div><div className="s">{p.spend ? `likely ${xr(range.retLow)}–${xr(range.retHigh)} · break-even ${xr(1 / margin)}` : 'no spend'}</div></div>
        <div><div className="s">Extra profit / month{v2 ? ' after returns' : ''}</div><div className="v good">{inrSigned(p.profit)}</div><div className="s">ALPHA10 today: {inrSigned(showLive ? derived.a10.profit : derived.a10AtMargin.profit)}</div></div>
      </div>
      <p className="plan-note">Orders per month: {num(p.orders)} ({pctSigned(p.ordersChangePct)} vs today's {num(derived.storeOrders.today)}). Offers you stop were mostly paying buyers who'd buy anyway.</p>
      <HoldoutNote which={showLive ? 'live' : 'draft'} />
      <div className="guards">
        {[`Max ${inr(Math.min(settings.maxDiscountInr, MAX_DISCOUNT_PER_ORDER))} off per order`, 'One offer per order', `Budget hard stop ${inr(settings.budget)}`, `${model.profile.holdoutPct}% holdout gets no offer`, settings.festiveWindow ? `No offers on ${model.profile.upcomingDrop.name} (${model.profile.upcomingDrop.fullPriceDays} days)` : 'No festive window', 'Creator codes: report only'].map((g) => (
          <span key={g} className="guard"><Shield />{g}</span>
        ))}
      </div>
      <div className="compare">
        <label className="switch"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with a simple rule</label>
        {compare && (
          <div className="compare-grid">
            <div><div className="s">Rule: "ALPHA10 for first orders only"</div><div className="v">{inrSigned(v2 ? cmp.rows[1].profit : derived.rule.profit)}</div><div className="s">{xr(v2 ? cmp.rows[1].ret : derived.rule.ret)} on the same {num(cmp.coverage * 100)}% of shoppers{v2 ? `, same ${inr(cmp.budget)} budget` : ''}</div></div>
            <div><div className="s">Smart Offers engine</div><div className="v good">{inrSigned(p.profit)}</div><div className="s">{p.spend ? xr(p.ret) : '—'}: picks per group, drops offers that don't pay back</div></div>
          </div>
        )}
      </div>
      {FEATURES.experiments && (
        <label className="space-row">
          <input type="checkbox" checked={space} onChange={(e) => setSpace(e.target.checked)} />
          <span><b>Let the agent test challengers</b>: up to 15% of a group's shoppers, only offers from your menu, within your budget and max discount.{approved ? ` ${space ? 'On' : 'Off'} since your approval.` : ' Approved together with the plan.'}</span>
        </label>
      )}
      <div className="plan-actions">
        {approved ? (
          derived.hasDraft ? <span className="pill draft">Approve or discard the draft above</span> : <span className="pill live"><Check width={14} /> Live since approval</span>
        ) : (
          <button className="btn primary" onClick={approve} disabled={allNone}>Approve &amp; go live</button>
        )}
        <a href="#setup-card" className="btn secondary">Edit</a>
        {onAsk && <button className="btn ghost" onClick={() => onAsk('What if my margin is 30%?')}>What if margin is 30%?</button>}
      </div>
    </div>
  );
}
