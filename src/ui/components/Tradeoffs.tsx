/**
 * v3 trade-offs the merchant chooses (nothing assumed): what more new customers or orders cost in profit,
 * and what a squeezed margin takes away. Every row is a real engine plan; "Use this" makes it a draft.
 */
import { useMemo, useState } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { inr, inrSigned, num, pctSigned, xr } from '../../lib/format';
import { groupLabel, offerLabel } from '../../lib/labels';
import { exploreBudget, growthFrontier, marginSqueeze, type FrontierPoint } from '../../engine/tradeoffs';
import type { GrowthMetric } from '../../engine/plan';

const sameGrowth = (p: FrontierPoint, budget: number, g: { metric: GrowthMetric; giveUpInr: number } | null | undefined) =>
  p.budget === budget && (p.growth?.giveUpInr ?? 0) === (g?.giveUpInr ?? 0) && (!p.growth || p.growth.metric === g?.metric);

export function useFrontier(metric: GrowthMetric) {
  const { derived } = useModel();
  const settings = useStore((s) => s.settings);
  return useMemo(() => growthFrontier(derived.planGroups, derived.planSettingsFor({ ...settings, growth: null }), metric, exploreBudget(settings.budget)), [derived, settings, metric]);
}

function stepText(p: FrontierPoint): string {
  if (!p.changes.length) return 'Most profit (no trade-off)';
  return p.changes.map((c) => `${groupLabel(c.group)}: ${offerLabel(c.from)} → ${offerLabel(c.to)}${c.belowBreakEven ? ' (below break-even)' : ''}`).join('; ');
}

function Growth({ metric }: { metric: GrowthMetric }) {
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.setSettings);
  const f = useFrontier(metric);
  const unit = metric === 'orders' ? 'orders' : 'new customers';
  const last = f[f.length - 1];
  return (
    <>
      <p className="small">{f.length > 1
        ? <>From your most-profit plan, the engine adds offers where they bring the most {unit} per rupee of profit. Going all the way adds about <b>{num(metric === 'orders' ? last.extraOrders : last.extraNewCustomers)} {unit} a month</b> for <b>{inr(Math.max(0, last.giveUp))}</b> less profit{last.budget > settings.budget ? `, and needs a ${inr(last.budget)} budget` : ''}.</>
        : <>Within your budget and menu, no offer adds {unit} beyond the most-profit plan. A bigger menu (Recommended offers) or budget can.</>}</p>
      <div className="tbl-wrap">
        <table className="dtable compact tradeoff">
          <thead><tr><th>Option</th><th>Profit / month</th><th>{metric === 'orders' ? 'Orders / month' : 'New customers / month'}</th><th /></tr></thead>
          <tbody>{f.map((p, i) => {
            const cur = sameGrowth(p, settings.budget, settings.growth);
            return (
              <tr key={i} className={cur ? 'on' : ''}>
                <td>{i === 0 ? 'Most profit' : `Step ${i}`}<span className="sub">{stepText(p)}</span>{p.budget > settings.budget && <span className="sub warn">needs a {inr(p.budget)} budget</span>}</td>
                <td>{inrSigned(p.profit)}{i > 0 && <span className="sub">{p.giveUp >= 0 ? `${inr(p.giveUp)} less` : `${inr(-p.giveUp)} more`}</span>}</td>
                <td>{num(metric === 'orders' ? p.orders : p.newCustomers)}{i > 0 && <span className="sub">+{num(metric === 'orders' ? p.extraOrders : p.extraNewCustomers)}{p.costPerExtra !== null && p.costPerExtra > 0 ? ` · ${inr(p.costPerExtra)} each` : ''}</span>}<span className="sub">orders {pctSigned(p.ordersChangePct)} vs today</span></td>
                <td>{cur ? <span className="status ok">Current</span> : <button className="btn secondary sm" onClick={() => set({ budget: p.budget, growth: p.growth })}>Use this</button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </>
  );
}

function Squeeze() {
  const { derived } = useModel();
  const settings = useStore((s) => s.settings);
  const rows = useMemo(() => marginSqueeze(derived.planGroups, derived.planSettingsFor(settings), settings.keepPer1000), [derived, settings]);
  const firstLoss = rows.filter((r) => !r.current && r.keepPer1000 < settings.keepPer1000 && r.lost.length).sort((a, b) => b.keepPer1000 - a.keepPer1000)[0];
  return (
    <>
      <p className="small">If you keep less of each sale, offers stop paying back.{firstLoss ? <> First to go at {inr(firstLoss.keepPer1000)}: <b>{firstLoss.lost.map((l) => `${groupLabel(l.group)} (${offerLabel(l.from)})`).join(', ')}</b>.</> : null} The last column is the hit you'd take to keep today's new customers anyway.</p>
      <div className="tbl-wrap">
        <table className="dtable compact tradeoff">
          <thead><tr><th>You keep per ₹1,000</th><th>Profit / month</th><th>New customers</th><th>Keep today's new customers</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.keepPer1000} className={r.current ? 'on' : ''}>
              <td>{inr(r.keepPer1000)}{r.current && ' (yours)'}<span className="sub">break-even {xr(r.breakEven)} · {r.offersOn} of 6 groups get an offer</span></td>
              <td>{inrSigned(r.profit)}</td>
              <td>{num(r.newCustomers)}</td>
              <td>{r.current ? '—' : r.keepGrowthCost === null ? <span className="muted">not within budget</span> : r.keepGrowthCost < 1 ? 'no cost' : <>give up {inr(r.keepGrowthCost)}<span className="sub">a month</span></>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

export function TradeoffCard({ initial = 'growth' }: { initial?: 'growth' | 'margin' }) {
  const [tab, setTab] = useState<'growth' | 'margin'>(initial);
  const [metric, setMetric] = useState<GrowthMetric>('new_customers');
  return (
    <div className="rcard tradeoffs" id="tradeoff-card">
      <div className="rc-h"><b>Trade-offs you choose</b><span className="muted small">real engine plans · nothing changes until you approve</span></div>
      <div className="seg sm" role="tablist">
        <button role="tab" aria-selected={tab === 'growth'} className={tab === 'growth' ? 'on' : ''} onClick={() => setTab('growth')}>Grow more, earn less</button>
        <button role="tab" aria-selected={tab === 'margin'} className={tab === 'margin' ? 'on' : ''} onClick={() => setTab('margin')}>If my margin is squeezed</button>
      </div>
      {tab === 'growth' && (
        <>
          <div className="seg sm">
            <button className={metric === 'new_customers' ? 'on' : ''} onClick={() => setMetric('new_customers')}>More new customers</button>
            <button className={metric === 'orders' ? 'on' : ''} onClick={() => setMetric('orders')}>More orders</button>
          </div>
          <Growth metric={metric} />
        </>
      )}
      {tab === 'margin' && <Squeeze />}
      <p className="footnote">Same budget rules, offer menu, max discount and minimum return as your plan. "Use this" sets the budget and how much profit to give up; it's a draft until you approve.</p>
    </div>
  );
}
