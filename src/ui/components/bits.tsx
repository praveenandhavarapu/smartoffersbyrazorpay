import type { ReactNode } from 'react';
import type { OfferId } from '../../data/types';
import { OFFER_BY_ID } from '../../data/fixtures';

export const CONCEPT_LABEL = 'Concept prototype for the Razorpay × ISB Build Challenge. Not a Razorpay product. All data is synthetic.';

export function OfferChip({ offer, muted }: { offer: OfferId; muted?: boolean }) {
  const cls = offer === 'none' ? 'offer none' : offer.startsWith('free_shipping') ? 'offer fs' : 'offer';
  return <span className={cls} style={muted ? { opacity: 0.6 } : undefined}>{OFFER_BY_ID[offer].label}</span>;
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'warn' | 'bad' }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`v ${tone === 'bad' ? 'bad-v' : ''}`}>{value}</div>
      {sub !== undefined && <div className={`d ${tone === 'up' ? 'up' : tone === 'warn' || tone === 'bad' ? 'warn' : ''}`}>{sub}</div>}
    </div>
  );
}

export const MonoTag = ({ children, tone }: { children: ReactNode; tone?: 'green' | 'amber' }) => <span className={`mono-tag ${tone ?? ''}`}>{children}</span>;

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={`banner ${tone}`} role="status">{children}</div>;
}

/** Short group name for tight spaces: "New · from Instagram/Meta ads · cart under ₹1,500" -> "New · ads · under ₹1,500". */
export function shortGroup(label: string): string {
  return label.replace('from Instagram/Meta ads', 'ads').replace('from a creator link (no code typed)', 'creator link').replace('ordered in the last 120 days', '≤120 days').replace('last order 120+ days ago', '120+ days').replace('cart ', '');
}
