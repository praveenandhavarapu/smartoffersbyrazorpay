# Smart Offers v2 — Phase 0 audit

Read-only audit of `main` at `9e9669b` (branch `v2-smart-offers` created from it). No code was changed in this phase.
Spec: `SMART_OFFERS_V2_BUILD_SPEC.md` (Praveen). Date: 11 Oct 2026.

## 1. Stack, commands, layout

| Item | Today |
|---|---|
| Framework | Vite 5 + React 18 + TypeScript (strict) + React Router 6 + Zustand + Tailwind (utilities only) |
| Build | `npm run build` = `tsc -b && vite build` → `dist/` |
| Tests | `npm test` = `vitest run` (jsdom + Testing Library) |
| Data | `npm run gen` writes generated JSON to `generated/` (gitignored); `python3 docs/reference_engine.py` regenerates `fixtures/expected_outputs.json` |
| Deploy | Netlify: `netlify.toml` (publish `dist`, functions `netlify/functions`, SPA redirect) |
| Ray Live | Browser → `POST /.netlify/functions/ray` (`src/ray/liveClient.ts`) → `netlify/functions/ray.ts` adds the system prompt and calls Claude; tool calls come back and run **in the browser** (`src/ray/tools.ts` `runTool`), so Ray only ever sees tool results. Health check: `GET ?verify=1`. |
| Ray Demo | `src/ray/demoRouter.ts` (regex intents → same tools) + `src/ray/templates.ts` (reply text) + `src/ray/setupFlow.ts` (4-question setup) |
| Demo tour | `src/ui/components/DemoPlayer.tsx`: 15 `{route, caption, run}` steps, 5.8 s each; started from `ConceptBar` (`src/ui/shell/ConceptBar.tsx`, fixed footer, buttons on the right) |
| State | `src/state/store.ts`, Zustand, persisted to `localStorage['smart-offers:v1']` (try/catch on read and write) |
| Derivation | `src/state/derived.ts` `derive(model, state)` recomputes every engine number; provided app-wide by `src/state/ModelContext.tsx` |

Folder map: `fixtures/` (source data, never edited) · `src/data` (types, fixtures loader, seeded generators, ledger queries, peer network) · `src/engine` (economics, plan, scenarios, measure, review, runs, guardrails, accuracy, lifecycle, opportunities, experiments, targets) · `src/state` · `src/ray` · `src/ui/{shell,components,screens}` · `netlify/functions/ray.ts`.

## 2. Where things live

| Concern | File(s) |
|---|---|
| Per-checkout economics (spend, extra sales, profit, return) | `src/engine/economics.ts` `perCheckout`, `breakEven = 1/margin` |
| Plan calculator (most profit, budget downgrades, goals, overrides) | `src/engine/plan.ts` `buildPlan`, `planRange` |
| ALPHA10 maths, all codes, simple rule, override cost, what-ifs | `src/engine/scenarios.ts` `codesEconomics`, `alpha10`, `ruleFirstOrderOnly`, `overrideCost`, `simulate` |
| Results calculator (holdout lift, CI, trust weight, fee) | `src/engine/measure.ts` `measure`, `countsFromFormula`, `feeBasis` |
| Day toggles (Day 7/14/20/30/60) | `src/state/derived.ts` `snapAt` + `SNAP_DAYS`; UI segment in `src/ui/screens/Results.tsx` |
| Demo clock (before / day20 / day30 / day60) | `src/lib/dates.ts`, `store.moment`, `jump20` / `jump30` |
| Weekly reviews | `src/engine/review.ts` `buildReview`; built in `derived.ts`; UI `ReviewCard`/`ReviewsList` in `src/ui/components/lifecycle.tsx` |
| Daily runs | `src/engine/runs.ts` `dailyRuns` (from pilot sessions); UI Runs tab in `src/ui/screens/StudioAgent.tsx` |
| Activity log | `src/state/audit.ts` + `store.log`; UI Activity tab in `StudioAgent.tsx` |
| Impact metrics | `src/ui/components/Impact.tsx` (computes inside the component) + `src/engine/targets.ts` |
| Pilot decision, Why AI, holdout note, stop | `src/engine/lifecycle.ts` + `src/ui/components/lifecycle.tsx` |
| Ray scripted answers | `src/ray/templates.ts` (bound to tool results), `src/ray/demoRouter.ts` |
| Tour captions | `src/ui/components/DemoPlayer.tsx` (static strings) |
| Home banner | `src/ui/screens/Home.tsx` |
| WhatsApp summary | `src/ui/screens/Results.tsx` side card (`s.weekly`) |
| Checkout preview / decision table | `src/ui/screens/Checkout.tsx`, `src/engine/checkoutTable.ts` |

