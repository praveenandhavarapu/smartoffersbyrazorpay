import { Bank, Card, Clover, Grid, People, Search } from './Icons';

export function RayNav({ initials = 'PR' }: { initials?: string }) {
  return (
    <div className="ray-nav">
      <div className="items">
        <span className="nav-item active"><Clover /> Ray AI</span>
        <span className="nav-item"><Card /> Payments</span>
        <span className="nav-item"><Bank /> Banking+</span>
        <span className="nav-item"><People /> Payroll</span>
        <span className="nav-item more"><Grid /> More</span>
      </div>
      <div className="ray-search" role="search"><Search /> Search payments, settlements…</div>
      <div className="avatar" aria-label="Merchant profile">{initials}</div>
    </div>
  );
}
