/** Overview pages for products outside this concept's scope (clickable, honest about what they are). */
import { useNavigate, useParams } from 'react-router-dom';
import { PRODUCTS } from '../shell/Sidebar';
import { Empty, PageHeader } from '../components/kit';

const PRODUCT_COPY: Record<string, string> = {
  'payment-links': 'Create a link, share it on WhatsApp or SMS, and collect payment without a website.',
  'payment-pages': 'A hosted page to collect payments for products, events or donations.',
  invoices: 'GST-ready invoices that customers can pay online.',
  'qr-codes': 'UPI QR codes for in-store or on-package payments.',
  subscriptions: 'Recurring payments on cards and UPI AutoPay.',
  'smart-collect': 'Virtual accounts and UPI IDs that reconcile bank transfers automatically.',
};

export function ProductPage() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) return <div className="page"><Empty title="Page not found" action={<button className="btn secondary" onClick={() => nav('/')}>Go home</button>} /></div>;
  return (
    <div className="page">
      <PageHeader title={p.label} sub={PRODUCT_COPY[slug]} />
      <section className="card"><Empty title={`No ${p.label.toLowerCase()} yet`} action={<button className="btn secondary" onClick={() => nav('/offers')}>See Offers &amp; Coupons</button>}>Alpha Apparel sells through its website with Magic Checkout, so this product isn't used in the demo. This concept focuses on checkout offers.</Empty></section>
    </div>
  );
}

function Overview({ title, sub, items }: { title: string; sub: string; items: [string, string][] }) {
  return (
    <div className="page">
      <PageHeader title={title} sub={sub} />
      <div className="report-grid">{items.map(([h, d]) => <div key={h} className="card report"><b>{h}</b><p>{d}</p><span className="mono-tag">Not connected in this demo</span></div>)}</div>
    </div>
  );
}

export const Banking = () => (
  <Overview title="Banking+" sub="Business banking linked to your payments: current account, payouts and vendor payments in one place." items={[
    ['Current account', 'See your balance and statements next to settlements.'], ['Payouts', 'Pay vendors, refunds and creators in bulk over IMPS, NEFT or UPI.'],
    ['Vendor payments', 'Upload invoices, approve, and pay on the due date.'], ['Tax payments', 'Pay GST and TDS from the same account.'],
  ]} />
);

export const Payroll = () => (
  <Overview title="Payroll" sub="Salaries, compliance and payslips for your team." items={[
    ['Run payroll', 'Pay salaries on a schedule with automatic deductions.'], ['Compliance', 'PF, ESI, PT and TDS filed for you.'],
    ['Payslips', 'Employees get payslips and tax declarations online.'], ['Contractors', 'Pay freelancers and creators with TDS handled.'],
  ]} />
);
