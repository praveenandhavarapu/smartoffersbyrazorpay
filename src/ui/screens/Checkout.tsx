import { useEffect, useMemo, useState } from 'react';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { buildCheckoutTable, cartValue, classify, decide, idWithHoldout, SAMPLE_SHOPPERS, whyNumbers, type Shopper, type Source } from '../../engine/checkoutTable';
import { withCheckoutBudget } from '../../engine/guardrails';
import { OFFER_BY_ID } from '../../data/fixtures';
import { inr, num, pctOf, xr } from '../../lib/format';
import { Info, Lock, Tag } from '../components/Icons';
import { Banner, MonoTag, OfferChip } from '../components/bits';
import { useDemo } from '../components/demoStore';
import { RETURN_LABEL } from '../../engine/net';
import { FEATURES } from '../../config/features';
import { AI_NIGHTLY, TABLE_NAME } from '../components/HowAIWorks';
import { PREPAID } from '../../engine/paymentAware';

function CustomForm({ value, onChange }: { value: Shopper; onChange: (s: Shopper) => void }) {
  const cart = cartValue(value);
  return (
    <div className="custom card">
      <label>Source
        <select value={value.source} onChange={(e) => onChange({ ...value, source: e.target.value as Source })}>
          <option value="paid_social">Instagram/Meta ad</option><option value="creator">Creator link</option><option value="organic">Organic / direct</option>
        </select>
      </label>
      <label className="chk"><input type="checkbox" checked={value.isFirstOrder} onChange={(e) => onChange({ ...value, isFirstOrder: e.target.checked, daysSinceLastOrder: e.target.checked ? null : value.daysSinceLastOrder ?? 30 })} /> First order</label>
      {!value.isFirstOrder && <label>Days since last order<input type="number" min={1} max={999} value={value.daysSinceLastOrder ?? 30} onChange={(e) => onChange({ ...value, daysSinceLastOrder: Math.max(1, Number(e.target.value) || 1) })} /></label>}
      <label>Cart value (₹)<input type="number" min={299} max={9999} step={50} value={cart} onChange={(e) => onChange({ ...value, cart: [{ name: 'Custom cart', priceInr: Math.max(1, Number(e.target.value) || 0) }] })} /></label>
    </div>
  );
}

