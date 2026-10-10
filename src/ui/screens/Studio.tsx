import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { inr, inrSigned, num, xr } from '../../lib/format';
import { OFFER_BY_ID } from '../../data/fixtures';
import { Check, X } from '../components/Icons';
import { shortGroup } from '../components/bits';

const CAN = ['Read checkout, order and coupon data', 'Run approved offers within budget', 'Simulate plans and scenarios', 'Pause offers that fall below break-even'];
const CANNOT = ['Change product prices', 'Exceed the monthly budget', 'Launch without your approval', 'Message shoppers', 'Use device, gender or income'];

export function Studio() {
  const { model, derived } = useModel();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const kill = useStore((s) => s.kill);
  const resume = useStore((s) => s.resume);
  const approve = useStore((s) => s.approve);
  const d20 = derived.snapshots.day20;
  const top = d20.rows.filter((r) => r.offer !== 'none').sort((a, b) => b.extraSales - a.extraSales)[0];
  const label = (g: string) => shortGroup(model.groups.find((x) => x.id === g)!.label);

  return (
    <div className="studio">
      <div className="st-nav"><span className="st-brand">Agent Studio</span><span className="lnk"><span className="on">Agents</span><span>Runs</span><span>Permissions</span><span>Logs</span></span><span className="mono-tag">concept</span></div>
      <div className="st-hero">
        <div>
          <div className="st-label"><i />Smart Offers Agent</div>
          <h1>Pay for the sale, <em>not the coupon.</em></h1>
          <p>Decides which shopper groups get which approved checkout offer, or none, to earn {model.profile.displayName} the most extra profit within budget, and proves it against a 10% holdout.</p>
          <div className="btns">
            {!approved ? <button className="btn primary" onClick={approve}>Install &amp; approve default plan</button> : <span className="pill live"><i />Installed</span>}
            {killed ? <button className="btn dark" onClick={resume}>Resume</button> : <button className="btn dark" onClick={kill} disabled={!approved}>Kill switch</button>}
          </div>
        </div>
        <div className="feed" aria-label="Live feed">
          <div className="fcard"><div className="t"><span>Plan</span><b>{approved ? (killed ? 'paused' : 'live') : 'draft'}</b></div><div className="m"><strong>{derived.live.rows.filter((r) => r.offer !== 'none').length} group offers</strong> · {inr(derived.live.spend)} of {inr(derived.live.settings.budget)} · {xr(derived.live.ret)}</div></div>
          {top && <div className="fcard"><div className="t"><span>Proof · day 20</span><b>{top.stillLearning ? 'learning' : 'proven'}</b></div><div className="m">{label(top.group)}: <strong>{OFFER_BY_ID[top.offer].label}</strong> lifts buying {num(top.lift * 100, 1)} pp vs holdout</div></div>}
          <div className="fcard"><div className="t"><span>Guardrail</span><b>watch</b></div><div className="m">{d20.nearBreakEven.map((r) => `${label(r.group)} at ${xr(r.ret)}`).join(', ') || 'Nothing near break-even'}</div></div>
          <div className="fcard dim"><div className="t"><span>Saved</span><b>month</b></div><div className="m">Returning buyers no longer get ALPHA10: <strong>{inr(derived.a10.rows.find((r) => r.group === 'returning')?.spend ?? 0)}</strong> a month</div></div>
        </div>
      </div>
      <section className="st-sec">
        <div className="st-label">How it works</div>
        <h3>Find, decide, prove</h3>
        <div className="how">
          <div className="fcard"><div className="n">01</div><h6>Find</h6><p>Reads last month's coupons and checkouts; shows where discounts went to buyers who'd buy anyway (ALPHA10: {xr(derived.a10.ret)}).</p></div>
          <div className="fcard"><div className="n">02</div><h6>Decide</h6><p>Per shopper group, picks the approved offer with the most profit above break-even, or none, within budget ({inrSigned(derived.defaultPlan.profit)} a month at default settings).</p></div>
          <div className="fcard"><div className="n">03</div><h6>Prove</h6><p>A 10% holdout sees no offer. Results show measured lift with 90% ranges and "still learning" until the data is clear.</p></div>
        </div>
      </section>
      <section className="st-sec">
        <div className="st-label">Permissions</div>
        <h3>What the agent can and cannot do</h3>
        <div className="perm">
          {CAN.map((c) => <div key={c} className="y"><Check />{c}</div>)}
          {CANNOT.map((c) => <div key={c} className="n2"><X />Cannot: {c.toLowerCase()}</div>)}
        </div>
      </section>
      <section className="st-sec">
        <div className="st-label">Works alongside</div>
        <h3>Other Razorpay agents</h3>
        <div className="others">
          <div className="fcard me"><div className="t"><span>This agent</span></div><div className="m"><strong>Smart Offers</strong>: checkout offers by shopper group</div></div>
          <div className="fcard"><div className="t"><span>Existing</span></div><div className="m">Cart abandonment: recovers dropped checkouts</div></div>
          <div className="fcard"><div className="t"><span>Existing</span></div><div className="m">Dispute responder: drafts chargeback replies</div></div>
          <div className="fcard"><div className="t"><span>Existing</span></div><div className="m">Subscription recovery: retries failed renewals</div></div>
        </div>
      </section>
      <section className="st-sec">
        <div className="pricebar">
          <div><b>Free 30-day pilot</b><span>Then 1% of proven extra sales, capped at 20% of extra profit. Proven = lower bound of the 90% range.</span></div>
          <span className="mono-tag">Day 20 example: {inr(d20.fee.fee)}</span>
        </div>
      </section>
    </div>
  );
}
