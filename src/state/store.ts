/**
 * App state. Persists ONLY user inputs (settings, approvals, overrides, pause state) and the audit log
 * under a versioned localStorage key. Everything else is recomputed from the engine on load.
 */
import { create } from 'zustand';
import type { Goal, GroupId, OfferId } from '../data/types';
import { DEMO_DATES, type Moment } from '../lib/dates';
import { makeEntry, type Actor, type AuditEntry } from './audit';
import type { InstantSettlement } from '../data/ledgerQueries';
import { FEATURES } from '../config/features';
import { DEFAULT_KEEP_PER_1000 } from '../engine/net';
import { GOAL_LABEL, offerLabel } from '../lib/labels';
import { migrateV1, sameSettings } from './migrate';

/** v2 storage key; v1 is read once and migrated (spec §3.4). */
export const STORAGE_KEY = FEATURES.netReturns ? 'smart-offers:v2' : 'smart-offers:v1';
export const LEGACY_STORAGE_KEY = 'smart-offers:v1';

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
  budget: 100000, keepPer1000: DEFAULT_KEEP_PER_1000, goal: 'most_profit', ordersFloorPct: 5,
  allowedOffers: ['free_shipping', 'flat_100', 'flat_200'], festiveWindow: true, maxDiscountInr: 250,
};

type Persisted = {
  settings: Settings;
  approved: boolean;
  approvedSettings: Settings | null;
  /** Demo date the approved settings went live ("Approved · Live since <date>"). */
  approvedOn: string | null;
  overrides: Partial<Record<GroupId, OfferId>>;
  killed: boolean;
  moment: Moment;
  creatorFix: 'pending' | 'limited' | 'kept';
  /** Demo date the creator-code decision was made ("Fixed on <date>"). */
  creatorFixedOn: string | null;
  rayMode: 'live' | 'demo';
  settlementMode: 't1' | 'instant';
  instantSettlements: InstantSettlement[];
  reviewDecisions: Record<string, 'approved' | 'dismissed'>;
  reviewsOpened: string[];
  notificationsRead: string[];
  pilotDecision: 'keep' | 'extend' | 'stop' | null;
  alpha10Restored: boolean;
  experiments: Record<string, 'approved' | 'declined'>;
  outageEvents: number;
  audit: AuditEntry[];
};

export type Snap = 'day7' | 'day14' | 'day20' | 'day30' | 'day60';
type Ephemeral = { snapshot: Snap; outage: boolean };

type Actions = {
  setSettings: (patch: Partial<Settings>) => void;
  approve: () => void;
  /** Draft -> live (logged with the diff). Only this writes approvedSettings after the first approval. */
  approveChanges: (diff?: string) => void;
  /** Throw the draft away: settings go back to the approved ones. */
  discardDraft: () => void;
  jump20: () => void;
  setSnapshot: (s: Snap) => void;
  jump30: () => void;
  decideReview: (id: string, d: 'approved' | 'dismissed', summary: string) => void;
  openReview: (id: string) => void;
  markRead: (ids: string[]) => void;
  decidePilot: (d: 'keep' | 'extend' | 'stop', summary: string) => void;
  stopSmartOffers: (restoreAlpha10: boolean, summary: string) => void;
  decideExperiment: (id: string, d: 'approved' | 'declined', summary: string) => void;
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
  settings: DEFAULT_USER_SETTINGS, approved: false, approvedSettings: null, approvedOn: null, overrides: {}, killed: false,
  moment: 'before', creatorFix: 'pending', creatorFixedOn: null, rayMode: 'live', settlementMode: 't1', instantSettlements: [],
  reviewDecisions: {}, reviewsOpened: [], notificationsRead: [], pilotDecision: null, alpha10Restored: false, experiments: {}, outageEvents: 0,
  audit: [],
};

function load(): Persisted {
  try {
    if (typeof localStorage === 'undefined') return initial;
    const raw = localStorage.getItem(STORAGE_KEY);
    const legacy = !raw && STORAGE_KEY !== LEGACY_STORAGE_KEY ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    if (!raw && !legacy) return initial;
    const parsed = JSON.parse((raw ?? legacy) as string) as Partial<Persisted>;
    const p = legacy ? migrateV1(parsed, DEFAULT_USER_SETTINGS) : parsed;
    return { ...initial, ...p, settings: { ...DEFAULT_USER_SETTINGS, ...(p.settings ?? {}) } };
  } catch {
    return initial; // storage blocked or corrupt: start from defaults
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
  settings: s.settings, approved: s.approved, approvedSettings: s.approvedSettings, approvedOn: s.approvedOn, overrides: s.overrides,
  killed: s.killed, moment: s.moment, creatorFix: s.creatorFix, creatorFixedOn: s.creatorFixedOn, rayMode: s.rayMode, settlementMode: s.settlementMode,
  instantSettlements: s.instantSettlements, reviewDecisions: s.reviewDecisions, reviewsOpened: s.reviewsOpened,
  notificationsRead: s.notificationsRead, pilotDecision: s.pilotDecision, alpha10Restored: s.alpha10Restored,
  experiments: s.experiments, outageEvents: s.outageEvents, audit: s.audit,
});

