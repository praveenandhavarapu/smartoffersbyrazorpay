import { useStore, type InputKey, type Settings } from '../../state/store';
import type { Goal, OfferId } from '../../data/types';
import { useModel } from '../../state/ModelContext';
import { fmtDate } from '../../lib/dates';
import { inr, num, pctOf, xr } from '../../lib/format';
import { FEATURES } from '../../config/features';
import { keptRate } from '../../engine/net';
import { MAX_DISCOUNT_PER_ORDER } from '../../engine/guardrails';
import { KEEP_GUIDANCE } from '../../ray/templates';
import { pendingInputs, typicalPatch } from '../../state/inputs';
import { offerLabel } from '../../lib/labels';

const GOALS: { id: Goal; label: string }[] = [
  { id: 'most_profit', label: 'Most profit' },
  { id: 'new_customers', label: 'Most new customers' },
  { id: 'orders_steady', label: 'Keep orders steady' },
];
const OFFER_TYPES: { id: 'free_shipping' | 'flat_100' | 'flat_200'; label: string }[] = [
  { id: 'free_shipping', label: 'Free shipping' }, { id: 'flat_100', label: '₹100 off' }, { id: 'flat_200', label: '₹200 off' },
];

/** Where an input's value came from (only before the first approval; approving confirms them all). */
function Source({ k }: { k: InputKey }) {
  const approved = useStore((x) => x.approved);
  const c = useStore((x) => x.confirmed[k]);
  if (approved) return null;
  return c === 'merchant' ? <span className="src ok">Yours</span> : c === 'typical' ? <span className="src">Typical · accepted</span> : <span className="src warn">Not confirmed</span>;
}

