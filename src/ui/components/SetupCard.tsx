import { useStore, type Settings } from '../../state/store';
import type { Goal, OfferId } from '../../data/types';
import { useModel } from '../../state/ModelContext';
import { fmtDate } from '../../lib/dates';
import { inr } from '../../lib/format';

const GOALS: { id: Goal; label: string }[] = [
  { id: 'most_profit', label: 'Most profit' },
  { id: 'new_customers', label: 'Most new customers' },
  { id: 'orders_steady', label: 'Keep orders steady' },
];
const OFFER_TYPES: { id: OfferId; label: string }[] = [
  { id: 'free_shipping', label: 'Free shipping' }, { id: 'flat_100', label: '₹100 off' }, { id: 'flat_200', label: '₹200 off' },
];

export function SetupCard() {
  const { model } = useModel();
  const s = useStore((x) => x.settings);
  const set = useStore((x) => x.setSettings);
  const up = (p: Partial<Settings>) => set(p);
  const marginPct = s.keepPer1000 / 10;
  const marginWarn = marginPct < 20 || marginPct > 65;
  const budgetBad = s.budget < 5000 || s.budget > 1000000;
  const drop = model.profile.upcomingDrop;

  return (
    <div className="card setup" id="setup-card">
      <div className="setup-h"><b>Setup</b><span className="muted small">Change anything; the plan recalculates.</span></div>
      <label className="field">
        <span>1. Monthly offer budget</span>
        <div className="inp"><i>₹</i><input type="number" inputMode="numeric" min={5000} max={1000000} step={5000} value={s.budget}
          onChange={(e) => up({ budget: Math.round(Number(e.target.value) || 0) })} aria-invalid={budgetBad} /></div>
        {budgetBad && <em className="warn">Allowed ₹5,000–₹10,00,000.</em>}
      </label>
      <label className="field">
        <span>2. What do you keep from a ₹1,000 sale after product, shipping, packaging and payment costs?</span>
        <div className="inp"><i>₹</i><input type="number" inputMode="numeric" min={50} max={950} step={10} value={s.keepPer1000}
          onChange={(e) => up({ keepPer1000: Math.round(Number(e.target.value) || 0) })} aria-invalid={marginWarn} /><b>= {marginPct}% margin</b></div>
        {marginWarn && <em className="warn">Most fashion brands keep ₹350–550. Please double-check: a wrong margin flips which offers pay back.</em>}
      </label>
      <fieldset className="field">
        <legend>3. Goal</legend>
        <div className="seg">
          {GOALS.map((g) => (
            <label key={g.id} className={s.goal === g.id ? 'on' : ''}><input type="radio" name="goal" checked={s.goal === g.id} onChange={() => up({ goal: g.id })} />{g.label}</label>
          ))}
        </div>
      </fieldset>
      {s.goal === 'orders_steady' && (
        <label className="field">
          <span>4. Don't let orders fall more than</span>
          <div className="inp short"><input type="number" min={0} max={30} step={1} value={s.ordersFloorPct} onChange={(e) => up({ ordersFloorPct: Math.max(0, Number(e.target.value) || 0) })} /><i>%</i></div>
        </label>
      )}
      <fieldset className="field">
        <legend>{s.goal === 'orders_steady' ? '5' : '4'}. Rules</legend>
        <label className="chk"><input type="checkbox" checked={s.festiveWindow} onChange={(e) => up({ festiveWindow: e.target.checked })} /> No offers on {drop.name} styles ({drop.styles} styles, {fmtDate(drop.launch, false)} for {drop.fullPriceDays} days)</label>
        <div className="chk">Max discount per order: <b>{inr(s.maxDiscountInr)}</b></div>
        <div className="chips">
          {OFFER_TYPES.map((o) => {
            const on = s.allowedOffers.includes(o.id);
            return (
              <label key={o.id} className={`chip ${on ? 'hl' : ''}`}>
                <input type="checkbox" className="sr" checked={on} onChange={() => up({ allowedOffers: on ? s.allowedOffers.filter((x) => x !== o.id) : [...s.allowedOffers, o.id] })} />
                {on ? '✓ ' : ''}{o.label}
              </label>
            );
          })}
        </div>
        <div className="chk muted">Creator codes: keep running, report only.</div>
      </fieldset>
    </div>
  );
}
