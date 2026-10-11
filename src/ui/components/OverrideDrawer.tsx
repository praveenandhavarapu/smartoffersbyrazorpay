import { useEffect, useRef } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { overrideCost } from '../../engine/scenarios';
import { candidateOffers } from '../../engine/economics';
import { OFFER_BY_ID } from '../../data/fixtures';
import type { OfferId } from '../../data/types';
import { inr, inrSigned, num, xr } from '../../lib/format';
import { useDemo } from './demoStore';
import { OfferChip } from './bits';
import { FEATURES } from '../../config/features';
import { RETURN_LABEL } from '../../engine/net';

export function OverrideDrawer() {
  const { model, derived } = useModel();
  const draft = useDemo((s) => s.overrideDraft);
  const open = useDemo((s) => s.openOverride);
  const close = useDemo((s) => s.closeOverride);
  const apply = useStore((s) => s.applyOverride);
  const clear = useStore((s) => s.clearOverride);
  const overrides = useStore((s) => s.overrides);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (draft) ref.current?.focus(); }, [draft]);
  if (!draft) return null;
  const g = model.groups.find((x) => x.id === draft.group)!;
  const current = derived.live.rows.find((r) => r.group === draft.group)!;
  const engineChoice = derived.defaultPlan.rows.find((r) => r.group === draft.group)!.offer;
  const c = overrideCost(model.groups, draft.group, draft.offer, derived.margin, 0.9, derived.kept);
  const now = overrideCost(model.groups, draft.group, current.offer, derived.margin, 0.9, derived.kept);
  const options: OfferId[] = ['none', ...candidateOffers(g)];
  const be = derived.breakEven;
  return (
    <div className="drawer-bg" onClick={close}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="ov-h" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h4 id="ov-h">Override · {g.label}</h4>
        <p className="muted small">Now: <OfferChip offer={current.offer} /> {current.overridden ? '(your override)' : '(engine choice)'}</p>
        <div className="seg">
          {options.map((o) => <label key={o} className={draft.offer === o ? 'on' : ''}><input type="radio" name="ov" checked={draft.offer === o} onChange={() => open(draft.group, o)} />{OFFER_BY_ID[o].label}</label>)}
        </div>
        {draft.offer !== 'none' ? (
          <div className="ov-cost">
            <div><span>Cost a month</span><b>{inr(c.spend)}</b></div>
            <div><span>Extra orders</span><b>{num(c.extraOrders)}</b></div>
            <div><span>{RETURN_LABEL}</span><b className={c.ret < be ? 'bad' : ''}>{xr(c.ret)}</b></div>
            <div><span>Profit a month</span><b className={c.profit < 0 ? 'bad' : 'good'}>{inrSigned(c.profit)}</b></div>
          </div>
        ) : FEATURES.netReturns && current.offer !== 'none'
          ? <p className="small">No offer: saves {inr(now.spend)} a month · about {num(now.extraOrders)} fewer orders · profit change {inrSigned(-now.profit)} a month.</p>
          : <p className="small">No offer: no spend for this group.</p>}
        {c.ret < be && draft.offer !== 'none' && <p className="small warn">Below break-even ({xr(be)}). {g.id === 'returning' ? 'Loyal buyers mostly buy anyway; a non-cash perk (early access to drops, free exchanges) keeps them happy without the cost.' : ''} Your call: I'll say this once.</p>}
        <div className="btns">
          <button className="btn primary" onClick={() => { apply(draft.group, draft.offer, current.offer, `${OFFER_BY_ID[draft.offer].label} (${inrSigned(c.profit)} / month)`); close(); }} disabled={draft.offer === current.offer}>Apply override</button>
          <button className="btn secondary" onClick={close}>Cancel</button>
          {overrides[draft.group] && <button className="btn ghost" onClick={() => { clear(draft.group); close(); }}>Back to engine choice ({OFFER_BY_ID[engineChoice].label})</button>}
        </div>
      </div>
    </div>
  );
}
