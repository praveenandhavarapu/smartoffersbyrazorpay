/** Concept brief: why this problem, who the merchant is, how they work today, what we built and left out. */
import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { inr, inrSigned, num, pctOf, xr } from '../../lib/format';
import { PageHeader } from '../components/kit';
import { FEATURES } from '../../config/features';

const CANDIDATES: { problem: string; size: number; measurable: number; unsolved: number; fit: number; note: string }[] = [
  { problem: 'Always-on coupons paid to buyers who would buy anyway', size: 4, measurable: 5, unsolved: 5, fit: 5, note: 'Chosen. Large, invisible today, provable with a holdout, and it lives at checkout where Razorpay already is.' },
  { problem: 'Cash-on-delivery orders that fail delivery (RTO)', size: 5, measurable: 4, unsolved: 2, fit: 3, note: 'Big, but Magic Checkout already offers RTO protection; kept as a next experiment.' },
  { problem: 'Abandoned carts', size: 4, measurable: 4, unsolved: 1, fit: 4, note: 'A Cart Abandonment agent already exists; Smart Offers can plug into it later.' },
  { problem: 'Failed payments that are not retried', size: 3, measurable: 4, unsolved: 2, fit: 3, note: 'Smart retries already exist in the payments stack.' },
  { problem: 'Creator payouts and code tracking', size: 2, measurable: 2, unsolved: 4, fit: 2, note: 'Real pain, but operational, with little revenue upside. Leak detection is folded into Smart Offers.' },
];

