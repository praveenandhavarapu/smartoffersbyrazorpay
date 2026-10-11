import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLedger } from '../../state/useLedger';
import { DataEndNote } from '../components/lifecycle';
import { lastDays, paymentSummary, inRange } from '../../data/ledgerQueries';
import { OFFER_BY_ID } from '../../data/fixtures';
import type { RzpOrder, RzpPayment } from '../../data/types';
import { dateTimeIST, inrP, inrP2, num } from '../../lib/format';
import { DurationSelect, Drawer, Empty, KV, PageHeader, Pager, Stat, Status, Tabs } from '../components/kit';

type Tab = 'payments' | 'orders' | 'refunds' | 'disputes';
const PAGE = 25;

function methodText(p: RzpPayment): string {
  if (p.method === 'upi') return `UPI · ${p.vpa ?? ''}`;
  if (p.method === 'card') return `${p.card?.network ?? 'Card'} ${p.card?.type ?? ''} •••• ${p.card?.last4 ?? ''}`;
  if (p.method === 'netbanking') return `Netbanking · ${p.bank ?? ''}`;
  return `Wallet · ${p.wallet ?? ''}`;
}

function PaymentDrawer({ p, order, onClose }: { p: RzpPayment; order?: RzpOrder; onClose: () => void }) {
  const v = useLedger();
  const refund = v.refunds.find((f) => f.payment_id === p.id);
  const dispute = v.disputes.find((d) => d.payment_id === p.id);
  return (
    <Drawer title={<>Payment <span className="mono">{p.id}</span></>} onClose={onClose}>
      <div className="dr-amt">{inrP2(p.amount)} <Status s={p.status} /></div>
      <KV rows={[
        ['Order ID', <span className="mono">{p.order_id}</span>],
        ['Created', dateTimeIST(p.created_at)],
        ['Method', methodText(p)],
        ['Customer', <>{p.contact} · {p.email}</>],
        ['Fee (2%)', p.captured ? inrP2(p.fee ?? 0) : '—'],
        ['GST on fee', p.captured ? inrP2(p.tax ?? 0) : '—'],
        ['Settled amount', p.captured ? inrP2(p.amount - (p.fee ?? 0) - (p.tax ?? 0)) : '—'],
        ['Smart Offer', p.offer_id ? OFFER_BY_ID[p.offer_id].label : 'None'],
        ['Coupon', order?.promotions.map((x) => x.code).join(', ') || 'None'],
        ...(p.error_description ? [['Failure reason', `${p.error_code}: ${p.error_description}`] as [string, string]] : []),
        ...(refund ? [['Refund', `${inrP2(refund.amount)} on ${dateTimeIST(refund.created_at, false)} (${refund.speed_processed}) · ${refund.notes.reason ?? ''}`] as [string, string]] : []),
        ...(dispute ? [['Dispute', `${dispute.status.replace('_', ' ')} · ${dispute.reason_code.replace(/_/g, ' ')}`] as [string, string]] : []),
      ]} />
      <p className="small muted">Synthetic demo data. Contacts are always masked.</p>
    </Drawer>
  );
}

