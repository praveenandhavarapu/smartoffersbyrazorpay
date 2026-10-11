/** Impact: north star, merchant outcomes, adoption funnel, engagement, model accuracy, guardrails, Razorpay targets. */
import { useMemo, type ReactNode } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { useLedger } from '../../state/useLedger';
import { accuracyRows, accuracySummary } from '../../engine/accuracy';
import { buildCheckoutTable, decide, SAMPLE_SHOPPERS } from '../../engine/checkoutTable';
import { dailyRuns } from '../../engine/runs';
import { CHECKOUT_BUDGET_MS, DAILY_SPEND_CAP } from '../../engine/guardrails';
import { TARGETS } from '../../engine/targets';
import { PILOT_TRUTH } from '../../data/fixtures';
import { NEW_GROUPS } from '../../data/types';
import { DEMO_DATES, toUnix } from '../../lib/dates';
import { inr, inrSigned, num, pctOf, xr } from '../../lib/format';
import { MonoTag } from './bits';
import { FEATURES } from '../../config/features';
import { HeroMetric } from './HeroMetric';
import { TABLE_NAME } from './HowAIWorks';

type Row = { metric: string; now: ReactNode; target: ReactNode; why: string; ok?: boolean | null };

function Table({ title, rows, note }: { title: string; rows: Row[]; note?: string }) {
  return (
    <section className="rcard">
      <div className="rc-h"><span className="mono-tag">{title}</span>{note && <span className="muted small">{note}</span>}</div>
      <div className="tbl-wrap">
        <table className="dtable compact">
          <thead><tr><th>Metric</th><th>Alpha now</th><th>Target</th><th>Why it matters</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.metric}>
              <td><b>{r.metric}</b></td>
              <td>{r.now}{r.ok === true && <span className="status ok tiny">on target</span>}{r.ok === false && <span className="status warn tiny">below target</span>}</td>
              <td className="muted">{r.target}</td>
              <td className="wrap">{r.why}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

export function ImpactView() {
  const { model, derived } = useModel();
  const st = useStore();
  const v = useLedger();
  const live = st.approved && st.moment !== 'before';
  const snap = FEATURES.netReturns ? derived.snapshots[derived.today ?? 'day20'] : st.moment === 'day30' ? derived.snapshots.day30 : derived.snapshots.day20;
  const monthly = (x: number) => (x * 30) / snap.days;
  const mix = snap.extraOrders ? snap.extraSales / snap.extraOrders : 0;
  const effMargin = FEATURES.netReturns ? derived.margin * derived.kept : 0.4;
  const profitLow = snap.extraOrdersLow * mix * effMargin - snap.spend;
  const profitHigh = snap.extraOrdersHigh * mix * effMargin - snap.spend;

  const acc = accuracySummary(accuracyRows(model.groups, snap, model.pool.p25, model.pool.p75));
  const latency = useMemo(() => {
    const table = buildCheckoutTable(derived.liveOffers);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 400; i++) for (const s of SAMPLE_SHOPPERS) { decide(table, s); n++; }
    return (performance.now() - t0) / n;
  }, [derived.liveOffers]);
  const runs = useMemo(() => (live ? dailyRuns(model.pilotSessions, PILOT_TRUTH.planOffers, derived.live.settings.budget, PILOT_TRUTH.alpha10RetiredOn, DEMO_DATES.day20) : []), [live, model, derived]);
  const capBreaches = runs.filter((r) => r.spend > DAILY_SPEND_CAP).length;

  const audit = st.audit;
  const decisions = Object.values(st.reviewDecisions);
  const approvedN = decisions.filter((d) => d === 'approved').length;
  const opened = derived.reviews.filter((r) => st.reviewsOpened.includes(r.id)).length;
  const overrides = Object.keys(st.overrides).length;
  const kills = audit.filter((a) => a.action === 'kill_switch').length;

  const salesBefore = derived.store.gmv;
  const shareBefore = derived.allCodes.spend / salesBefore;
  const creatorOnly = derived.allCodes.spend - derived.a10.spend;
  const shareAfter = (monthly(snap.spend) + creatorOnly) / salesBefore;

  const newG = model.groups.filter((g) => NEW_GROUPS.includes(g.id));
  const convBefore = newG.reduce((a, g) => a + g.checkouts * (g.baseConversion + g.today.reduce((t, u) => t + (u.share * u.liftPp) / 100, 0)), 0) / newG.reduce((a, g) => a + g.checkouts, 0);
  const nr = snap.rows.filter((r) => NEW_GROUPS.includes(r.group));
  const convNow = nr.reduce((a, r) => a + r.treatedOrders + r.holdoutOrders, 0) / nr.reduce((a, r) => a + r.treatedCheckouts + r.holdoutCheckouts, 0);

  const pilotFrom = toUnix('2026-09-21');
  const share = (pred: (o: (typeof v.orders)[number]) => boolean, from: number, to: number) => {
    const os = v.orders.filter((o) => o.created_at >= from && o.created_at < to);
    return os.length ? os.filter(pred).length / os.length : 0;
  };
  const baseFrom = toUnix('2026-08-22');
  const returnsBefore = share((o) => Boolean(o.notes.returned), baseFrom, pilotFrom);
  const returnsNow = share((o) => Boolean(o.notes.returned), pilotFrom, v.cutoff);
  const projectedSpend = monthly(snap.spend);
  const budget = derived.live.settings.budget;
  const na = <span className="muted">starts after go-live</span>;

  return (
    <div className="stack-gap impact">
      <section className="rcard north">
        <span className="mono-tag green">North star</span>
        <h3>Extra profit for the merchant{FEATURES.netReturns ? ' after returns' : ''}, measured against the holdout</h3>
        {live ? (
          <div className="north-v"><b>{inrSigned(monthly(snap.profit))}</b><span>a month (day {snap.days}) · 90% range {inrSigned(monthly(profitLow))} to {inrSigned(monthly(profitHigh))}</span></div>
        ) : <div className="north-v"><b>{inrSigned(FEATURES.netReturns ? derived.live.profit : derived.draft.profit)}</b><span>a month, planned (before launch, from similar stores)</span></div>}
        {FEATURES.heroMetric && <HeroMetric day={live ? derived.today : null} />}
        <p className="small muted">Why this metric: it is what the merchant keeps, it counts only orders the holdout proves were extra, and the fee is tied to it, so Razorpay earns only when the merchant does.</p>
      </section>

      <Table title="Merchant outcomes" rows={[
        ...(FEATURES.heroMetric ? [(() => {
          const cpo = live ? snap.metrics.costPerExtraOrder : derived.live.extraOrders ? derived.live.spend / derived.live.extraOrders : null;
          return { metric: 'Cost per extra order', now: cpo === null ? na : <>{inr(cpo)} <span className="sub">{live ? `day ${snap.days}` : 'planned'} · ALPHA10 {derived.a10CostPerOrder === null ? '—' : inr(derived.a10CostPerOrder)}</span></>, target: `below earned per extra order (${inr(derived.earnedPerOrder)})`, why: 'What a discount costs per order it actually creates, against what that order earns after returns.', ok: cpo === null ? null : cpo < derived.earnedPerOrder };
        })()] : []),
        { metric: FEATURES.netReturns ? 'Return after returns on offer spend' : 'Return on offer spend', now: live ? <>{xr(snap.ret)} <span className="sub">range {xr(snap.retLow)}–{xr(snap.retHigh)}</span></> : xr(FEATURES.netReturns ? derived.live.ret : derived.draft.ret), target: `≥ ${xr(derived.breakEven)} (break-even)`, why: 'Below break-even, every offer rupee loses money.', ok: live ? snap.ret >= derived.breakEven : null },
        { metric: 'Offers + coupons as % of sales', now: live ? <>{pctOf(shareAfter)} <span className="sub">was {pctOf(shareBefore)} with ALPHA10</span></> : pctOf(shareBefore), target: `< ${pctOf(TARGETS.discountShareMax, 0)}`, why: 'Discount waste shows up here first.', ok: live ? shareAfter < TARGETS.discountShareMax : null },
        { metric: 'Extra orders vs holdout', now: live ? <>{num(monthly(snap.extraOrders))} a month <span className="sub">proven at least {num(monthly(snap.extraOrdersLow))}</span></> : na, target: 'lower bound > 0', why: 'Proof that offers create orders, not just discount them.', ok: live ? snap.extraOrdersLow > 0 : null },
        { metric: 'New-shopper conversion', now: live ? <>{pctOf(convNow)} <span className="sub">{pctOf(convBefore)} in the ALPHA10 month</span></> : pctOf(convBefore), target: 'within 1 pp of before', why: 'Guards growth: ad platforms optimise on purchases.', ok: live ? convBefore - convNow <= 0.01 : null },
      ]} />

      <Table title="Adoption funnel (Razorpay)" note="targets for a real pilot, not measured here" rows={[
        { metric: 'Eligible merchants who see the insight', now: <span className="status ok">Alpha: seen</span>, target: pctOf(TARGETS.funnel.seeInsight, 0), why: 'Ray flags it on the dashboard, coupons page and weekly digest.' },
        { metric: '… who open the plan', now: <span className={`status ${st.approved ? 'ok' : ''}`}>{st.approved ? 'Alpha: opened' : 'not yet'}</span>, target: pctOf(TARGETS.funnel.openPlan, 0), why: 'Measures whether the insight is convincing.' },
        { metric: '… who approve', now: <span className={`status ${st.approved ? 'ok' : ''}`}>{st.approved ? 'Alpha: approved' : 'not yet'}</span>, target: pctOf(TARGETS.funnel.approve, 0), why: 'Trust: setup must feel safe (budget cap, holdout, kill switch).' },
        { metric: '… still on at day 30', now: <span className={`status ${live && !st.killed ? 'ok' : ''}`}>{live && !st.killed ? 'Alpha: on' : '—'}</span>, target: pctOf(TARGETS.funnel.activeDay30, 0), why: 'The weekly review is the retention loop.' },
        { metric: '… who pay after the pilot', now: <span className={`status ${st.pilotDecision === 'keep' ? 'ok' : ''}`}>{st.pilotDecision ? `Alpha: ${st.pilotDecision}` : 'decides on day 30'}</span>, target: pctOf(TARGETS.funnel.paidAfterPilot, 0), why: 'Revenue for Razorpay; only on proven results.' },
      ]} />

      <Table title="Engagement (from your clicks in this demo)" rows={[
        { metric: 'Weekly reviews opened', now: derived.reviews.length ? `${opened} of ${derived.reviews.length}` : na, target: `≥ ${pctOf(TARGETS.reviewOpenRate, 0)}`, why: 'The habit that keeps the plan improving.', ok: derived.reviews.length ? opened / derived.reviews.length >= TARGETS.reviewOpenRate : null },
        { metric: 'Recommendations approved', now: decisions.length ? `${approvedN} of ${decisions.length} decided` : <span className="muted">none decided yet</span>, target: `≥ ${pctOf(TARGETS.recommendationAcceptRate, 0)}`, why: 'Low acceptance means advice the merchant does not trust.', ok: decisions.length ? approvedN / decisions.length >= TARGETS.recommendationAcceptRate : null },
        { metric: 'Groups overridden', now: `${overrides} of ${model.groups.length}`, target: `< ${pctOf(TARGETS.overrideShareMax, 0)}`, why: 'Frequent overrides mean the plan misses something the merchant knows.', ok: overrides / model.groups.length < TARGETS.overrideShareMax },
        { metric: 'Kill switch used', now: `${kills} time${kills === 1 ? '' : 's'}`, target: 'rare', why: 'A spike signals lost trust.', ok: null },
      ]} />

      <Table title="Prediction quality" rows={[
        { metric: 'Estimates inside measured range', now: live ? `${acc.inside} of ${acc.total}` : na, target: `≥ ${pctOf(TARGETS.estimatesInsideRange, 0)}`, why: 'Borrowed estimates must be trustworthy before a store has its own data.', ok: live ? acc.inside / Math.max(acc.total, 1) >= TARGETS.estimatesInsideRange : null },
        { metric: 'Median estimate error', now: live ? `${num(acc.medianAbsErrorPp, 1)} pp` : na, target: `≤ ${TARGETS.medianErrorPpMax} pp`, why: 'Small errors mean faster, safer first plans.', ok: live ? acc.medianAbsErrorPp <= TARGETS.medianErrorPpMax : null },
        { metric: 'Offer groups proven', now: live ? `${acc.proven} of ${acc.total} by day ${snap.days}` : na, target: 'big groups by day 30–60', why: 'Small groups take longer; the review says how long.', ok: null },
      ]} />

      <Table title="Guardrails (must not get worse)" rows={[
        { metric: 'Checkout decision time', now: `${latency.toFixed(3)} ms average (measured now in your browser)`, target: `< ${CHECKOUT_BUDGET_MS} ms`, why: FEATURES.heroMetric ? `Checkout speed is sacred: it reads ${TABLE_NAME}; AI re-decides every night, never in the payment path.` : 'Checkout speed is sacred; a lookup table, no AI in the path.', ok: latency < CHECKOUT_BUDGET_MS },
        { metric: 'Monthly budget', now: live ? `${inr(projectedSpend)} projected of ${inr(budget)}` : `${inr(FEATURES.netReturns ? derived.live.spend : derived.draft.spend)} planned of ${inr(budget)}`, target: 'never above budget (hard stop)', why: 'Spend can never exceed what the merchant approved.', ok: live ? projectedSpend <= budget * 1.02 : true },
        { metric: 'Daily cap breaches', now: live ? `${capBreaches}` : na, target: '0', why: `Daily cap ${inr(DAILY_SPEND_CAP)} stops runaway days.`, ok: live ? capBreaches === 0 : null },
        { metric: 'Return rate (orders)', now: live ? <>{pctOf(returnsNow)} <span className="sub">{pctOf(returnsBefore)} before</span></> : pctOf(returnsBefore), target: 'no increase', why: 'Discount-driven orders can come back as returns.', ok: live ? returnsNow <= returnsBefore + 0.02 : null },
        { metric: 'Engine outage simulations', now: `${st.outageEvents} (shopper saw store default)`, target: 'fail-safe every time', why: 'If Smart Offers is down, checkout still works.', ok: true },
      ]} />

      <Table title="Razorpay business" note="targets, not measured" rows={[
        { metric: 'Fee per merchant (Alpha example)', now: live ? `${inr(monthly(snap.fee.fee))} a month on proven sales` : na, target: '1% of proven extra sales, ≤ 20% of extra profit', why: 'Pricing aligned with merchant success.' },
        { metric: 'Pilot → paid conversion', now: st.pilotDecision ?? '—', target: pctOf(TARGETS.funnel.paidAfterPilot, 0), why: 'Validates willingness to pay.' },
        { metric: 'Magic Checkout merchants retained', now: '—', target: 'higher than non-users', why: 'Smart Offers makes Magic Checkout stickier.' },
      ]} />
      <MonoTag>{FEATURES.netReturns ? 'Targets are product goals set before a real pilot, not measurements.' : 'Targets are product goals set before a real pilot; edit them in src/engine/targets.ts.'}</MonoTag>
    </div>
  );
}
