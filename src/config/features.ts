/**
 * v2 feature flags (SMART_OFFERS_V2_BUILD_SPEC.md, golden rule 3). One boolean per phase.
 * Switching a flag off brings back the v1 behaviour and copy for that phase.
 */
export const FEATURES = {
  netReturns: true, // Phase 1: count returns and failed COD in profit; draft vs approved settings
  heroMetric: true, // Phase 2: cost per extra order; "AI re-decides every night" framing
  experiments: false, // Phase 3: Suggest → Test → Prove → Promote
  playbook: false, // Phase 4: "Stores like yours"
  discountBrain: false, // Phase 5: decisions served to other agents
  paymentAware: false, // Phase 6: prepaid-only challenger + insight
  rayV2: false, // Phase 7: Ray reads one engine snapshot; drafts with diff
  aboutV2: false, // Phase 8: evidence and positioning on About
  tourV2: false, // Phase 9: 14-step demo tour, controls bottom-left
  leakRadar: false, // Phase 10 (stretch): public-code leak alert
} as const;

export type FeatureName = keyof typeof FEATURES;