export function Transactions() {
  const v = useLedger();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) ?? 'payments';
  const [days, setDays] = useState(sp.get('d') ?? '30');
  const [status, setStatus] = useState(sp.get('status') ?? 'all');
  const [method, setMethod] = useState('all');
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(sp.get('q')?.startsWith('pay_') ? sp.get('q') : null);
  const range = lastDays(v, Number(days));
  const sum = paymentSummary(v, range);
  const orderById = useMemo(() => new Map<string, RzpOrder>(v.orders.map((o) => [o.id, o])), [v]);
  const setTab = (t: Tab) => { setSp({ tab: t }); setPage(0); };
  const query = q.trim().toLowerCase();

  const payments = useMemo(() => v.payments.filter((p) => inRange(p.created_at, range) && (status === 'all' || p.status === status) && (method === 'all' || p.method === method)
    && (!query || p.id.toLowerCase().includes(query) || p.order_id.toLowerCase().includes(query))).reverse(), [v, range.from, range.to, status, method, query]);
  const orders = useMemo(() => v.orders.filter((o) => inRange(o.created_at, range) && (!query || o.id.toLowerCase().includes(query))).reverse(), [v, range.from, range.to, query]);
  const refunds = v.refunds.filter((f) => inRange(f.created_at, range)).reverse();
  const openPayment = open ? v.payments.find((p) => p.id === open) : undefined;
  const rows = tab === 'payments' ? payments : tab === 'orders' ? orders : tab === 'refunds' ? refunds : v.disputes;
  const pages = Math.ceil(rows.length / PAGE);
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const openDisputes = v.disputes.filter((d) => d.status === 'open' || d.status === 'under_review');

  return (
    <div className="page">
      <PageHeader title="Transactions" sub="Payments, orders, refunds and disputes" />
      <DataEndNote />
      <div className="stat-hero card"><div className="stat-l">Collected amount</div><div className="stat-big">{inrP(sum.collected)}</div><div className="stat-s">from {num(sum.capturedCount)} captured payments · {DurationLabel(days)}</div></div>
      <div className="stats3">
        <Stat label="Refunds" value={inrP(sum.refunded)} sub={`${num(sum.refundsCount)} processed`} onClick={() => setTab('refunds')} />
        <Stat label="Disputes" value={inrP(openDisputes.reduce((a, d) => a + d.amount, 0))} sub={`${openDisputes.filter((d) => d.status === 'open').length} open · ${openDisputes.filter((d) => d.status === 'under_review').length} under review`} onClick={() => setTab('disputes')} />
        <Stat label="Failed" value={num(sum.failedCount)} sub="payments" tone={sum.failedCount ? 'bad' : undefined} onClick={() => { setSp({ tab: 'payments' }); setStatus('failed'); setPage(0); }} />
      </div>

      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'payments', label: 'Payments' }, { id: 'orders', label: 'Orders' }, { id: 'refunds', label: 'Refunds' }, { id: 'disputes', label: 'Disputes' }]} />
      <div className="filters">
        {tab !== 'disputes' && <DurationSelect value={days} onChange={(x) => { setDays(x); setPage(0); }} />}
        {tab === 'payments' && (
          <>
            <label className="filter">Status<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="all">All</option><option value="captured">Captured</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select></label>
            <label className="filter">Method<select value={method} onChange={(e) => { setMethod(e.target.value); setPage(0); }}><option value="all">All</option><option value="upi">UPI</option><option value="card">Card</option><option value="netbanking">Netbanking</option><option value="wallet">Wallet</option></select></label>
          </>
        )}
        {(tab === 'payments' || tab === 'orders') && <label className="filter grow">Search<input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={tab === 'orders' ? 'order_…' : 'pay_… or order_…'} /></label>}
      </div>

      <section className="card">
        {slice.length === 0 ? <Empty title="Nothing here for these filters">Try a longer duration or clear the search.</Empty> : (
          <div className="tbl-wrap">
            <table className="dtable">
              {tab === 'payments' && (
                <>
                  <thead><tr><th>Payment ID</th><th>Amount</th><th>Method</th><th>Customer</th><th>Created</th><th>Status</th></tr></thead>
                  <tbody>{(slice as RzpPayment[]).map((p) => (
                    <tr key={p.id} className="row-link" tabIndex={0} onClick={() => setOpen(p.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(p.id)}>
                      <td className="mono">{p.id}{p.offer_id && <span className="tag-so">Smart Offer</span>}</td><td>{inrP2(p.amount)}</td><td>{p.method}</td><td>{p.contact}</td><td>{dateTimeIST(p.created_at)}</td><td><Status s={p.status} /></td>
                    </tr>))}</tbody>
                </>
              )}
              {tab === 'orders' && (
                <>
                  <thead><tr><th>Order ID</th><th>Amount</th><th>Payment</th><th>Coupon / offer</th><th>Created</th><th>Status</th></tr></thead>
                  <tbody>{(slice as RzpOrder[]).map((o) => (
                    <tr key={o.id}><td className="mono">{o.id}</td><td>{inrP2(o.amount)}</td><td>{o.notes.cod ? 'Cash on delivery' : 'Prepaid'}</td>
                      <td>{o.promotions.map((x) => x.code).join(', ') || '—'}</td><td>{dateTimeIST(o.created_at)}</td><td><Status s={o.notes.rto ? 'rto' : o.notes.returned ? 'returned' : o.status} /></td></tr>))}</tbody>
                </>
              )}
              {tab === 'refunds' && (
                <>
                  <thead><tr><th>Refund ID</th><th>Amount</th><th>Payment ID</th><th>Speed</th><th>Created</th><th>Status</th></tr></thead>
                  <tbody>{(slice as typeof refunds).map((f) => (
                    <tr key={f.id} className="row-link" onClick={() => setOpen(f.payment_id)}><td className="mono">{f.id}</td><td>{inrP2(f.amount)}</td><td className="mono">{f.payment_id}</td><td>{f.speed_processed}</td><td>{dateTimeIST(f.created_at)}</td><td><Status s={f.status} /></td></tr>))}</tbody>
                </>
              )}
              {tab === 'disputes' && (
                <>
                  <thead><tr><th>Dispute ID</th><th>Amount</th><th>Reason</th><th>Opened</th><th>Respond by</th><th>Status</th></tr></thead>
                  <tbody>{(slice as typeof v.disputes).map((d) => (
                    <tr key={d.id} className="row-link" onClick={() => setOpen(d.payment_id)}><td className="mono">{d.id}</td><td>{inrP2(d.amount)}</td><td>{d.reason_code.replace(/_/g, ' ')}</td><td>{dateTimeIST(d.created_at, false)}</td><td>{dateTimeIST(d.respond_by, false)}</td><td><Status s={d.status} /></td></tr>))}</tbody>
                </>
              )}
            </table>
          </div>
        )}
        <Pager page={page} pages={pages} onPage={setPage} total={rows.length} />
      </section>
      {openPayment && <PaymentDrawer p={openPayment} order={orderById.get(openPayment.order_id)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DurationLabel(d: string): string {
  return ({ '1': 'today', '7': 'last 7 days', '30': 'last 30 days', '90': 'last 90 days', '183': 'last 6 months' } as Record<string, string>)[d] ?? `last ${d} days`;
}
