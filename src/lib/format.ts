/** Formatting helpers only. No figures live here. */

/**
 * Python-compatible round(): halves go to the even neighbour.
 * Uses a small epsilon so binary noise (e.g. 0.30000000000000004) does not flip a tie.
 */
export function roundHalfEven(x: number, decimals = 0): number {
  const m = 10 ** decimals;
  const v = x * m;
  const floor = Math.floor(v);
  const diff = v - floor;
  const eps = 1e-9 * Math.max(1, Math.abs(v));
  let r: number;
  if (Math.abs(diff - 0.5) <= eps) r = floor % 2 === 0 ? floor : floor + 1;
  else r = Math.round(v);
  const out = r / m;
  return Object.is(out, -0) ? 0 : out;
}

/** round half up for non-negative numbers (Python reference `rhu`). */
export const roundHalfUp = (x: number): number => Math.floor(x + 0.5);

/** Indian digit grouping: 185995 -> "1,85,995". */
export function groupIndian(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + ',' + last3;
}

/** ₹1,85,995 (rounded to the rupee). Negative values get a true minus sign. */
export function inr(n: number): string {
  const r = roundHalfEven(n);
  return (r < 0 ? '−' : '') + '₹' + groupIndian(Math.abs(r));
}

/** Signed money: +₹21,147 / −₹33,845. */
export function inrSigned(n: number): string {
  const r = roundHalfEven(n);
  return (r > 0 ? '+' : r < 0 ? '−' : '') + '₹' + groupIndian(Math.abs(r));
}

/** Lakh shorthand where space is tight: 185995 -> "₹1.86L". */
export function lakh(n: number, digits = 2): string {
  const v = roundHalfEven(Math.abs(n) / 100000, digits);
  return (n < 0 ? '−' : '') + '₹' + v.toFixed(digits) + 'L';
}

/** Return multiple: 3.06 -> "3.06x". */
export const xr = (n: number, digits = 2): string => roundHalfEven(n, digits).toFixed(digits) + 'x';

/** Fraction -> percent string: 0.2404 -> "24.0%". */
export const pctOf = (f: number, digits = 1): string => roundHalfEven(f * 100, digits).toFixed(digits) + '%';

/** Already-percent value with sign: -3.6 -> "−3.6%". */
export function pctSigned(p: number, digits = 1): string {
  const r = roundHalfEven(p, digits);
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(digits) + '%';
}

/** Percentage points with sign: 7.6 -> "+7.6 pp". */
export function pp(p: number, digits = 1): string {
  const r = roundHalfEven(p, digits);
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(digits) + ' pp';
}

export const num = (n: number, digits = 0): string =>
  digits === 0 ? groupIndian(roundHalfEven(n)) : roundHalfEven(n, digits).toFixed(digits);

/** Mask an Indian mobile number: "+91 98••• ••210". */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(-10);
  if (d.length < 10) return '+91 ••••• •••••';
  return `+91 ${d.slice(0, 2)}••• ••${d.slice(7)}`;
}

/** Paise -> ₹ with Indian grouping (₹1,85,995). */
export const inrP = (paise: number): string => inr(paise / 100);
/** Paise -> ₹ with two decimals, as on payment rows (₹1,149.00). */
export function inrP2(paise: number): string {
  const neg = paise < 0;
  const a = Math.abs(Math.round(paise));
  return (neg ? '−' : '') + '₹' + groupIndian(Math.floor(a / 100)) + '.' + String(a % 100).padStart(2, '0');
}
/** Unix seconds -> "10 Oct 2026, 14:05" in IST. */
export function dateTimeIST(t: number, withTime = true): string {
  const d = new Date((t + 19800) * 1000);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const base = `${d.getUTCDate()} ${M} ${d.getUTCFullYear()}`;
  return withTime ? `${base}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : base;
}
