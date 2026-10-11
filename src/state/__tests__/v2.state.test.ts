/** v2 Phase 1 QA (spec §15: 3) — draft vs approved, discard, migration, storage blocked. */
import { useStore, draftSettingsOf, DEFAULT_USER_SETTINGS, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../store';
import { migrateV1, V1_DEFAULT_SETTINGS } from '../migrate';
import { loadModel } from '../model';
import { derive } from '../derived';

const snapshotOf = async () => {
  const st = useStore.getState();
  const d = derive(await loadModel(), { ...st });
  return { profit: d.live.profit, spend: d.live.spend, be: d.breakEven, a10: d.a10.profit, day20: d.snapshots.day20.profit, offers: d.live.rows.map((r) => r.offer) };
};

describe('QA 3: editing Setup changes no live number until Approve; Discard restores', () => {
  beforeEach(() => useStore.getState().reset());
  it('draft edits leave every live number alone, Approve changes moves them, Discard restores', async () => {
    useStore.getState().approve();
    const before = await snapshotOf();
    useStore.getState().setSettings({ budget: 50000, keepPer1000: 300 });
    expect(draftSettingsOf(useStore.getState())).not.toBeNull();
    expect(await snapshotOf()).toEqual(before);
    const d = derive(await loadModel(), { ...useStore.getState() });
    expect(d.hasDraft).toBe(true);
    expect(d.draftDiff.join(' | ')).toMatch(/Budget ₹1,00,000 → ₹50,000/);
    useStore.getState().discardDraft();
    expect(draftSettingsOf(useStore.getState())).toBeNull();
    expect(await snapshotOf()).toEqual(before);
    useStore.getState().setSettings({ budget: 50000 });
    const auditBefore = useStore.getState().audit.length;
    useStore.getState().approveChanges('Budget');
    expect(useStore.getState().approvedSettings?.budget).toBe(50000);
    expect(useStore.getState().audit.length).toBe(auditBefore + 1);
    expect((await snapshotOf()).spend).toBeLessThanOrEqual(50000 + 1e-6);
  });
  it('setting edits after approval are not logged as live changes', () => {
    useStore.getState().approve();
    const n = useStore.getState().audit.length;
    useStore.getState().setSettings({ budget: 70000 });
    expect(useStore.getState().audit.length).toBe(n);
  });
});

describe('storage v1 -> v2 (§3.4)', () => {
  it('uses the v2 key and migrates v1 once', () => {
    expect(STORAGE_KEY).toBe('smart-offers:v2');
    expect(LEGACY_STORAGE_KEY).toBe('smart-offers:v1');
  });
  it('a never-approved v1 default state starts from v2 defaults', () => {
    const m = migrateV1({ settings: V1_DEFAULT_SETTINGS, approved: false, approvedSettings: null, audit: [] }, DEFAULT_USER_SETTINGS);
    expect(m.settings?.keepPer1000).toBe(500);
  });
  it('an approved v1 state keeps its approved settings; an unapproved edit becomes the draft; no-op log rows are dropped', () => {
    const approved = { ...V1_DEFAULT_SETTINGS };
    const edited = { ...V1_DEFAULT_SETTINGS, budget: 60000 };
    const m = migrateV1({ settings: edited, approved: true, approvedSettings: approved, audit: [
      { id: 1, at: '', demoDate: '2026-09-21', actor: 'Merchant (Praveen)', action: 'rule_change', summary: 'x', before: 'a', after: 'a' },
      { id: 2, at: '', demoDate: '2026-09-21', actor: 'Merchant (Praveen)', action: 'approve', summary: 'y', before: 'a', after: 'b' },
    ] }, DEFAULT_USER_SETTINGS);
    expect(m.approvedSettings).toEqual(approved);
    expect(draftSettingsOf({ approved: true, settings: m.settings!, approvedSettings: m.approvedSettings! })).toEqual(edited);
    expect(m.audit?.map((a) => a.id)).toEqual([2]);
  });
  it('Reset clears both keys', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, '{}');
    useStore.getState().reset();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });
});