## 3. Hard-coded engine numbers found

Most numbers are already bound to the engine. What is not:

| File | What | Fix in |
|---|---|---|
| `src/ray/tools.ts` `get_offer_waste` | `break_even_x: 2.5` literal — wrong as soon as margin changes | Phase 1 |
| `src/ui/__tests__/smoke.test.tsx` | expects the literal "ALPHA10 lost you ₹33,845" | Phase 1 (assert the engine value instead) |
| `src/ui/components/PlanCard.tsx` | "Big new carts get ₹200 off …" sentence assumes the plan picks ₹200 off (guarded by a find, but copy names the offer) | Phase 1 (offer label from engine) |
| `src/ui/components/lifecycle.tsx` `WhyAI` | "Big new carts get ₹200 off at …" (renders "—" if the offer isn't in the plan) and `0.9` coverage literal | Phase 1 (conditional, hide when invalid) |
| `src/ui/components/DemoPlayer.tsx` | captions are static text; step 5 answers "₹400" | Phases 1 + 9 |
| `src/ray/demoRouter.ts` | quick reply "Keep ₹400 (40%)" | Phase 1 |
| `src/ray/setupFlow.ts`, `SetupCard.tsx`, `templates.ts` `marginWarn` | "most fashion brands keep ₹350–550" guidance; margin chips ₹300/₹400/₹500 | Phase 1 (new ₹400–600 guidance) |
| `src/ui/components/Impact.tsx` | developer note "edit them in src/engine/targets.ts" shown in the UI | Phase 1 |
| `src/state/store.ts` | default `keepPer1000: 400` | Phase 1 (→ 500) |
| `src/ui/components/lifecycle.tsx` | comment "Proof costs ₹2,350" (comment only) | n/a |

Policy constants shown in copy (₹250 max per order, ₹6,000 daily cap, 10% holdout, 1% fee / 20% cap, 50 ms) come from fixtures or `guardrails.ts`; some are typed as literals in JSX (`PlanCard` guard chips, `StudioAgent` pricing text). They are rules, not engine outputs; Phase 1 routes the ones in live surfaces through the constants.

## 4. `settings` vs `approvedSettings` today

`store.settings` is the edit buffer; `store.approvedSettings` is written only by `approve()`. But many live surfaces read the edit buffer:

| Surface | Reads | Problem |
|---|---|---|
| `derived.margin`, `derived.breakEven`, `derived.a10AtMargin`, `derived.rule` | `settings` (draft) | Editing margin in Setup changes the break-even shown on Results, Home, Offers, Checkout, Agent Studio guardrails and Ray |
| `derived.draft` (PlanCard) | `settings` | Correct for the draft, but after approval PlanCard still shows the "Approved" pill over draft numbers |
| `derived.live`, `liveOffers`, reviews, budget pace | `approvedSettings` | Correct |
| Snapshots (Results, Impact, reviews, Home day-20 line) | fixed margin 0.40 from `PROFILE` | Ignores both settings objects |
| `StudioAgent` Overview copy + Guardrails tab | `settings.budget`, `settings.festiveWindow` | Shows unapproved budget as the live hard stop |
| `PlanCard` guard chips | `settings.budget` | same |
| Ray context (`useRay` → `RayCtx.settings`) | `settings` | `draft_plan_change` and `simulate_plan` base use the draft margin |
| `store.setSettings` | writes `settings`; logs "Changed plan settings" after approval | Logs a change that never went live; no Approve/Discard |

There is no draft badge, diff, Approve changes or Discard today.

## 5. Baseline

- `npm test`: **10 files, 95 tests, all pass** (React Router future-flag warnings only).
- `npm run build`: **passes** (JS 427.9 kB, 136.4 kB gzip; CSS 55.9 kB).

## 6. Numbers check (read-only script against today's engine)

The spec's formulas can be implemented without touching fixtures or the reference engine: passing an *effective margin* `marginRate × keptRate` (0.5 × 0.81 = 0.405) into the existing engine gives exactly `netProfit`, and `netReturn ≥ 1/marginRate` ⇔ gross return ≥ 1/0.405, so plan decisions use the same comparison. `keptRate` can be computed from data already in `AFTER_DELIVERY` + COD share: (1 − 0.38 × 0.22) × (1 − 0.12) = 0.806 → 81%.

| Metric | Spec §3.2 | Engine with v2 formulas | Note |
|---|---|---|---|
| Plan offers | unchanged | **unchanged** (free shipping / ₹200 / none / free shipping / none / ₹100) | |
| ALPHA10 return after returns | 1.66x | **1.66x** | |
| ALPHA10 net profit | −₹31,900 | **−₹31,943** | |
| ALPHA10 cost per extra order | ₹746 | **₹730** | engine counts 254.8 extra orders; the spec's ₹746 divides spend by extra sales ÷ ₹1,525 |
| Earned per extra order | ₹617 | **₹614** | store AOV is ₹1,516 (fixture), not ₹1,525 |
| Plan v1 net profit / month | ≈ +₹22,600 | **+₹22,595** | spend ₹94,665; return after returns 2.48x; ₹498 per extra order |
| Day 20 net profit | ≈ +₹20,100 | **+₹20,071** | |
| Day 20 return after returns | ≈ 2.63x | **2.63x** | |
| Day 20 cost per extra order | ≈ ₹473 | **₹473** | |
| Organic free shipping, Day 20 | ≈ +₹300 | **+₹314** | near-break-even alert stays true |
| Simple rule vs ALPHA10 (same 90%) | — | rule **+₹6,516**, ALPHA10 **−₹28,749**, Smart Offers **+₹22,595** | Smart Offers still wins at the default margin |
| No-offer control groups | within ±3 pp | **fails on day 7 and 14**: returning 56.1% vs 41.7% (day 7), 56.7% vs 44.1% (day 14) | caused by cutting day-20 sessions by date with a small holdout (24–34 checkouts); day 20/30/60 are fine |

## 7. Plan per phase (files to touch)

All new UI goes in new files mounted inside existing surfaces; every feature checks its flag in `src/config/features.ts`. Fixtures and `docs/reference_engine.py` stay untouched; the 95 existing tests keep passing (only the smoke-test literal changes to an engine-bound assertion).

| Phase | New files | Existing files touched |
|---|---|---|
| 1 netReturns | `src/config/features.ts`, `src/engine/net.ts`, `src/state/migrate.ts`, `src/ui/components/DraftBar.tsx`, tests `src/engine/__tests__/v2.net.test.ts`, `docs/AI_BUILD_LOG.md` | `state/store.ts` (v2 key, draftSettings, approveChanges/discard), `state/derived.ts` (approved vs draft, effective margin, control fix), `ModelContext.tsx`, `SetupCard`, `PlanCard`, `Results`, `Home`, `RayCards`, `lifecycle.tsx` (WhyAI, PilotDecision, alerts), `Impact.tsx`, `StudioAgent.tsx` (budget from approved, humanised log), `Offers`, `Checkout`, `OverrideDrawer`, `ray/tools.ts`, `ray/templates.ts`, `ray/setupFlow.ts`, `ray/useRay.ts`, `Chat.tsx` (no-offer draft), `engine/review.ts` (labels), smoke test |
| 2 heroMetric | `src/ui/components/HeroMetric.tsx`, `src/ui/components/HowAIWorks.tsx` | `Results`, `Impact`, `Home`, `StudioAgent` (how it works), `lifecycle.tsx` WhyAI note, `About` |
| 3 experiments | `src/engine/learning.ts` (experiments, timeline, proof/playbook mode), `src/ui/components/Experiments.tsx`, `src/ui/components/NowStrip.tsx` | `store.ts` (experimentSpace, promotion decision), `derived.ts` (plan v1/v2 by day), `StudioAgent` (new Experiments tab, runs/activity wiring), `Results` (chips, compact strip), `review.ts`/`lifecycle.tsx` (proposals), `SetupCard`/`PlanCard`/Ray setup (experiment-space row) |
| 4 playbook | `src/data/network/playbook.ts`, `src/ui/components/Playbook.tsx` | `PlanCard` / Results Why drawer, `SmartOffers` plan tab |
| 5 discountBrain | `src/data/generator/agentDecisions.ts`, `src/ui/components/DiscountBrain.tsx` | `Studio.tsx` (badge), `StudioAgent` Overview |
| 6 paymentAware | `src/engine/paymentAware.ts`, `src/ui/components/PrepaidInsight.tsx` | `Offers.tsx`, `Results` sidebar, `Experiments`, `Checkout.tsx` |
| 7 rayV2 | `src/ray/snapshot.ts` | `tools.ts` (+ `get_engine_snapshot` etc.), `toolSchemas.ts`, `templates.ts`, `demoRouter.ts`, `Chat.tsx` (settings draft with diff, scenario titles), `systemPrompt.ts` (wording only; model/keys untouched) |
| 8 aboutV2 | `src/ui/components/AboutV2.tsx` | `About.tsx` (mount below existing content) |
| 9 tourV2 | `src/ui/components/tourV2.ts` | `DemoPlayer.tsx` (switch on flag, keep v1 steps), `ConceptBar.tsx` + CSS (controls bottom-left) |
| 10 leakRadar (stretch, off) | `src/ui/components/LeakRadar.tsx` | `Offers.tsx` |
| QA | `docs/V2_QA.md`, `src/__tests__/v2.*.test.ts(x)` | — |

## 8. Decisions I'll take unless you say otherwise

1. **Formulas via effective margin.** `src/engine/net.ts` owns `marginRate`, `keptRate`, `netReturn`, `netProfit`, `breakEven`, `costPerExtraOrder`, `earnedPerExtraOrder`, `leakedRupees`; every surface reads these. Old engine functions stay for the fixture tests.
2. **`keptRate` is computed** from the fixture's return rate, COD share and failed-COD rate (0.806, shown as 81%), not typed in.
3. **Earned per extra order uses the store AOV (₹1,516) → ₹614**, and ALPHA10's cost per extra order uses the engine's extra orders → ₹730. Both differ slightly from §3.2; I'll report rather than force them.
4. **₹150 off** (Phase 3 challenger) is not in `fixtures/offers.json`. I'll add it in code as a cheaper amount of the "₹ off" offer already on the menu (eligible on ₹1,500+ carts, under the max discount), inside the approved experiment space, and log the assumption. Fixtures stay untouched.
5. **Control-group fix** in the measurement layer: no-offer groups use the expected (formula) counts on every day, so treated and holdout differ only by rounding (< 3 pp). Sessions, runs and transactions are unchanged.
6. **Branch:** all work on `v2-smart-offers`, one commit per phase, pushed after each phase; no force-push and no PR unless you ask. Netlify builds a preview for this branch only if branch deploys are enabled for all branches in site settings.
7. **"Additive only":** no route, page, tab or component is removed or renamed. Copy that the spec asks to change (e.g. "Return" → "Return after returns", "No AI at checkout") changes behind its flag; switching the flag off brings back the old copy.
