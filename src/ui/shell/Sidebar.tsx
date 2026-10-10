import { NavLink } from 'react-router-dom';

const MAIN = [
  { to: '/', label: 'Home', ic: '⌂', end: true },
  { to: '/transactions', label: 'Transactions', ic: '⇄' },
  { to: '/settlements', label: 'Settlements', ic: '✓' },
  { to: '/reports', label: 'Reports', ic: '▤' },
];
export const PRODUCTS = [
  { slug: 'payment-links', label: 'Payment Links', ic: '⛓' },
  { slug: 'payment-pages', label: 'Payment Pages', ic: '▣' },
  { slug: 'invoices', label: 'Invoices', ic: '▤' },
  { slug: 'qr-codes', label: 'QR Codes', ic: '▦' },
  { slug: 'subscriptions', label: 'Subscriptions', ic: '↻' },
  { slug: 'smart-collect', label: 'Smart Collect', ic: '⌂' },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const link = ({ isActive }: { isActive: boolean }) => `side-item ${isActive ? 'on' : ''}`;
  return (
    <>
      {open && <div className="side-scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={onClose} aria-label="Payments menu">
        {MAIN.map((m) => <NavLink key={m.to} to={m.to} end={m.end} className={link}><i aria-hidden="true">{m.ic}</i>{m.label}</NavLink>)}
        <div className="side-cap">PAYMENT PRODUCTS</div>
        <NavLink to="/offers" className={link}><i aria-hidden="true">%</i>Offers &amp; Coupons <span className="badge-new">New</span></NavLink>
        {PRODUCTS.map((p) => <NavLink key={p.slug} to={`/products/${p.slug}`} className={link}><i aria-hidden="true">{p.ic}</i>{p.label}</NavLink>)}
        <div className="side-sep" />
        <NavLink to="/studio/smart-offers" className={link}><i aria-hidden="true">✦</i>Smart Offers Agent</NavLink>
        <NavLink to="/settings" className={link}><i aria-hidden="true">⚙</i>Account &amp; Settings</NavLink>
      </aside>
    </>
  );
}