export function SetupCard({ embedded }: { embedded?: boolean }) {
  const { model, derived } = useModel();
  const s = useStore((x) => x.settings);
  const approved = useStore((x) => x.approved);
  const confirmed = useStore((x) => x.confirmed);
  const set = useStore((x) => x.setSettings);
  const up = (p: Partial<Settings>) => set(p);
  const b = derived.benchmark;
  const be = derived.draftBreakEven;
  const typical = (k: InputKey) => set(typicalPatch(b, [k], be), 'typical');
  const pending = pendingInputs(approved, confirmed);
  const UseTypical = ({ k }: { k: InputKey }) => (!approved && !confirmed[k] && b.ok ? <button type="button" className="linkish" onClick={() => typical(k)}>Use typical</button> : null);
  const marginPct = s.keepPer1000 / 10;
  const marginWarn = marginPct < 20 || marginPct > 65;
  const budgetBad = s.budget < 5000 || s.budget > 1000000;
  const drop = model.profile.upcomingDrop;
  const n = (step: number) => (s.goal === 'orders_steady' && step >= 4 ? step + 1 : step);
  const minBe = s.minReturn ?? null;
  const higher = b.ok ? Math.round(b.floor.usualHigherMultiple * be * 100) / 100 : null;

  return (
    <div className={`${embedded ? 'setup embedded' : 'card setup'}`} id={embedded ? undefined : 'setup-card'}>
      <div className="setup-h"><b>Your numbers</b><span className="muted small">{approved && FEATURES.netReturns ? 'Changes are a draft until you approve them. Nothing live changes before that.' : `Nothing is assumed. Each input shows what ${b.ok ? b.peerLabel.toLowerCase() : 'similar stores'} typically use; keep it or type your own.${pending.length ? ` ${pending.length} still to confirm.` : ''}`}</span></div>
      <label className="field">
        <span>1. Monthly offer budget <Source k="budget" /></span>
        <div className="inp"><i>₹</i><input type="number" inputMode="numeric" min={5000} max={1000000} step={5000} value={s.budget}
          onChange={(e) => up({ budget: Math.round(Number(e.target.value) || 0) })} aria-invalid={budgetBad} /></div>
        {budgetBad && <em className="warn">Allowed ₹5,000–₹10,00,000.</em>}
        {b.ok && <em className="hint bench">Typical for {b.peerLabel.toLowerCase()} ({num(b.stores)} stores): {inr(b.budgetInr.p25)}–{inr(b.budgetInr.p75)} a month at your sales (median {inr(b.budgetInr.median)}; {num(b.offerSpendPct.p25, 1)}–{num(b.offerSpendPct.p75, 1)}% of monthly sales). <UseTypical k="budget" /></em>}
      </label>
      <label className="field">
        <span>2. What do you keep from a ₹1,000 sale after product, shipping, packaging and payment costs? <Source k="keepPer1000" /></span>
        <div className="inp"><i>₹</i><input type="number" inputMode="numeric" min={50} max={950} step={10} value={s.keepPer1000}
          onChange={(e) => up({ keepPer1000: Math.round(Number(e.target.value) || 0) })} aria-invalid={marginWarn} /><b>= {marginPct}% margin</b></div>
        {b.ok ? <em className="hint bench">Stores your size keep {inr(b.keepPer1000.p25)}–{inr(b.keepPer1000.p75)} (median {inr(b.keepPer1000.median)}). Use your own if you know it: a wrong margin flips which offers pay back. <UseTypical k="keepPer1000" /></em>
          : FEATURES.netReturns && <em className="hint">{KEEP_GUIDANCE.text}.</em>}
        {FEATURES.netReturns && <em className="hint ro">{pctOf(keptRate(), 0)} of extra sales are kept after returns and failed COD (your last 90 days). Read-only; used in every profit number.</em>}
        {marginWarn && <em className="warn">That looks unusual. Please double-check: a wrong margin flips which offers pay back.</em>}
      </label>
      <fieldset className="field">
        <legend>3. Goal <Source k="goal" /></legend>
        <div className="seg">
          {GOALS.map((g) => (
            <label key={g.id} className={s.goal === g.id ? 'on' : ''}><input type="radio" name={embedded ? 'goal-chat' : 'goal'} checked={s.goal === g.id} onChange={() => up({ goal: g.id })} />{g.label}</label>
          ))}
        </div>
        {b.ok && <em className="hint bench">Stores your size: Most profit {b.goalMixPct.most_profit}% · Most new customers {b.goalMixPct.new_customers}% · Keep orders steady {b.goalMixPct.orders_steady}%. <UseTypical k="goal" /></em>}
        {s.goal !== 'most_profit' && <em className="hint ro">{s.growth ? `Growth trade-off: give up up to ${inr(s.growth.giveUpInr)} of profit a month for more ${s.growth.metric === 'orders' ? 'orders' : 'new customers'}.` : 'Choose how much profit to give up for growth in Trade-offs (see what each step costs).'}</em>}
      </fieldset>
      {s.goal === 'orders_steady' && (
        <label className="field">
          <span>4. Don't let orders fall more than</span>
          <div className="inp short"><input type="number" min={0} max={30} step={1} value={s.ordersFloorPct} onChange={(e) => up({ ordersFloorPct: Math.max(0, Number(e.target.value) || 0) })} /><i>%</i></div>
        </label>
      )}
      <fieldset className="field">
        <legend>{n(4)}. Offers I may use, and the most off per order <Source k="offers" /></legend>
        <div className="chips">
          {OFFER_TYPES.map((o) => {
            const on = s.allowedOffers.includes(o.id);
            return (
              <label key={o.id} className={`chip ${on ? 'hl' : ''}`}>
                <input type="checkbox" className="sr" checked={on} onChange={() => up({ allowedOffers: on ? s.allowedOffers.filter((x) => x !== o.id) : [...s.allowedOffers, o.id] })} />
                {on ? '✓ ' : ''}{o.label}{b.ok && <span className="muted small"> · {b.menuPct[o.id]}% of stores</span>}
              </label>
            );
          })}
          {s.allowedOffers.filter((o) => !OFFER_TYPES.some((t) => t.id === o)).map((o: OfferId) => (
            <label key={o} className="chip hl"><input type="checkbox" className="sr" checked onChange={() => up({ allowedOffers: s.allowedOffers.filter((x) => x !== o) })} />✓ {offerLabel(o)}</label>
          ))}
        </div>
        <div className="inp short wide"><i>Max ₹</i><input type="number" inputMode="numeric" min={50} max={MAX_DISCOUNT_PER_ORDER} step={10} value={s.maxDiscountInr} aria-label="Max discount per order"
          onChange={(e) => up({ maxDiscountInr: Math.min(MAX_DISCOUNT_PER_ORDER, Math.max(0, Math.round(Number(e.target.value) || 0))) })} /><i>off per order</i></div>
        {b.ok && <em className="hint bench">Stores your size usually cap at {inr(b.maxDiscountInr.median)} ({inr(b.maxDiscountInr.p25)}–{inr(b.maxDiscountInr.p75)}). Guardrail: never above {inr(MAX_DISCOUNT_PER_ORDER)}. Offers that worked at stores like yours but aren't on your menu are under Recommended offers. <UseTypical k="offers" /></em>}
      </fieldset>
      <fieldset className="field">
        <legend>{n(5)}. Minimum return after returns for any offer <Source k="minReturn" /></legend>
        <div className="seg">
          <label className={minBe === null ? 'on' : ''}><input type="radio" name={embedded ? 'floor-chat' : 'floor'} checked={minBe === null} onChange={() => up({ minReturn: null })} />Break-even ({xr(be)})</label>
          {higher !== null && <label className={minBe === higher ? 'on' : ''}><input type="radio" name={embedded ? 'floor-chat' : 'floor'} checked={minBe === higher} onChange={() => up({ minReturn: higher })} />{num(b.ok ? b.floor.usualHigherMultiple : 1, 1)}× break-even ({xr(higher)})</label>}
        </div>
        <div className="inp short"><input type="number" inputMode="decimal" min={1} max={10} step={0.1} value={minBe ?? ''} placeholder={be.toFixed(2)} aria-label="Minimum return, times"
          onChange={(e) => { const v = Number(e.target.value); up({ minReturn: e.target.value === '' || !Number.isFinite(v) || v <= 0 ? null : Math.round(v * 100) / 100 }); }} /><i>x</i></div>
        {b.ok && <em className="hint bench">{b.floor.breakEvenPct}% of stores your size ask offers to at least break even; {b.floor.higherPct}% ask for more. A higher bar keeps fewer offers. <UseTypical k="minReturn" /></em>}
      </fieldset>
      <fieldset className="field">
        <legend>{n(6)}. Rules <Source k="festiveWindow" /></legend>
        <label className="chk"><input type="checkbox" checked={s.festiveWindow} onChange={(e) => up({ festiveWindow: e.target.checked })} /> No offers on {drop.name} styles ({drop.styles} styles, {fmtDate(drop.launch, false)} for {drop.fullPriceDays} days)</label>
        {b.ok && <em className="hint bench">{b.pausesOnDropsPct}% of stores your size pause offers on new full-price drops. <UseTypical k="festiveWindow" /></em>}
        <div className="chk muted">Creator codes: keep running, report only.</div>
      </fieldset>
    </div>
  );
}