export const describeSettings = (s: Settings) =>
  `budget ₹${s.budget.toLocaleString('en-IN')}, keep ₹${s.keepPer1000} of ₹1,000, goal ${GOAL_LABEL[s.goal]}${s.goal === 'orders_steady' ? ` (orders fall at most ${s.ordersFloorPct}%)` : ''}, offers ${s.allowedOffers.map(offerLabel).join(', ')}`;
const describe = describeSettings;

/** The draft: unapproved edits to a live plan (null when nothing is pending). */
export function draftSettingsOf(s: Pick<Persisted, 'approved' | 'settings' | 'approvedSettings'>): Settings | null {
  if (!FEATURES.netReturns) return null;
  return s.approved && s.approvedSettings && !sameSettings(s.settings, s.approvedSettings) ? s.settings : null;
}

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
      // v2: edits after approval are a draft; only Approve changes goes live and is logged.
      if (get().approved && !FEATURES.netReturns) log('Merchant (Praveen)', 'rule_change', 'Changed plan settings', describe(before), describe(after));
    },
    approve: () => {
      const s = get().settings;
      set({ approved: true, approvedSettings: s, approvedOn: DEMO_DATES[get().moment], killed: false });
      log('Merchant (Praveen)', 'approve', 'Approved Smart Offers plan and went live (ALPHA10 retired, 10% holdout)', 'ALPHA10 for everyone', describe(s));
    },
    approveChanges: (diff) => {
      const st = get();
      const draft = draftSettingsOf(st);
      if (!draft || !st.approvedSettings) return;
      set({ approvedSettings: draft, approvedOn: DEMO_DATES[st.moment] });
      log('Merchant (Praveen)', 'approve', `Approved plan changes${diff ? `: ${diff}` : ''}`, describe(st.approvedSettings), describe(draft));
    },
    discardDraft: () => {
      const a = get().approvedSettings;
      if (a) set({ settings: a });
    },
    jump20: () => set({ moment: 'day20', snapshot: 'day20' }),
    setSnapshot: (snapshot) => set({ snapshot }),
    jump30: () => set({ moment: 'day30', snapshot: 'day30' }),
    decideReview: (id, d, summary) => {
      set((st) => ({ reviewDecisions: { ...st.reviewDecisions, [id]: d } }));
      log('Merchant (Praveen)', 'review', `${d === 'approved' ? 'Approved' : 'Dismissed'} review item: ${summary}`);
    },
    openReview: (id) => set((st) => (st.reviewsOpened.includes(id) ? st : { reviewsOpened: [...st.reviewsOpened, id] })),
    markRead: (ids) => set((st) => ({ notificationsRead: [...new Set([...st.notificationsRead, ...ids])] })),
    decidePilot: (d, summary) => {
      set(d === 'stop' ? { pilotDecision: d, killed: true } : { pilotDecision: d });
      log('Merchant (Praveen)', 'pilot_decision', summary, 'free pilot', d === 'keep' ? 'kept (billed monthly)' : d === 'extend' ? 'pilot extended 15 days' : 'stopped');
    },
    stopSmartOffers: (restoreAlpha10, summary) => {
      set({ killed: true, alpha10Restored: restoreAlpha10 });
      log('Merchant (Praveen)', 'kill_switch', summary, 'plan live', restoreAlpha10 ? 'stopped; ALPHA10 restored' : 'stopped; no offers');
    },
    decideExperiment: (id, d, summary) => {
      set((st) => ({ experiments: { ...st.experiments, [id]: d } }));
      log('Merchant (Praveen)', 'experiment', `${d === 'approved' ? 'Approved' : 'Declined'} experiment: ${summary}`);
    },
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
      set({ killed: false, alpha10Restored: false, pilotDecision: get().pilotDecision === 'stop' ? null : get().pilotDecision });
      log('Merchant (Praveen)', 'resume', 'Resumed Smart Offers', 'all offers off', 'plan live');
    },
    setOutage: (outage) => set((st) => ({ outage, outageEvents: outage ? st.outageEvents + 1 : st.outageEvents })),
    setCreatorFix: (v) => {
      set({ creatorFix: v, creatorFixedOn: DEMO_DATES[get().moment] });
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
      try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
      set({ ...initial, snapshot: 'day20', outage: false });
    },
  };
});

useStore.subscribe((s) => save(pick(s)));

export const marginOf = (s: Settings): number => s.keepPer1000 / 1000;
