/** Small seeded RNG (mulberry32) and helpers. Deterministic across runs. */
export const SEED = 20261010;

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (r: Rng, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** Box-Muller normal. */
export function normal(r: Rng, mean = 0, sd = 1): number {
  const u = Math.max(r(), 1e-12);
  const v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** FNV-1a 32-bit string hash. The live holdout rule is `hashId(customer_id) % 10 === 0`. */
export function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const isHoldout = (customerId: string): boolean => hashId(customerId) % 10 === 0;

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function rid(r: Rng, len = 14): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALNUM[Math.floor(r() * ALNUM.length)];
  return s;
}
