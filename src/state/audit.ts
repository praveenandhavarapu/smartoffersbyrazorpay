export type Actor = 'Merchant (Praveen)' | 'Ray (draft)' | 'System';
export type AuditAction = 'approve' | 'override' | 'clear_override' | 'pause' | 'resume' | 'rule_change' | 'kill_switch' | 'creator_fix' | 'draft' | 'reset' | 'settle_instant' | 'review' | 'pilot_decision' | 'experiment';
export type AuditEntry = { id: number; at: string; demoDate: string; actor: Actor; action: AuditAction; summary: string; before?: string; after?: string };

export function makeEntry(prev: AuditEntry[], e: Omit<AuditEntry, 'id' | 'at'>): AuditEntry {
  return { ...e, id: (prev[prev.length - 1]?.id ?? 0) + 1, at: new Date().toISOString() };
}
