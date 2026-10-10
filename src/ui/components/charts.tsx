/** Hand-rolled charts. Palette validated with the dataviz validator (CVD-safe; low-contrast slots always carry text labels). */
import { useState } from 'react';
import { inrP, lakh } from '../../lib/format';

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
