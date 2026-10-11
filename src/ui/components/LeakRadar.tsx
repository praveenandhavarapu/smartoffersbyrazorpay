/** v2 §14 (stretch): alert when a public code escapes to coupon sites. Synthetic referrer data, labelled. */
import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { fmtDate } from '../../lib/dates';
import { num, pctOf } from '../../lib/format';
import { leakRadar, LEAK } from '../../engine/leakRadar';

export function LeakRadar() {
  const r = useMemo(() => leakRadar(), []);
  const logDraft = useStore((s) => s.logDraft);
  const [done, setDone] = useState(false);
  if (!r.fired) return null;
  const max = Math.max(...r.days.map((d) => d.uses), 1);
  return (
    <section className="card pad leak">
      <span className="mono-tag amber">Leak radar · {r.code}</span>
      <h5>{r.code} looks public: {pctOf(r.share7, 0)} of its uses in the last 7 days came from coupon sites and deal channels (was {pctOf(r.shareBefore, 0)}){r.firstDay ? `, starting around ${fmtDate(r.firstDay, false)}` : ''}.</h5>
      <div className="leak-bars" role="img" aria-label={`${r.code} uses per day, last month; darker = from coupon sites`}>
        {r.days.map((d) => <i key={d.date} title={`${fmtDate(d.date, false)}: ${d.uses} uses, ${d.fromDeals} from deal sites`} style={{ height: `${(d.uses / max) * 100}%` }}><b style={{ height: `${d.uses ? (d.fromDeals / d.uses) * 100 : 0}%` }} /></i>)}
      </div>
      <p className="small">First-time shoppers using it: {num(r.firstPerDay7, 1)} a day in the last week vs {num(r.firstPerDayBefore, 1)} before. {num(r.fromDeals)} of {num(r.totalUses)} uses came via deal channels.</p>
      {done ? <p className="small good">Switched {r.code} to unique single-use codes (simulated). Logged.</p>
        : <button className="btn secondary sm" onClick={() => { logDraft(`Leak radar: switch ${r.code} to unique single-use codes (simulated)`); setDone(true); }}>Switch to unique single-use codes</button>}
      <p className="small muted">Uses are from last month's checkouts; referrers are synthetic for this concept. Alert when more than {pctOf(LEAK.alertShare, 0)} of a week's uses come from deal channels or first-time uses reach {LEAK.spike}× their earlier level.</p>
    </section>
  );
}
