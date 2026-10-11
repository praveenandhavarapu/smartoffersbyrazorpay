import { useNavigate } from 'react-router-dom';
import { useModel } from '../../state/ModelContext';
import { useStore } from '../../state/store';
import { EXISTING_CODES } from '../../data/fixtures';
import { inr, inrSigned, num, xr } from '../../lib/format';
import { Clover } from '../components/Icons';
import { PageHeader } from '../components/kit';
import { FEATURES } from '../../config/features';
import { RETURN_LABEL } from '../../engine/net';

export function Offers() {
  const { derived } = useModel();
  const nav = useNavigate();
  const approved = useStore((s) => s.approved);
  const killed = useStore((s) => s.killed);
  const creatorFix = useStore((s) => s.creatorFix);
  const alpha10Restored = useStore((s) => s.alpha10Restored);
  const a10 = EXISTING_CODES.find((c) => c.code === 'ALPHA10')!;
  return (
    <div className="page">
      <PageHeader title="Offers & Coupons" sub="Discounts shown at checkout. Coupons are typed by shoppers; Smart Offers picks an offer, or none, per shopper group." />
      <button className="so-entry card" onClick={() => nav('/offers/smart')}>
        <span className="so-ic"><Clover /></span>
        <span className="so-body">
          <b>Smart Offers <span className="badge-new">New · AI agent</span></b>
          <span>{approved ? (FEATURES.netReturns ? (() => { const t = derived.snapshots[derived.today ?? 'day20']; return `${killed ? 'Paused' : 'Live'} · day ${t.days}: ${inrSigned(t.profit)} extra profit after returns, ${RETURN_LABEL.toLowerCase()} ${xr(t.ret)}`; })() : `${killed ? 'Paused' : 'Live'} · day 20: ${inrSigned(derived.snapshots.day20.profit)} extra profit, return ${xr(derived.snapshots.day20.ret)}`) : `ALPHA10 lost ${inr(Math.abs(derived.a10.profit))} last month. Replace it with offers that pay back, proven by a holdout.`}</span>
        </span>
        <span className="btn primary sm">{approved ? 'Open' : 'Set up'}</span>
      </button>
      <section className="card">
        <div className="sec-h pad-x"><h3>Coupons</h3><span className="muted small">last month (22 Aug – 20 Sep)</span></div>
        <div className="tbl-wrap">
          <table className="dtable">
            <thead><tr><th>Code</th><th>Type</th><th>Where</th><th>Spend last month</th><th>{RETURN_LABEL}</th><th>Status</th></tr></thead>
            <tbody>
              <tr className="row-link" onClick={() => nav('/ray?ask=Where did ALPHA10 go last month?')}>
                <td><b>ALPHA10</b></td><td>{a10.value}% off, max ₹{a10.max_discount_inr}</td><td>{a10.where}</td><td>{inr(derived.a10.spend)}</td>
                <td className={derived.a10.ret < derived.breakEven ? 'bad' : ''}>{xr(derived.a10.ret)}</td>
                <td>{alpha10Restored ? <span className="status ok">restored</span> : approved ? <span className="status warn">retired 21 Sep</span> : <span className="status ok">active</span>}</td>
              </tr>
              {derived.creators.rows.map((c) => (
                <tr key={c.code}>
                  <td><b>{c.code}</b></td><td>15% off, max ₹250</td><td>{c.creator} ({c.platform})</td><td>{num(c.uses)} uses · {num(c.returningUses)} by returning</td><td>—</td>
                  <td>{c.flag ? <span className="status bad">{creatorFix === 'limited' ? 'first orders only' : 'leaking'}</span> : <span className="status ok">active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
