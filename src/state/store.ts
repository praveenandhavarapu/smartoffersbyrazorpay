/**
 * App state. Persists ONLY user inputs (settings, approvals, overrides, pause state) and the audit log
 * under a versioned localStorage key. Everything else is recomputed from the engine on load.
 */
import { create } from 'zustand';
import type { Goal, GroupId, OfferId } from '../data/types';
import { DEMO_DATES, type Moment } from '../lib/dates';
import { makeEntry, type Actor, type AuditEntry } from './audit';
import type { InstantSettlement } from '../data/ledgerQueries';

export const STORAGE_KEY = 'smart-offers:v1';

export type Settings = {
  budget: number;
  keepPer1000: number; // "what do you keep from a ₹1,000 sale" -> margin
  goal: Goal;
  ordersFloorPct: number;
  allowedOffers: OfferId[];
  festiveWindow: boolean;
  maxDiscountInr: number;
};

export const DEFAULT_USER_SETTINGS: Settings = {
  budget: 100000, keepPer1000: 400, goal: 'most_profit', ordersFloorPct: 5,
  allowedOffers: ['free_shipping', 'flat_100', 'flat_200'], festiveWindow: true, maxDiscountInr: 250,
};

type Persisted = {
  settings: Settings;
  approved: boolean;
  approvedSettings: Settings | null;
  overrides: Partial<Record<GroupId, OfferId>>;
  killed: boolean;
  moment: Moment;
  creatorFix: 'pending' | 'limited' | 'kept';
  rayMode: 'live' | 'demo';
  settlementMode: 't1' | 'instant';
  instantSettlements: InstantSettlement[];
  audit: AuditEntry[];
};

type Ephemeral = { snapshot: 'day20' | 'day60'; outage: boolean };

type Actions = {
  setSettings: (patch: Partial<Settings>) => void;
  approve: () => void;
  jump20: () => void;
  setSnapshot: (s: 'day20' | 'day60') => void;
  applyOverride: (g: GroupId, o: OfferId, from: OfferId, costNote: string, actor?: Actor) => void;
  clearOverride: (g: GroupId) => void;
  kill: () => void;
  resume: () => void;
  setOutage: (v: boolean) => void;
  setCreatorFix: (v: 'limited' | 'kept') => void;
  logDraft: (summary: string) => void;
  setRayMode: (m: 'live' | 'demo') => void;
  setSettlementMode: (m: 't1' | 'instant') => void;
  settleInstant: (s: InstantSettlement) => void;
  reset: () => void;
};

export type AppState = Persisted & Ephemeral & Actions;

const initial: Persisted = {
  settings: DEFAULT_USER_SETTINGS, approved: false, approvedSettings: null, overrides: {}, killed: false,
  moment: 'before', creatorFix: 'pending', rayMode: 'live', settlementMode: 't1', instantSettlements: [], audit: [],
};

function load(): Persisted {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return initial;
    const p = JSON.parse(raw) as Partial<Persisted>;
    return { ...initial, ...p, settings: { ...DEFAULT_USER_SETTINGS, ...(p.settings ?? {}) } };
  } catch {
    return initial;
  }
}

function save(s: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: demo still works for this visit */
  }
}

const pick = (s: AppState): Persisted => ({
  settings: s.settings, approved: s.approved, approvedSettings: s.approvedSettings, overrides: s.overrides,
  killed: s.killed, moment: s.moment, creatorFix: s.creatorFix, rayMode: s.rayMode, settlementMode: s.settlementMode,
  instantSettlements: s.instantSettlements, audit: s.audit,
});

const describe = (s: Settings) =>
  `budget ₹${s.budget.toLocaleString('en-IN')}, keep ₹${s.keepPer1000} of ₹1,000, goal ${s.goal}${s.goal === 'orders_steady' ? ` (floor ${s.ordersFloorPct}%)` : ''}, offers ${s.allowedOffers.join('/')}`;

export const useStore = create<AppState>((set, get) => {
  const log = (actor: Actor, action: AuditEntry['action'], summary: string, before?: string, after?: string) =>
    set((st) => ({ audit: [...st.audit, makeEntry(st.audit, { actor, action, summary, before, after, demoDate: DEMO_DATES[st.moment] })] }));
  return {
    ...load(),
    snapshot: 'day20',
    outage: false,
    setSettings: (patch) => {
      const before = get().settings;
      const after = { ...before, ...patch };
      set({ settings: after });
      if (get().approved) log('Merchant (Praveen)', 'rule_change', 'Changed plan settings', describe(before), describe(after));
    },
    approve: () => {
      const s = get().settings;
      set({ approved: true, approvedSettings: s, killed: false });
      log('Merchant (Praveen)', 'approve', 'Approved Smart Offers plan and went live (ALPHA10 retired, 10% holdout)', 'ALPHA10 for everyone', describe(s));
    },
    jump20: () => set({ moment: 'day20', snapshot: 'day20' }),
    setSnapshot: (snapshot) => set({ snapshot }),
    applyOverride: (g, o, from, costNote, actor = 'Merchant (Praveen)') => {
      set((st) => ({ overrides: { ...st.overrides, [g]: o } }));
      log(actor, 'override', `Override ${g}: ${costNote}`, from, o);
    },
    clearOverride: (g) => {
      const before = get().overrides[g];
      set((st) => {
        const next = { ...st.overrides };
        delete next[g];
        return { overrides: next };
      });
      log('Merchant (Praveen)', 'clear_override', `Removed override for ${g}`, before, 'engine choice');
    },
    kill: () => {
      set({ killed: true });
      log('Merchant (Praveen)', 'kill_switch', 'Kill switch: every group set to no offer', 'plan live', 'all offers off');
    },
    resume: () => {
      set({ killed: false });
      log('Merchant (Praveen)', 'resume', 'Resumed Smart Offers', 'all offers off', 'plan live');
    },
    setOutage: (outage) => set({ outage }),
    setCreatorFix: (v) => {
      set({ creatorFix: v });
      log('Merchant (Praveen)', 'creator_fix', v === 'limited' ? 'MEERA15 limited to first orders' : 'MEERA15 kept as is', 'any order', v === 'limited' ? 'first orders only' : 'any order');
    },
    logDraft: (summary) => log('Ray (draft)', 'draft', summary),
    setRayMode: (rayMode) => set({ rayMode }),
    setSettlementMode: (m) => {
      const before = get().settlementMode;
      set({ settlementMode: m });
      log('Merchant (Praveen)', 'rule_change', 'Changed settlement schedule', before === 't1' ? 'T+1' : 'Instant', m === 't1' ? 'T+1' : 'Instant');
    },
    settleInstant: (x) => {
      set((st) => ({ instantSettlements: [...st.instantSettlements, x] }));
      log('Merchant (Praveen)', 'settle_instant', `Instant settlement of ₹${(x.amount / 100).toLocaleString('en-IN')} (fee ₹${(x.fee / 100).toLocaleString('en-IN')})`);
    },
    reset: () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      set({ ...initial, snapshot: 'day20', outage: false });
    },
  };
});

useStore.subscribe((s) => save(pick(s)));

export const marginOf = (s: Settings): number => s.keepPer1000 / 1000;
