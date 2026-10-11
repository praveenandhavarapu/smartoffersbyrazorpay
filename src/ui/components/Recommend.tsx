/**
 * v3: offers the merchant isn't using yet, scored by the plan engine at their own numbers.
 * Evidence comes from the stores-like-yours playbook (synthetic, ≥ 20 stores). Adding one is a draft.
 */
import { useMemo } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { inr, inrSigned, num, xr } from '../../lib/format';
import { groupLabel } from '../../lib/labels';
import { recommendOffers, type Recommendation } from '../../engine/recommend';
import { playbookFor } from '../../data/network/playbook';
import { AddChallenger } from './Playbook';
import type { OfferId } from '../../data/types';

export function useRecommendations(): Recommendation[] {
  const { derived } = useModel();
  const settings = useStore((s) => s.settings);
  return useMemo(() => recommendOffers(derived.planGroups, derived.planSettingsFor(settings)), [derived, settings]);
}

function evidence(r: Recommendation): string {
  const e = r.evidence;
  return e.storesTested ? `${e.medianLiftPp >= 0 ? '+' : ''}${num(e.medianLiftPp, 1)} buyers per 100 at ${num(e.storesTested)} stores like yours${e.beatNoOfferPct !== null ? `; beat no offer in ${e.beatNoOfferPct}%` : ''}${e.note ? ` (${e.note})` : ''}`
    : `your estimate: +${num(e.medianLiftPp, 1)} buyers per 100`;
}

export function effect(r: Recommendation, breakEven: number): string {
  if (r.verdict === 'idea') return 'Not a checkout discount, so the engine can\'t price it. Needs your OK and its own test.';
  const who = r.groups.length ? r.groups.map(groupLabel).join(', ') : groupLabel(r.group);
  if (r.verdict === 'adds_profit') return `Adds ${inrSigned(r.profitDelta)} a month at your numbers (${who})${Math.abs(r.newCustomersDelta) >= 0.5 ? `; new customers ${r.newCustomersDelta > 0 ? '+' : '−'}${num(Math.abs(r.newCustomersDelta))} a month` : ''}.`;
  if (r.verdict === 'adds_growth') return `Doesn't add profit at your numbers. For ${who} it would cost ${inr(Math.max(0, -r.groupProfit))} a month for about ${num(r.groupExtraOrders)} extra orders: use it in a growth trade-off.`;
  return `Doesn't pay back at your numbers: ${xr(r.ret)} after returns vs ${xr(breakEven)} break-even.`;
}

function Row({ r }: { r: Recommendation }) {
  const { derived } = useModel();
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.setSettings);
  const approved = useStore((s) => s.approved);
  const onMenu = r.offer !== 'early_access' && settings.allowedOffers.includes(r.offer as OfferId);
  const pb = playbookFor(r.group, r.offer);
  return (
    <div className="rec-row">
      <div>
        <b>{r.label}</b> <span className="muted small">for {r.groups.length ? r.groups.map(groupLabel).join(', ') : groupLabel(r.group)}</span>
        <span className={`rec-v ${r.verdict}`}>{effect(r, derived.draftBreakEven)}</span>
        <span className="small muted">{evidence(r)}</span>
      </div>
      <div className="rec-act">
        {r.offer === 'early_access' ? (pb ? <AddChallenger row={pb} /> : null)
          : onMenu ? <span className="status ok">On your menu{approved ? ' (draft)' : ''}</span>
          : <button className="btn secondary sm" onClick={() => set({ allowedOffers: [...settings.allowedOffers, r.offer as OfferId] })}>Add to my menu</button>}
        {r.offer !== 'early_access' && approved && pb && !pb.inMenu && <AddChallenger row={pb} />}
      </div>
    </div>
  );
}

export function RecommendCard({ limit }: { limit?: number }) {
  const recs = useRecommendations();
  const shown = limit ? recs.slice(0, limit) : recs;
  return (
    <div className="rcard recommend" id="recommend-card">
      <div className="rc-h"><b>Recommended offers not on your menu</b><span className="muted small">scored at your numbers</span></div>
      {shown.length ? shown.map((r) => <Row key={`${r.group}-${r.offer}`} r={r} />) : <p className="small">Every offer the playbook has for stores like yours is already on your menu.</p>}
      {limit && recs.length > limit && <p className="small muted">{recs.length - limit} more on Smart Offers → Setup &amp; plan.</p>}
      <p className="footnote">Estimates from tests at stores like yours (illustrative synthetic network, aggregates of 20+ stores). Your 10% holdout proves them once they run. Adding an offer to your menu lets the engine use it where it pays; it's a draft until you approve.</p>
    </div>
  );
}
