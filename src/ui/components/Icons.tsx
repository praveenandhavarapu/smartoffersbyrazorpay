import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const S = (props: P) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />;

/** Generic four-petal icon (Ray-style, not a brand asset). */
export const Clover = (p: P) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <g fill="currentColor"><rect x="2.5" y="2.5" width="9" height="9" rx="4.5" /><rect x="12.5" y="2.5" width="9" height="9" rx="4.5" /><rect x="2.5" y="12.5" width="9" height="9" rx="4.5" /><rect x="12.5" y="12.5" width="9" height="9" rx="4.5" /></g>
  </svg>
);
export const Card = (p: P) => <S {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></S>;
export const Bank = (p: P) => <S {...p}><path d="M4 20h16M6 17V10M10 17V10M14 17V10M18 17V10M3 9l9-5 9 5z" /></S>;
export const People = (p: P) => <S {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" /><path d="M16 5.5a3 3 0 010 5.6M18 14.3c1.5.7 2.6 2.2 3 4.7" /></S>;
export const Search = (p: P) => <S strokeWidth={2} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></S>;
export const Grid = (p: P) => <S {...p}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></S>;
export const Check = (p: P) => <S strokeWidth={2.2} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></S>;
export const X = (p: P) => <S strokeWidth={2.2} {...p}><path d="M6 6l12 12M18 6L6 18" /></S>;
export const Shield = (p: P) => <S {...p}><path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z" /><path d="M9 12l2 2 4-4" /></S>;
export const Send = (p: P) => <S strokeWidth={2} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>;
export const Tag = (p: P) => <S {...p}><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></S>;
export const Info = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></S>;
export const Alert = (p: P) => <S {...p}><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5h.01" /></S>;
export const Play = (p: P) => <S {...p}><path d="M7 5l12 7-12 7z" /></S>;
export const Pause = (p: P) => <S {...p}><path d="M8 5v14M16 5v14" /></S>;
export const Lock = (p: P) => <S {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></S>;
export const Power = (p: P) => <S {...p}><path d="M12 3v8M6.3 6.3a8 8 0 1011.4 0" /></S>;
