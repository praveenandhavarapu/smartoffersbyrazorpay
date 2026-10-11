# AI build log — Smart Offers v2

How the v2 build was made: what the AI (Claude Code) did, which decisions came from Praveen's spec (`SMART_OFFERS_V2_BUILD_SPEC.md`), and what had to be assumed. One entry per phase. Earlier versions are logged in `BUILD_LOG.md`.

## Phase 0 — Audit (11 Oct 2026)

- **AI did:** read the whole codebase (≈7,700 lines across engine, state, Ray, UI), mapped where every number is computed, grepped for hard-coded figures, traced which surfaces read draft vs approved settings, ran the baseline (95/95 tests, build passing), and ran a read-only script with the v2 formulas to check the spec's expected values before any change. Output: `docs/V2_AUDIT.md`.
- **From the spec (Praveen):** phase order, feature flags, additive-only rule, net-of-returns formulas and defaults, draft vs approved model, the learning-loop timeline, positioning against Magic Checkout's Offer Engine.
- **Found:** plan offers do not change under the new formulas; most expected values match within rounding; two small gaps (ALPHA10 cost per extra order ₹730 vs ₹746, earned per extra order ₹614 vs ₹617) come from how extra orders and AOV are counted; no-offer control groups break the ±3 pp rule on days 7 and 14; a hard-coded `2.5` break-even in a Ray tool; many live surfaces read unapproved settings.
- **Assumed:** see "Decisions I'll take" in `docs/V2_AUDIT.md` §8 (effective margin, computed kept rate, ₹150 off as an in-code variant, control-group fix in the measurement layer).
- **Time:** ~25 min.

## Phase 1 — P0 correctness: net of returns, draft vs approved (11 Oct 2026)

- **AI did:**
  - Added `src/config/features.ts` (one flag per phase) and `src/engine/net.ts` (marginRate, keptRate, netReturn, breakEven, netProfit, earnedPerExtraOrder, costPerExtraOrder, leakedRupees, per-day metrics).
  - Threaded an optional `kept` rate through the existing engine (`perCheckout`, `buildPlan`, `planRange`, `codesEconomics`, `ruleFirstOrderOnly`, `overrideCost`, `measure`, `explainGroup`). It defaults to 1, so every fixture test keeps its exact v1 value.
  - Rewrote `derived.ts` so live surfaces read approved settings and draft surfaces read the edit buffer. It also adds the same-budget Why-AI comparison (`src/engine/compare.ts`), day-dependent proof text, date-aware alerts and the control-group fix.
  - Store moved to `smart-offers:v2` with a one-time v1 migration (`src/state/migrate.ts`), plus Approve changes / Discard, "Live since <date>" and the creator-fix date.
  - UI changes:
    - Setup guidance and a read-only kept rate.
    - Plan card with the yellow draft bar and diff.
    - "Return after returns" labels everywhere.
    - Results header and billing follow the demo clock; festive alert by date; "Fixed on <date>".
    - Ray draft cards show the saving for "→ No offer".
    - Humanised log text.
    - Developer note removed from Impact.
    - The hard-coded `2.5` break-even in a Ray tool fixed.
  - Tests that asserted v1 rupee literals now assert engine values. New QA tests cover §15 items 1–7 (33 new tests; 128 total).
- **From the spec (Praveen):** the formulas, ₹500 default, 81% kept rate, labels, the draft/approve model, the honest Why-AI copy when a rule ties, the stale-copy list, the ±3 pp control rule, the no-offer saving text.
- **Assumed / decided:**
  - The kept rate is computed from the fixture's return rate, COD share and failed-COD rate: 0.806, shown as 81%.
  - The "draft" is the edit buffer whenever it differs from the approved settings, so there is no second copy to keep in sync.
  - The Why-AI comparison caps ALPHA10 and the rule at the budget by scaling spend, sales and orders down together (the offer stops when the budget runs out).
  - A Ray settings card's Approve counts as the merchant's approval, so it goes live through `approveChanges` and is logged.
- **Differs from §3.2:**
  - ALPHA10 cost per extra order is ₹730, not ₹746. The engine counts 254.8 extra orders; the spec divided by sales ÷ AOV.
  - Earned per extra order is ₹614, not ₹617. The store AOV is ₹1,516.
  - Everything else matches within rounding: −₹31,943, 1.66x, +₹22,595, +₹20,071, 2.63x, ₹473, organic +₹314. Plan offers unchanged.
- **Behaviour note:** with returns counted, a 3x "return after returns" floor keeps no offers. Ray now suggests the highest half-step floor that still keeps one (2.5x).
- **Time:** ~2 h.
