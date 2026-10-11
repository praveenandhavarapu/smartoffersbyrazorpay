/**
 * Storage migration v1 -> v2 (spec §3.4). v1 kept one editable `settings` plus `approvedSettings`.
 * In v2 the draft is `settings` whenever it differs from `approvedSettings` (see draftSettingsOf),
 * so a v1 edit that was never approved carries over as a draft, not as a live change.
 */
import type { AuditEntry } from './audit';
import type { Settings } from './store';

export const V1_DEFAULT_SETTINGS: Settings = {
  budget: 100000, keepPer1000: 400, goal: 'most_profit', ordersFloorPct: 5,
  allowedOffers: ['free_shipping', 'flat_100', 'flat_200'], festiveWindow: true, maxDiscountInr: 250,
};

export function sameSettings(a: Settings | null | undefined, b: Settings | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.budget === b.budget && a.keepPer1000 === b.keepPer1000 && a.goal === b.goal && a.ordersFloorPct === b.ordersFloorPct
    && a.festiveWindow === b.festiveWindow && a.maxDiscountInr === b.maxDiscountInr
    && a.allowedOffers.length === b.allowedOffers.length && a.allowedOffers.every((o) => b.allowedOffers.includes(o));
}

type V1Shape = { settings?: Settings; approved?: boolean; approvedSettings?: Settings | null; audit?: AuditEntry[] } & Record<string, unknown>;

export function migrateV1<T extends V1Shape>(v1: T, v2Defaults: Settings): T {
  const out: T = { ...v1 };
  // Never approved and still on the v1 defaults: start from the v2 defaults (keep ₹500 of ₹1,000).
  if (!v1.approved && (!v1.settings || sameSettings({ ...V1_DEFAULT_SETTINGS, ...v1.settings }, V1_DEFAULT_SETTINGS))) out.settings = v2Defaults;
  // Drop log noise: entries whose before and after are identical.
  out.audit = (v1.audit ?? []).filter((a) => !(a.before !== undefined && a.before === a.after));
  return out;
}
