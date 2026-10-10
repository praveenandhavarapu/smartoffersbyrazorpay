import { useState, type FormEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bank, Card, Clover, Grid, People, Search } from '../components/Icons';

const PAGES: { name: string; to: string }[] = [
  { name: 'Home', to: '/' }, { name: 'Transactions', to: '/transactions' }, { name: 'Payments', to: '/transactions' }, { name: 'Orders', to: '/transactions?tab=orders' },
  { name: 'Refunds', to: '/transactions?tab=refunds' }, { name: 'Disputes', to: '/transactions?tab=disputes' }, { name: 'Settlements', to: '/settlements' },
  { name: 'Reports', to: '/reports' }, { name: 'Offers & Coupons', to: '/offers' }, { name: 'Smart Offers', to: '/offers/smart' },
  { name: 'Ray AI', to: '/ray' }, { name: 'Agent Studio', to: '/studio' }, { name: 'Smart Offers Agent', to: '/studio/smart-offers' },
  { name: 'Account & Settings', to: '/settings' }, { name: 'Banking+', to: '/banking' }, { name: 'Payroll', to: '/payroll' },
];

const isPayments = (p: string) => !/^\/(ray|studio|banking|payroll)/.test(p);

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    if (!t) return;
    if (/^(pay|order|rfnd|setl|disp)_/i.test(t)) nav(`/transactions?q=${encodeURIComponent(t)}${/^order_/i.test(t) ? '&tab=orders' : ''}`);
    else nav(PAGES.find((p) => p.name.toLowerCase().includes(t.toLowerCase()))?.to ?? `/ray?ask=${encodeURIComponent(t)}`);
    setQ('');
  };
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
      <NavLink to="/" className="brand" aria-label="Dashboard home"><span className="brand-mark" aria-hidden="true">◆</span><span>Dashboard</span><em>concept</em></NavLink>
      <nav className="top-items" aria-label="Products">
        <NavLink to="/ray" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Clover /> Ray AI</NavLink>
        <NavLink to="/" className={() => `nav-item ${isPayments(pathname) ? 'active' : ''}`}><Card /> Payments</NavLink>
        <NavLink to="/studio" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Grid /> Agent Studio</NavLink>
        <NavLink to="/banking" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Bank /> Banking+</NavLink>
        <NavLink to="/payroll" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><People /> Payroll</NavLink>
        <div className="more-wrap">
          <button className="nav-item" aria-expanded={more} onClick={() => setMore(!more)}>More ▾</button>
          {more && (
            <div className="more-menu" onClick={() => setMore(false)}>
              <NavLink to="/settings">Account &amp; Settings</NavLink>
              <NavLink to="/reports">Reports</NavLink>
              <NavLink to="/offers">Offers &amp; Coupons</NavLink>
            </div>
          )}
        </div>
      </nav>
      <form className="ray-search" role="search" onSubmit={submit}>
        <Search />
        <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, payment IDs, or ask Ray" />
      </form>
      <NavLink to="/settings" className="avatar" aria-label="Account">PR</NavLink>
    </header>
  );
}
