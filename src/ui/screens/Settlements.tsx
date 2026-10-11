import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLedger } from '../../state/useLedger';
import { DataEndNote } from '../components/lifecycle';
import { useStore } from '../../state/store';
import { instantFee, lastDays, settlementSummary, unsettledBalance } from '../../data/ledgerQueries';
import { INSTANT_FEE_RATE } from '../../data/generator/ledger';
import type { RzpSettlement } from '../../data/types';
import { dateTimeIST, inrP, inrP2, num } from '../../lib/format';
import { Drawer, DurationSelect, Empty, KV, PageHeader, Pager, Stat, Status } from '../components/kit';

const PAGE = 20;

export function Settlements() {
  const v = useLedger();
  const nav = useNavigate();
  const mode = useStore((s) => s.settlementMode);
  const instant = useStore((s) => s.instantSettlements);
  const settleInstant = useStore((s) => s.settleInstant);
  const [days, setDays] = useState('30');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<RzpSettlement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const sum = settlementSummary(v, lastDays(v, Number(days)));
  const balance = unsettledBalance(v, instant);
  const fee = instantFee(balance);
  const rows = sum.settlements;
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div className="page">
      <PageHeader title="Settlements" sub="Collected payments are paid to your bank account after platform fees, GST and refunds." actions={<button className="btn secondary" onClick={() => nav('/settings#settlement')}>Schedule: {mode === 't1' ? 'T+1' : 'Instant + T+1'}</button>} />
      <DataEndNote />
      <div className="stats3">
        <Stat label="Settled" value={inrP(sum.amount)} sub={`${num(sum.count)} settlements · fees + GST ${inrP(sum.fees)}`} />
        <Stat label="Next settlement" value={sum.next ? inrP(sum.next.amount) : '—'} sub={sum.next ? `${dateTimeIST(sum.next.created_at)} (T+1)` : 'nothing scheduled'} />
        {mode === 'instant' ? (
          <div className="stat card">
            <div className="stat-l">Available to settle now</div>
            <div className="stat-v">{inrP(balance)}</div>
            {confirming ? (
              <div className="btns">
                <span className="stat-s">Instant fee {inrP2(fee)} ({(INSTANT_FEE_RATE * 100).toFixed(2)}%, demo pricing). You receive {inrP2(balance - fee)}.</span>
                <button className="btn primary sm" onClick={() => { settleInstant({ id: `setl_INST${Date.now().toString(36).toUpperCase()}`, at: v.now - 60, amount: balance, fee }); setConfirming(false); }}>Confirm</button>
                <button className="btn secondary sm" onClick={() => setConfirming(false)}>Cancel</button>
              </div>
            ) : <button className="btn primary sm" disabled={balance <= 0} onClick={() => setConfirming(true)}>Settle now</button>}
          </div>
        ) : <Stat label="Instant settlement" value="Off" sub="Turn it on in Account & Settings to get paid in minutes." onClick={() => nav('/settings#settlement')} />}
      </div>
      <div className="filters"><DurationSelect value={days} onChange={(x) => { setDays(x); setPage(0); }} /></div>
      <section className="card">
        {slice.length === 0 ? <Empty title="No settlements in this period" /> : (
          <div className="tbl-wrap">
            <table className="dtable">
              <thead><tr><th>Settlement ID</th><th>Amount</th><th>Fees + GST</th><th>UTR</th><th>Settled on</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>{slice.map((s) => (
                <tr key={s.id} className="row-link" tabIndex={0} onClick={() => setOpen(s)} onKeyDown={(e) => e.key === 'Enter' && setOpen(s)}>
                  <td className="mono">{s.id}</td><td>{inrP2(s.amount)}</td><td>{inrP2(s.fees + s.tax)}</td><td className="mono">{s.utr}</td><td>{dateTimeIST(s.created_at)}</td><td>{s.type === 'instant' ? 'Instant' : 'T+1'}</td><td><Status s={s.status} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        <Pager page={page} pages={Math.ceil(rows.length / PAGE)} onPage={setPage} total={rows.length} />
      </section>
      {open && (
        <Drawer title={<>Settlement <span className="mono">{open.id}</span></>} onClose={() => setOpen(null)}>
          <div className="dr-amt">{inrP2(open.amount)} <Status s={open.status} /></div>
          <KV rows={[
            ['Type', open.type === 'instant' ? 'Instant (on demand)' : 'Standard T+1'],
            ['Settled on', dateTimeIST(open.created_at)],
            ['Covers', open.type === 'instant' ? 'Balance captured earlier today' : `Payments on ${dateTimeIST(open.covers.from, false)}`],
            ['Payments', num(open.covers.payments)], ['Refunds deducted', num(open.covers.refunds)],
            ['Fees', inrP2(open.fees)], ['GST', inrP2(open.tax)], ['UTR', <span className="mono">{open.utr}</span>],
          ]} />
        </Drawer>
      )}
    </div>
  );
}
