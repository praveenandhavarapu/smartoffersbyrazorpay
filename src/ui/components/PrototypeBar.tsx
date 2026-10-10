import { NavLink } from 'react-router-dom';
import { useStore } from '../../state/store';
import { momentLabel } from '../../lib/dates';
import { useDemo } from './demoStore';
import { CONCEPT_LABEL } from './bits';

export const TABS = [
  { to: '/', label: 'Ray home', n: '1' },
  { to: '/ray', label: 'Setup & plan', n: '2' },
  { to: '/checkout', label: 'Checkout', n: '3' },
  { to: '/results', label: 'Results', n: '4' },
  { to: '/studio', label: 'Agent Studio', n: '5' },
  { to: '/settings', label: 'Guardrails & data', n: '6' },
];

export function PrototypeBar() {
  const moment = useStore((s) => s.moment);
  const reset = useStore((s) => s.reset);
  const start = useDemo((s) => s.start);
  return (
    <header className="proto">
      <div className="proto-in">
        <div className="proto-title">Smart Offers · concept</div>
        <p className="proto-note">{CONCEPT_LABEL}</p>
        <span className="clock mono-tag" aria-label="Demo clock">{momentLabel(moment)}</span>
        <div className="proto-actions">
          <button className="btn primary sm" onClick={start}>▶ Play demo</button>
          <button className="btn secondary sm" onClick={() => { if (confirm('Reset the demo? This clears approvals, overrides and the audit log.')) reset(); }}>Reset demo</button>
        </div>
        <nav className="tabs" aria-label="Screens">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? 'on' : '')}>
              <span>{t.n}</span>{t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
