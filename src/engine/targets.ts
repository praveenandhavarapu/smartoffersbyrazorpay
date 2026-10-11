/**
 * Targets for a real pilot. These are product goals and assumptions, NOT measurements:
 * the UI always labels them as targets. Owner can tune them before a real launch.
 */
export const TARGETS = {
  reviewOpenRate: 0.6, // merchants who open the Monday review
  recommendationAcceptRate: 0.5, // review items approved / decided
  overrideShareMax: 0.2, // groups overridden by the merchant
  estimatesInsideRange: 0.8, // similar-store estimates inside the measured 90% range
  medianErrorPpMax: 2, // median |estimate - measured| lift
  discountShareMax: 0.08, // offer + coupon spend as a share of sales
  checkoutMsMax: 50, // checkout lookup budget
  funnel: { seeInsight: 1, openPlan: 0.4, approve: 0.5, activeDay30: 0.7, paidAfterPilot: 0.6 },
} as const;
