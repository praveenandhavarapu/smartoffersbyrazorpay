import { useState } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { inr, inrSigned, num, pctSigned, xr } from '../../lib/format';
import { explainGroup } from '../../engine/explain';
import { Check, Shield } from './Icons';
import { OfferChip, shortGroup } from './bits';
import { HoldoutNote } from './lifecycle';

export function PlanCard({ onAsk }: { onAsk?: (q: string) => void }) {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  const approve = useStore((s) => s.approve);
  const settings = useStore((s) => s.settings);
  const [compare, setCompare] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const p = derived.draft;
  const allNone = p.rows.every((r) => r.offer === 'none');
  const chosenForProfit = p.rows.find((r) => r.group === 'new_ads_big' && r.offer === 'flat_200');

  return (
    <div className="plan" id="plan-card">
      <div className="plan-head">
        <div className="plan-title">Smart Offers plan · {model.profile.displayName}</div>
        <span className={`pill ${approved ? 'live' : 'blue'}`}>{approved ? <><i />Approved</> : 'Draft · recalculates live'}</span>
      </div>
      {allNone && <p className="plan-note warn">At {num(derived.margin * 100)}% margin no offer pays back; the honest plan is no offers.</p>}
      {p.infeasible && (
        <p className="plan-note warn">
          Can't keep orders within {settings.ordersFloorPct}% at break-even within budget. Best reachable: {pctSigned(p.infeasible.bestChangePct)}.
          {p.infeasible.raiseBudgetTo ? ` Raising the budget to ${inr(p.infeasible.raiseBudgetTo)} would reach it.` : ' No budget up to ₹10,00,000 reaches it at break-even.'} Or switch the goal to Most profit.
        </p>
      )}
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Shopper group</th><th>Buys without offer</th><th>Offer</th><th>Return</th><th>Profit / month</th></tr></thead>
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
                  <tr key={r.group + '-why'} className="why-row show"><td colSpan={5}>{explainGroup(g, r, derived.margin)}</td></tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {chosenForProfit && <p className="plan-note">Big new carts get ₹200 off at {xr(chosenForProfit.ret)} even though ₹100 off has a higher ratio: it makes more profit. <b>Chosen for profit, not ratio.</b></p>}
      <div className="totals">
        <div><div className="s">Offer spend</div><div className="v">{inr(p.spend)}</div><div className="s">of {inr(settings.budget)} budget</div></div>
        <div><div className="s">Extra sales</div><div className="v">{inr(p.extraSales)}</div><div className="s">{num(p.extraOrders, 1)} extra orders</div></div>
        <div><div className="s">Return</div><div className="v">{p.spend ? xr(p.ret) : '—'}</div><div className="s">{p.spend ? `likely ${xr(derived.range.retLow)}–${xr(derived.range.retHigh)}` : 'no spend'}</div></div>
        <div><div className="s">Extra profit / month</div><div className="v good">{inrSigned(p.profit)}</div><div className="s">ALPHA10 today: {inrSigned(derived.a10AtMargin.profit)}</div></div>
      </div>
      <p className="plan-note">Orders per month: {num(p.orders)} ({pctSigned(p.ordersChangePct)} vs today's {num(derived.storeOrders.today)}). Offers you stop were mostly paying buyers who'd buy anyway.</p>
      <HoldoutNote />
      <div className="guards">
        {['Max ₹250 off per order', 'One offer per order', `Budget hard stop ${inr(settings.budget)}`, '10% holdout gets no offer', settings.festiveWindow ? "No offers on Festive Drop '26 (7 days)" : 'No festive window', 'Creator codes: report only'].map((g) => (
          <span key={g} className="guard"><Shield />{g}</span>
        ))}
      </div>
      <div className="compare">
        <label className="switch"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with a simple rule</label>
        {compare && (
          <div className="compare-grid">
            <div><div className="s">Rule: "ALPHA10 for first orders only"</div><div className="v">{inrSigned(derived.rule.profit)}</div><div className="s">{xr(derived.rule.ret)} on the same 90% of shoppers</div></div>
            <div><div className="s">Smart Offers engine</div><div className="v good">{inrSigned(p.profit)}</div><div className="s">{p.spend ? xr(p.ret) : '—'}: picks per group, drops offers that don't pay back</div></div>
          </div>
        )}
      </div>
      <div className="plan-actions">
        {approved ? (
          <span className="pill live"><Check width={14} /> Live since approval</span>
        ) : (
          <button className="btn primary" onClick={approve} disabled={allNone}>Approve &amp; go live</button>
        )}
        <a href="#setup-card" className="btn secondary">Edit</a>
        {onAsk && <button className="btn ghost" onClick={() => onAsk('What if my margin is 30%?')}>What if margin is 30%?</button>}
      </div>
    </div>
  );
}