export function About() {
  const { model, derived } = useModel();
  const nav = useNavigate();
  const p = model.profile;
  const ret = derived.a10.rows.find((r) => r.group === 'returning');
  return (
    <div className="page about">
      <PageHeader title="About this concept" sub="Smart Offers: why this problem, for whom, and what we built. Concept prototype for the Razorpay × ISB Build Challenge. Not a Razorpay product. All data is synthetic." actions={<button className="btn primary" onClick={() => nav('/')}>Open the dashboard</button>} />

      <section className="card pad">
        <h2>The problem in one line</h2>
        <p className="lead">D2C fashion brands pay always-on coupons to shoppers who would have bought anyway, and they can't see it, because nothing measures what a discount actually adds.</p>
        <p>For the demo store, {p.displayName}: last month ALPHA10 cost <b>{inr(derived.a10.spend)}</b> and returned <b>{xr(derived.a10.ret)}</b>{FEATURES.netReturns ? ' after returns' : ''} against a {xr(derived.breakEven)} break-even, a loss of <b>{inr(Math.abs(derived.a10.profit))}</b>. {ret && <>{pctOf(ret.spend / derived.a10.spend, 0)} of it went to returning buyers, who buy {num(model.groups.find((g) => g.id === 'returning')!.baseConversion * 100)} times in 100 without any offer.</>} All coupons together were <b>{pctOf(derived.store.discountShare)}</b> of sales.</p>
        <p className="small muted">Size of the opportunity (assumptions to validate with Razorpay data): the target cohort is Instagram- and creator-led fashion brands selling ₹20–50 lakh a month on Magic Checkout with an always-on code. If a typical store wastes a similar share, the saving is roughly the {inr(Math.abs(derived.a10.profit))} a month shown here, per store, before any growth from better-targeted offers.</p>
      </section>

      <section className="card pad">
        <h2>How we chose it</h2>
        <p className="small">Five merchant problems near checkout, scored 1–5 by us (judgement, not data) on: size of the money at stake, whether the result can be <b>measured</b> (a holdout), whether Razorpay <b>doesn't already solve it</b>, and fit with Ray and Agent Studio.</p>
        <div className="tbl-wrap">
          <table className="dtable compact">
            <thead><tr><th>Problem</th><th>Size</th><th>Measurable</th><th>Not yet solved</th><th>Fit</th><th>Total</th><th>Note</th></tr></thead>
            <tbody>{CANDIDATES.map((c, i) => (
              <tr key={c.problem} className={i === 0 ? 'chosen' : ''}><td><b>{c.problem}</b></td><td>{c.size}</td><td>{c.measurable}</td><td>{c.unsolved}</td><td>{c.fit}</td><td><b>{c.size + c.measurable + c.unsolved + c.fit}</b></td><td className="wrap">{c.note}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card pad grid-2">
        <div>
          <h2>Who the merchant is</h2>
          <p><b>{p.founderName}, founder of {p.displayName}</b> (synthetic). {p.story}</p>
          <ul className="plain">
            <li>About {inr(derived.store.gmv)} a month, {num(derived.store.orders)} orders, {num(derived.store.checkouts)} checkouts</li>
            <li>Keeps about {inr(derived.margin * 1000)} of every ₹1,000 sale ({pctOf(derived.margin, 0)} margin)</li>
            <li>{p.codSharePct}% cash on delivery; 12 creator codes</li>
          </ul>
          <h3>Job to be done</h3>
          <p>"When I spend on discounts, I want the money to go only where it brings orders I wouldn't get anyway, so I can grow without giving away my margin."</p>
        </div>
        <div>
          <h2>How they work today</h2>
          <ol className="plain">
            <li>Run a 10% welcome code (ALPHA10) as a site pop-up for everyone. It also spreads to coupon sites.</li>
            <li>Give each creator a 15% code and track it in a spreadsheet.</li>
            <li>Judge discounts by total orders and Meta ad ROAS, never against a group that got no discount.</li>
            <li>Notice the margin squeeze in the monthly P&amp;L, too late to tell which discount caused it.</li>
          </ol>
          <h3>Evidence</h3>
          <p className="small">Shaped by conversations with D2C founders during the build (see the AI build log). Treated as <b>hypotheses to validate</b>: (1) merchants can't tell incremental orders from discounted ones; (2) they won't hand pricing to a black box, so approval and a kill switch are required; (3) they will accept a small holdout if its cost is shown. Validation plan: a two-week shadow run on 5 Magic Checkout merchants, comparing estimates with measured lift.</p>
        </div>
      </section>

      <section className="card pad">
        <h2>The product loop</h2>
        <div className="loop">
          {[
            ['Find', 'Ray flags a coupon below break-even and shows the signals'],
            ['Decide', 'An offer or none per shopper group, for profit, within budget'],
            ['Approve', 'Nothing spends money without a click; kill switch any time'],
            ['Run', 'Precomputed checkout table; agent runs daily at 06:00'],
            ['Prove', '10% holdout, ranges, "still learning"'],
            ['Review weekly', 'Monday review re-plans from results; you approve changes'],
            ['Decide on day 30', 'Keep (pay 1% of proven sales), extend, or stop'],
            ['Grow', 'Next experiments: COD → prepaid, abandoned carts, creator codes'],
          ].map(([h, d], i) => <div key={h} className="loop-step"><span>{i + 1}</span><b>{h}</b><p>{d}</p></div>)}
        </div>
        <p className="small">Expected result for {p.displayName}: <b>{inrSigned(derived.defaultPlan.profit)}</b> a month vs ALPHA10's {inrSigned(derived.a10.profit)}; a simple "first orders only" rule would make {inrSigned(derived.rule.profit)}.</p>
      </section>

      <section className="card pad grid-2">
        <div>
          <h2>What we deliberately did not build</h2>
          <ul className="plain">
            <li><b>Per-shopper pricing.</b> Unfair to shoppers, hard to explain, and risky for trust. Groups only, using five allowed signals.</li>
            <li><b>A haggling chatbot.</b> Adds friction at checkout; no AI in the payment path.</li>
            <li><b>Ad-spend optimisation.</b> A different buyer and a different data source.</li>
            <li><b>New offer types</b> (prepaid cashback etc.). Proposed as next experiments, each needing its own test.</li>
            <li><b>Full Banking+ and Payroll.</b> Overview pages only; they don't serve this job.</li>
          </ul>
        </div>
        <div>
          <h2>Risks and how we handle them</h2>
          <ul className="plain">
            <li><b>Wrong margin flips the plan.</b> Margin asked in plain words, sanity check, "what if 30%" scenario.</li>
            <li><b>Small groups take long to prove.</b> Ranges, "still learning", no decisions before day 14, fee on the lower bound.</li>
            <li><b>Runaway spend.</b> Budget hard stop, daily cap, ₹250 per order, one offer per order.</li>
            <li><b>Checkout slows down.</b> Lookup table, 50 ms budget, store default on failure.</li>
            <li><b>Privacy.</b> Peer data only as averages of 20+ stores; no names; contacts masked.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