export function Checkout() {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const alpha10Restored = useStore((s) => s.alpha10Restored);
  const outage = useStore((s) => s.outage);
  const setOutage = useStore((s) => s.setOutage);
  const shopperId = useDemo((s) => s.shopperId);
  const setShopper = useDemo((s) => s.setShopper);
  const [custom, setCustom] = useState<Shopper>({ id: 'custom', name: 'Custom shopper', customerId: idWithHoldout('CUSTOM', false), isFirstOrder: true, daysSinceLastOrder: null, source: 'paid_social', sourceLabel: 'Custom', cart: [{ name: 'Custom cart', priceInr: 1299 }] });
  const shopper = shopperId === 'custom' ? custom : SAMPLE_SHOPPERS.find((s) => s.id === shopperId) ?? SAMPLE_SHOPPERS[0];
  const table = useMemo(() => buildCheckoutTable(derived.liveOffers, killed), [derived.liveOffers, killed]);
  const [d, setD] = useState(() => decide(table, shopper));
  const [failSafe, setFailSafe] = useState(false);

  useEffect(() => {
    let alive = true;
    const fallback = { ...decide(buildCheckoutTable(derived.liveOffers, true), shopper), offer: 'none' as const, savingInr: 0, reason: 'Smart Offers unavailable: default checkout.' };
    withCheckoutBudget(() => {
      if (outage) return new Promise<never>(() => undefined); // simulated outage never answers
      return decide(table, shopper);
    }, fallback).then((r) => { if (alive) { setD(r.value); setFailSafe(r.failSafe); } });
    return () => { alive = false; };
  }, [table, shopper, outage, derived.liveOffers]);

  const g = model.groups.find((x) => x.id === d.group)!;
  const planOffer = derived.liveOffers[d.group];
  const prepaidTest = derived.learning?.flags.prepaid === 'approved';
  const why = whyNumbers(g, planOffer, derived.margin, derived.kept);
  const shipping = d.offer.startsWith('free_shipping') ? 0 : d.shippingInr;
  const discount = d.offer.startsWith('flat_') ? d.savingInr : 0;
  const total = d.cartInr - discount + shipping;

  return (
    <div className="frame plain checkout-screen">
      {!approved && <Banner>Showing the default plan (not yet approved).</Banner>}
      {alpha10Restored && <Banner tone="warn">Smart Offers is stopped and ALPHA10 is back for everyone, so shoppers see the coupon field instead of a group offer.</Banner>}
      <div className="co-head">
        <MonoTag>Checkout simulator · Magic Checkout-style sheet</MonoTag>
        <h2>Same store, different shoppers, different offers</h2>
        <p>{FEATURES.heroMetric ? `The offer comes from ${TABLE_NAME}: ${AI_NIGHTLY}` : 'The offer comes from a precomputed table (no AI at checkout).'} Pick a shopper.</p>
      </div>
      <div className="co-grid">
        <div className="shoppers" role="radiogroup" aria-label="Sample shoppers">
          {SAMPLE_SHOPPERS.map((s) => (
            <button key={s.id} role="radio" aria-checked={shopperId === s.id} className={`shopper ${shopperId === s.id ? 'on' : ''}`} onClick={() => setShopper(s.id)}>
              <b>{s.name}</b><span>{s.sourceLabel}</span><span>{s.cart.map((i) => i.name).join(' + ')} · {inr(cartValue(s))}</span>
            </button>
          ))}
          <button role="radio" aria-checked={shopperId === 'custom'} className={`shopper ${shopperId === 'custom' ? 'on' : ''}`} onClick={() => setShopper('custom')}><b>Custom shopper</b><span>Set source, first order and cart</span></button>
          {shopperId === 'custom' && <CustomForm value={custom} onChange={setCustom} />}
          <label className="chk outage"><input type="checkbox" checked={outage} onChange={(e) => setOutage(e.target.checked)} /> Engine outage</label>
        </div>

        <div className="pcol">
          <div className="phone">
            <div className="screenp">
              <div className="sbar"><span>9:41</span><span className="notch" /><span>5G</span></div>
              <div className="store-bg"><span>{model.profile.displayName.toLowerCase().replace(' ', '')}.in</span><span>Secure checkout</span></div>
              <div className="sheet">
                <div className="grab" />
                <div className="mtop"><div className="mlogo">A</div><div><div className="mname">{model.profile.displayName}</div><div className="msub">{shopper.cart.length} item{shopper.cart.length > 1 ? 's' : ''}</div></div><div className="mtotal">{inr(total)}</div></div>
                {failSafe && <div className="coupon-row small">Smart Offers unavailable — default checkout</div>}
                {!failSafe && d.offer !== 'none' ? (
                  <>
                    <div className="obanner"><Tag />{OFFER_BY_ID[d.offer].label} applied<span>−{inr(d.savingInr)}</span></div>
                    {FEATURES.paymentAware && prepaidTest && d.group === 'new_ads_small' && <div className="pay-nudge">Challenger variant (15% of this group): <b>Free shipping when you pay by UPI</b><span className="small">COD-likely shopper: {pctOf(1 - PREPAID.share.new_ads_small[0], 0)} of this group pay on delivery</span></div>}
                  </>
                ) : (
                  <div className="coupon-row"><span>Have a coupon code?</span><b>View coupons</b></div>
                )}
                <div className="sec"><span className="l">Contact</span><span className="r">+91 98••• ••210</span></div>
                <div className="sec"><span className="l">Deliver to</span><span className="r">Home · Bengaluru 5600••</span></div>
                <div className="sum">
                  {shopper.cart.map((i, k) => <div key={k}><span>{i.name}</span><span>{inr(i.priceInr)}</span></div>)}
                  {discount > 0 && <div><span>Smart Offer</span><span className="free">−{inr(discount)}</span></div>}
                  <div><span>Shipping</span><span>{d.shippingInr === 0 ? <span className="free">Free</span> : shipping === 0 ? <><s>{inr(d.shippingInr)}</s><span className="free">Free</span></> : inr(shipping)}</span></div>
                  <div className="tot"><span>To pay</span><span>{inr(total)}</span></div>
                </div>
                <div className="popts">
                  <div className="popt sel"><span className="dot" />UPI<em>Fastest</em></div>
                  <div className="popt"><span className="dot" />Cards</div>
                  <div className="popt"><span className="dot" />Cash on delivery</div>
                </div>
                <button className="paybtn" disabled aria-disabled="true">Pay {inr(total)}</button>
                <div className="sfoot"><Lock /> Secured checkout · demo</div>
              </div>
            </div>
          </div>
        </div>

        <aside className="why" aria-label="Why this offer">
          <MonoTag tone={d.holdout ? 'amber' : 'green'}>Why</MonoTag>
          <p><b>{shopper.name}</b> → group <b>{g.label}</b> (rule: {classify(shopper, d.cartInr) === g.id ? g.rule.replace(/_/g, ' ') : ''}).</p>
          {d.holdout ? (
            <p className="holdout-p"><Info width={16} /> 1 in 10 shoppers sees no offer so we can measure what offers add. {shopper.name} is in the holdout (sticky per customer).</p>
          ) : (
            <>
              <div className="meter">
                <div><span>Without offer</span><i style={{ width: `${why.withoutRate * 100}%` }} /><span>{pctOf(why.withoutRate, 0)}</span></div>
                <div><span>With {planOffer === 'none' ? 'no offer' : OFFER_BY_ID[planOffer].label}</span><i className="g" style={{ width: `${why.withRate * 100}%` }} /><span>{pctOf(why.withRate, 0)}</span></div>
              </div>
              <p>Cost per order: {inr(why.costPerOrder)} · {RETURN_LABEL.toLowerCase()} {planOffer === 'none' ? '—' : xr(why.ret)} (break-even {xr(derived.breakEven)}).</p>
            </>
          )}
          <div className="dec"><span>Decision</span><OfferChip offer={d.offer} /></div>
          <p className="small muted">{failSafe ? 'Lookup missed its 50 ms budget, so the shopper sees the store default.' : d.reason}</p>
          {!d.holdout && planOffer === 'none' && g.id === 'returning' && <p className="small muted">Loyal buyers {num(g.baseConversion * 100)} in 100 buy anyway; consider non-cash perks (early access to drops).</p>}
        </aside>
      </div>
    </div>
  );
}
