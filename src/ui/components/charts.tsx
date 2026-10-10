/** Hand-rolled charts. Palette validated with the dataviz validator (CVD-safe; low-contrast slots always carry text labels). */
import { useState } from 'react';
import { inr, inrP, lakh } from '../../lib/format';

export const METHOD_COLORS: Record<string, string> = { upi: '#2a78d6', card: '#eb6834', netbanking: '#1baf7a', wallet: '#eda100' };
export const METHOD_LABEL: Record<string, string> = { upi: 'UPI', card: 'Cards', netbanking: 'Netbanking', wallet: 'Wallets' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Single series: collected per month. No legend (the title names it); hover tooltip per bar; latest bar labelled. */
export function MonthlyBars({ data, partial = [] }: { data: { month: string; collected: number; count: number }[]; partial?: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.collected), 1);
  const W = 560, H = 180, pad = 24, gap = 10;
  const bw = (W - pad * 2 - gap * (data.length - 1)) / data.length;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label="Collected per month">
        <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="var(--line)" />
        {data.map((d, i) => {
          const h = Math.max(2, (d.collected / max) * (H - 20));
          const x = pad + i * (bw + gap);
          const [y, m] = d.month.split('-').map(Number);
          return (
            <g key={d.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              <rect x={x - 4} y={0} width={bw + 8} height={H} fill="transparent" />
              <path d={`M${x},${H} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`} fill={hover === i ? '#1c5cab' : '#2a78d6'} />
              <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--ink3)">{MONTHS[m - 1]}{partial.includes(d.month) ? '*' : ''}{i === 0 ? ` ${String(y).slice(2)}` : ''}</text>
              {(i === data.length - 1 || hover === i) && <text x={x + bw / 2} y={H - h - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)">{lakh(d.collected / 100)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && <div className="tip">{MONTHS[Number(data[hover].month.split('-')[1]) - 1]}: {inrP(data[hover].collected)} from {data[hover].count.toLocaleString('en-IN')} payments</div>}
    </div>
  );
}

/** Stacked share bar with a legend that always shows labels and percentages. */
export function MethodMix({ mix }: { mix: Record<string, { count: number; amount: number }> }) {
  const total = Object.values(mix).reduce((a, v) => a + v.count, 0) || 1;
  const keys = ['upi', 'card', 'netbanking', 'wallet'];
  return (
    <div className="mix">
      <div className="mix-bar" role="img" aria-label="Payment method mix">
        {keys.map((k) => mix[k]?.count ? <i key={k} title={`${METHOD_LABEL[k]} ${Math.round((mix[k].count / total) * 100)}%`} style={{ width: `${(mix[k].count / total) * 100}%`, background: METHOD_COLORS[k] }} /> : null)}
      </div>
      <div className="mix-leg">
        {keys.map((k) => <span key={k}><i style={{ background: METHOD_COLORS[k] }} />{METHOD_LABEL[k]} <b>{Math.round(((mix[k]?.count ?? 0) / total) * 100)}%</b></span>)}
      </div>
    </div>
  );
}

/** Single series, one bar per day; hover shows the day's numbers; first, last and hovered bars are labelled. */
export function DailyBars({ data }: { data: { date: string; collected: number; payments: number; failed: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.collected), 1);
  const W = 560, H = 150, pad = 8, gap = data.length > 30 ? 2 : 4;
  const bw = (W - pad * 2 - gap * (data.length - 1)) / data.length;
  const step = Math.ceil(data.length / 10);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label="Collected per day">
        <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="var(--line)" />
        {data.map((d, i) => {
          const h = Math.max(2, (d.collected / max) * (H - 18));
          const x = pad + i * (bw + gap);
          const r = Math.min(4, bw / 2);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              <rect x={x - gap / 2} y={0} width={bw + gap} height={H} fill="transparent" />
              <path d={`M${x},${H} v${-(h - r)} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`} fill={hover === i ? '#1c5cab' : '#2a78d6'} />
              {(i % step === 0 || i === data.length - 1) && <text x={x + bw / 2} y={H + 15} textAnchor="middle" fontSize="10" fill="var(--ink3)">{d.date.split(' ').slice(0, 2).join(' ')}</text>}
              {hover === i && <text x={x + bw / 2} y={H - h - 5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--ink)">{lakh(d.collected)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && <div className="tip">{data[hover].date}: {inr(data[hover].collected)} · {data[hover].payments} payments · {data[hover].failed} failed</div>}
    </div>
  );
}
