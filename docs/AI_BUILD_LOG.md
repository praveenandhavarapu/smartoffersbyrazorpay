# AI build log — Smart Offers v2

How the v2 build was made: what the AI (Claude Code) did, which decisions came from Praveen's spec (`SMART_OFFERS_V2_BUILD_SPEC.md`), and what had to be assumed. One entry per phase. Earlier versions are logged in `BUILD_LOG.md`.

## Phase 0 — Audit (11 Oct 2026)

- **AI did:** read the whole codebase (≈7,700 lines across engine, state, Ray, UI), mapped where every number is computed, grepped for hard-coded figures, traced which surfaces read draft vs approved settings, ran the baseline (95/95 tests, build passing), and ran a read-only script with the v2 formulas to check the spec's expected values before any change. Output: `docs/V2_AUDIT.md`.
- **From the spec (Praveen):** phase order, feature flags, additive-only rule, net-of-returns formulas and defaults, draft vs approved model, the learning-loop timeline, positioning against Magic Checkout's Offer Engine.
- **Found:** plan offers do not change under the new formulas; most expected values match within rounding; two small gaps (ALPHA10 cost per extra order ₹730 vs ₹746, earned per extra order ₹614 vs ₹617) come from how extra orders and AOV are counted; no-offer control groups break the ±3 pp rule on days 7 and 14; a hard-coded `2.5` break-even in a Ray tool; many live surfaces read unapproved settings.
- **Assumed:** see "Decisions I'll take" in `docs/V2_AUDIT.md` §8 (effective margin, computed kept rate, ₹150 off as an in-code variant, control-group fix in the measurement layer).
- **Time:** ~25 min.
