/** Small shared building blocks for dashboard pages. */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from './Icons';

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-h">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="utabs" role="tablist">
      {items.map((i) => <button key={i.id} role="tab" aria-selected={value === i.id} className={value === i.id ? 'on' : ''} onClick={() => onChange(i.id)}>{i.label}</button>)}
    </div>
  );
}

export function Stat({ label, value, sub, onClick, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; onClick?: () => void; tone?: 'bad' | 'good' }) {
  const body = (
    <>
      <div className="stat-l">{label}{onClick && <span className="chev">›</span>}</div>
      <div className={`stat-v ${tone ?? ''}`}>{value}</div>
      {sub && <div className="stat-s">{sub}</div>}
    </>
  );
  return onClick ? <button className="stat card clickable" onClick={onClick}>{body}</button> : <div className="stat card">{body}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="empty-ic" aria-hidden="true" /><b>{title}</b>{children && <p>{children}</p>}{action}</div>;
}

export function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="drawer-bg" onClick={onClose}>
      <div className="drawer" role="dialog" aria-modal="true" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="drawer-h"><h4>{title}</h4><button className="icon-btn" onClick={onClose} aria-label="Close"><X width={16} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Pager({ page, pages, onPage, total }: { page: number; pages: number; onPage: (p: number) => void; total: number }) {
  if (pages <= 1) return <div className="pager muted small">{total} result{total === 1 ? '' : 's'}</div>;
  return (
    <div className="pager">
      <span className="muted small">{total.toLocaleString('en-IN')} results · page {page + 1} of {pages}</span>
      <button className="btn secondary sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
      <button className="btn secondary sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export function Status({ s }: { s: string }) {
  const tone = /captured|processed|paid|won|settled|live|completed/.test(s) ? 'ok' : /failed|lost|open/.test(s) ? 'bad' : /refunded|partial|scheduled|under_review|created|attempted|pending/.test(s) ? 'warn' : '';
  return <span className={`status ${tone}`}>{s.replace(/_/g, ' ')}</span>;
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return <dl className="kv">{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export const DURATIONS = [
  { id: '1', label: 'Today' }, { id: '7', label: 'Last 7 days' }, { id: '30', label: 'Last 30 days' }, { id: '90', label: 'Last 90 days' }, { id: '183', label: 'Last 6 months' },
] as const;

export function DurationSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="filter">Duration
      <select value={value} onChange={(e) => onChange(e.target.value)}>{DURATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
    </label>
  );
}

/** Download rows as CSV (client-side, synthetic data). */
export function downloadCsv(name: string, rows: (string | number)[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
