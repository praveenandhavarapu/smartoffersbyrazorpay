/** v2 §12: About — evidence, how merchants run offers today, Agent Studio principles, who it's for, what we left out, roadmap. */
import { useModel } from '../../state/ModelContext';
import { groupLabel } from '../../lib/labels';
import { num } from '../../lib/format';
import { MAX_DISCOUNT_PER_ORDER } from '../../engine/guardrails';

const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;

export function AboutV2() {
  const { model, derived } = useModel();
  const rows = derived.learning?.rows ?? [];
  const proof = rows.filter((r) => r.mode.mode === 'proof').map((r) => groupLabel(r.group));
  const playbook = rows.filter((r) => r.mode.mode === 'playbook').map((r) => groupLabel(r.group));
  return (
    <>
      <section className="card pad about-v2">
        <h2>Why this matters</h2>
        <p className="lead">Most discounts don't pay for themselves, and merchants rarely measure it.</p>
        <ul className="plain">
          <li>Nielsen found almost three-quarters of US consumer-goods promotions didn't break even (2014, 39 million promotion events). <span className="muted small">US CPG data.</span> <A href="https://www.foodnavigator.com/Article/2014/10/09/Three-quarters-of-CPG-promotions-don-t-break-even-Nielsen/">foodnavigator.com</A></li>
          <li>A Nielsen study across seven countries found 60% of trade promotions didn't break even. <span className="muted small">Consumer-goods data.</span> <A href="https://www.warc.com/newsandopinion/news/most-fmcg-promotions-lose-money/en-gb/34946">warc.com</A></li>
          <li>Early Indian D2C brands spent 30–40% of revenue on digital ads; many reached only low single-digit margins or losses. <A href="https://www.thirdeyesight.in/?p=6940">thirdeyesight.in</A></li>
          <li>Apparel D2C: gross margin 50–70% but contribution 10–25%, with returns of 20–35% (industry estimates). <A href="https://base.com/en-IN/blog/?p=19327">base.com</A></li>
          <li>Fashion RTO runs 25–40% vs 5–15% in beauty, and cash on delivery drives most of it (industry estimates). <A href="https://base.com/en-IN/blog/?p=22444">base.com</A></li>
          <li>US merchants pay $49–199 a month just to stop coupon codes leaking. <A href="https://apps.shopify.com/keepcart">KeepCart</A></li>
        </ul>
      </section>

      <section className="card pad about-v2">
        <h2>How merchants run offers today</h2>
        <p>An always-on sitewide code, sale events, influencer codes and blanket prepaid discounts. Today's tools offer coupon formats and usage tracking, not incrementality: <A href="https://shopflo.com/help/discount-engine-setup">Shopflo discount docs</A>, <A href="https://razorpay.com/blog/coupons-suite/">Razorpay Coupon Suite</A>.</p>
        <p className="pos-line"><b>Magic Checkout's Offer Engine decides which coupon to show. Smart Offers decides whether a discount is worth paying for at all, and proves it.</b> <A href="https://razorpay.com/magic">razorpay.com/magic</A></p>
      </section>

      <section className="card pad about-v2">
        <h2>Built for Agent Studio's principles</h2>
        <p className="small muted">Mapped to <A href="https://razorpay.com/blog/razorpay-agent-studio-principles-guardrails-and-merchant-control/">Razorpay Agent Studio: principles, guardrails and merchant control</A>.</p>
        <div className="tbl-wrap">
          <table className="dtable compact">
            <thead><tr><th>Principle</th><th>How Smart Offers follows it</th></tr></thead>
            <tbody>
              <tr><td>Merchant control, review-first</td><td>Approve the plan and the experiment space; promotions need approval; kill switch; Stop.</td></tr>
              <tr><td>No invented pricing</td><td>Only offers from the merchant's menu, under the {`₹${MAX_DISCOUNT_PER_ORDER}`} max discount; playbook ideas need an OK first.</td></tr>
              <tr><td>Verified data</td><td>The engine computes every number; Ray only explains.</td></tr>
              <tr><td>Audit trail</td><td>Every agent and merchant action is logged, with Undo for automatic steps.</td></tr>
              <tr><td>No dark patterns</td><td>No fake urgency; offers are real and shown plainly.</td></tr>
              <tr><td>Data stays in Razorpay</td><td>The playbook uses aggregates of 20 or more stores; no store names.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card pad grid-2 about-v2">
        <div>
          <h2>Who it's for</h2>
          <p>Magic Checkout D2C brands running an always-on coupon. Big groups run in <b>Proof mode</b>: the holdout proves their lift within 60 days{proof.length ? ` (here: ${proof.join(', ')})` : ''}. Small groups run in <b>Playbook mode</b> on evidence from {num(model.pool.size)} similar stores until they have enough data{playbook.length ? ` (here: ${playbook.join(', ')})` : ''}.</p>
        </div>
        <div>
          <h2>What we chose not to build</h2>
          <ul className="plain">
            <li>No LLM at checkout: AI re-decides every night; checkout reads a table.</li>
            <li>No per-shopper personalised prices.</li>
            <li>No use of device, gender, income or location.</li>
            <li>No shopper messaging and no price changes.</li>
            <li>No showing competitors' discount levels.</li>
          </ul>
        </div>
      </section>

      <section className="card pad about-v2">
        <h2>Roadmap</h2>
        <ul className="plain">
          <li><b>Beauty and personal care next:</b> higher repeat purchase means a bigger leak to buyers who'd buy anyway.</li>
          <li><b>Leak radar</b> for public codes that escape to coupon sites.</li>
          <li><b>Payment links</b> as another touchpoint for the same discount brain.</li>
          <li><b>Pay-on-proof pricing</b>, similar in spirit to Shopify Shop Campaigns charging only on conversion. <A href="https://www.shopify.com/shop-campaigns">shopify.com/shop-campaigns</A></li>
        </ul>
      </section>
    </>
  );
}
