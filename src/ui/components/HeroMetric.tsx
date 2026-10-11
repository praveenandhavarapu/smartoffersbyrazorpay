/**
 * v2 §6.3 hero metric: cost per extra order vs what each extra order earns after returns.
 * Every figure is engine output (derived.snapshots[*].metrics, derived.a10CostPerOrder, derived.earnedPerOrder).
 */
import { useModel } from '../../state/ModelContext';
import { SNAP_DAYS, type SnapKey } from '../../state/derived';
import { inr } from '../../lib/format';

type Point = { key: string; label: string; value: number | null; proj?: boolean; alpha?: boolean };

function Trend({ points, earned, current }: { points: Point[]; earned: number; current?: string }) {
  const max = Math.max(earned, ...points.map((p) => p.value ?? 0)) * 1.15 || 1;
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="hm-trend" role="img" aria-label={`Cost per extra order: ${points.map((p) => `${p.label} ${p.value === null ? 'none' : inr(p.value)}`).join(', ')}; earned per order ${inr(earned)}`}>
      <div className="hm-plot">
        <div className="hm-ref" style={{ bottom: pct(earned) }}><span>earned {inr(earned)}</span></div>
        {points.map((p) => (
          <div key={p.key} className={`hm-col ${p.alpha ? 'alpha' : ''} ${p.proj ? 'proj' : ''} ${current === p.key ? 'on' : ''}`}>
            <i style={{ height: pct(p.value ?? 0) }} />
            <span className="hm-v" style={{ bottom: `calc(${pct(p.value ?? 0)} + 2px)` }}>{p.value === null ? '—' : inr(p.value)}</span>
          </div>
        ))}
      </div>
      <div className="hm-labels">{points.map((p) => <span key={p.key} className={current === p.key ? 'on' : ''}>{p.label}</span>)}</div>
    </div>
  );
}

/** Results / Impact card. `day` = the snapshot to headline (Results: the selected day; Impact: today). */
export function HeroMetric({ day }: { day: SnapKey | null }) {
  const { derived } = useModel();
  const earned = derived.earnedPerOrder;
  const a10 = derived.a10CostPerOrder;
  const m = day ? derived.snapshots[day].metrics : null;
  const cpo = m ? m.costPerExtraOrder : derived.live.extraOrders ? derived.live.spend / derived.live.extraOrders : null;
  const points: Point[] = [
    { key: 'a10', label: 'ALPHA10', value: a10, alpha: true },
    ...(Object.keys(SNAP_DAYS) as SnapKey[]).map((k) => ({ key: k, label: `Day ${SNAP_DAYS[k]}${SNAP_DAYS[k] > derived.nowDay ? ' (proj.)' : ''}`, value: derived.snapshots[k].metrics.costPerExtraOrder, proj: SNAP_DAYS[k] > derived.nowDay })),
  ];
  const below = cpo !== null && cpo < earned;
  return (
    <section className="rcard hero-metric" aria-label="Cost per extra order">
      <div className="hm-main">
        <span className="mono-tag green">Cost per extra order{m ? ` · day ${m.days}${m.days > derived.nowDay ? ' (projection)' : ''}` : ' · plan'}</span>
        <div className="hm-big"><b className={below ? 'good' : 'bad'}>{cpo === null ? '—' : inr(cpo)}</b></div>
        <p>What you pay in discounts for each order an offer actually creates. Each extra order earns you <b>{inr(earned)}</b> after returns.{a10 !== null && <> ALPHA10 paid <b>{inr(a10)}</b>.</>}</p>
        {m && <p className="small muted">{inr(m.leaked)} of discounts went to buyers who'd have bought anyway{m.days > 0 ? ` (day ${m.days})` : ''}.</p>}
      </div>
      <Trend points={points} earned={earned} current={day ?? undefined} />
    </section>
  );
}
