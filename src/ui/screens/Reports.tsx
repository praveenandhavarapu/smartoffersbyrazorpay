import { useState } from 'react';
import { useLedger } from '../../state/useLedger';
import { useStore } from '../../state/store';
import { inRange, lastDays } from '../../data/ledgerQueries';
import { dateTimeIST } from '../../lib/format';
import { DurationSelect, PageHeader, downloadCsv } from '../components/kit';

const r2 = (p: number) => (p / 100).toFixed(2);

export function Reports() {
  const v = useLedger();
  const moment = useStore((s) => s.moment);
  const [days, setDays] = useState('30');
  const [done, setDone] = useState<string | null>(null);
  const range = lastDays(v, Number(days));
  const inR = (t: number) => inRange(t, range);
  const stamp = moment === 'before' ? '2026-09-20' : '2026-10-10';

  const reports: { group: string; name: string; desc: string; rows: () => (string | number)[][] }[] = [
    { group: 'Settlements', name: 'Settlements', desc: 'Settlements in the selected range: ID, date, amount, fees, GST, UTR, type.', rows: () => [['settlement_id', 'settled_at', 'amount', 'fees', 'tax', 'utr', 'type', 'status'], ...v.settlements.filter((s) => inR(s.created_at)).map((s) => [s.id, dateTimeIST(s.created_at), r2(s.amount), r2(s.fees), r2(s.tax), s.utr, s.type, s.status])] },
    { group: 'Settlements', name: 'Settlement recon', desc: 'Every payment and refund against its settlement.', rows: () => [['type', 'id', 'created_at', 'amount', 'fee', 'tax', 'settles_on'], ...v.payments.filter((p) => p.captured && inR(p.created_at)).map((p) => ['payment', p.id, dateTimeIST(p.created_at), r2(p.amount), r2(p.fee ?? 0), r2(p.tax ?? 0), 'T+1']), ...v.refunds.filter((f) => inR(f.created_at)).map((f) => ['refund', f.id, dateTimeIST(f.created_at), r2(-f.amount), '0.00', '0.00', 'T+1'])] },
    { group: 'Payments', name: 'Payments', desc: 'All payments created in the range: ID, status, method, amount, fee.', rows: () => [['payment_id', 'order_id', 'created_at', 'amount', 'status', 'method', 'fee', 'tax', 'error'], ...v.payments.filter((p) => inR(p.created_at)).map((p) => [p.id, p.order_id, dateTimeIST(p.created_at), r2(p.amount), p.status, p.method, r2(p.fee ?? 0), r2(p.tax ?? 0), p.error_description ?? ''])] },
    { group: 'Payments', name: 'Payments with offers', desc: 'Payments where a coupon or a Smart Offer was applied.', rows: () => { const ob = new Map<string, (typeof v.orders)[number]>(v.orders.map((o) => [o.id, o])); return [['payment_id', 'created_at', 'amount', 'coupon', 'smart_offer'], ...v.payments.filter((p) => p.captured && inR(p.created_at)).map((p) => [p.id, dateTimeIST(p.created_at), r2(p.amount), ob.get(p.order_id)?.promotions.map((x) => x.code).join(' ') ?? '', p.offer_id ?? '']).filter((r) => r[3] || r[4])]; } },
    { group: 'Payments', name: 'Refunds', desc: 'Refunds processed in the range.', rows: () => [['refund_id', 'payment_id', 'created_at', 'amount', 'speed', 'status'], ...v.refunds.filter((f) => inR(f.created_at)).map((f) => [f.id, f.payment_id, dateTimeIST(f.created_at), r2(f.amount), f.speed_processed, f.status])] },
    { group: 'Orders', name: 'Orders', desc: 'Orders including cash on delivery, returns and failed deliveries.', rows: () => [['order_id', 'created_at', 'amount', 'cod', 'returned', 'rto', 'promotions'], ...v.orders.filter((o) => inR(o.created_at)).map((o) => [o.id, dateTimeIST(o.created_at), r2(o.amount), String(Boolean(o.notes.cod)), String(Boolean(o.notes.returned)), String(Boolean(o.notes.rto)), o.promotions.map((x) => x.code).join(' ')])] },
  ];
  const groups = [...new Set(reports.map((r) => r.group))];
  return (
    <div className="page">
      <PageHeader title="Reports" sub="Generate reports for your transactions, settlements and orders. Files are CSV and contain synthetic data." actions={<DurationSelect value={days} onChange={setDays} />} />
      {done && <div className="banner" role="status">Downloaded {done}.</div>}
      {groups.map((g) => (
        <section key={g}>
          <div className="side-cap">{g.toUpperCase()}</div>
          <div className="report-grid">
            {reports.filter((r) => r.group === g).map((r) => (
              <div key={r.name} className="card report">
                <b>{r.name}</b>
                <p>{r.desc}</p>
                <button className="btn ghost sm" onClick={() => { const rows = r.rows(); downloadCsv(`${r.name.toLowerCase().replace(/\s+/g, '-')}-${stamp}-${days}d.csv`, rows); setDone(`${r.name} (${rows.length - 1} rows)`); }}>↓ Download report</button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
