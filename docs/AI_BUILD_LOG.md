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

## Phase 2 — AI framing + hero metric (11 Oct 2026)

- **AI did:**
  - `HeroMetric` card on Results (top row, follows the selected day), Impact (today) and in the Home banner. It shows cost per extra order, earned per extra order after returns, ALPHA10's cost, a trend ALPHA10 → Day 7 … Day 60 (proj.) with the earned line, and leaked rupees as a secondary line.
  - New Impact merchant-outcome row with target "below earned per extra order".
  - Pre-launch Home banner rewritten from engine values.
  - `HowAIWorks` names the Uplift model, Network playbook (with the live trust %), Experiment engine and Ray. It appears on the Agent Studio overview and About, and in compact form inside Why AI.
  - Replaced "No AI at checkout" / "precomputed table" everywhere with "AI re-decides every night. Checkout just reads the answer in under 1 ms." and "tonight's decision table".
  - Tests: the same cost per extra order on Home, Results, Impact and Ray; the pre-launch banner; the old phrasing gone; models named. 131 tests.
- **From the spec (Praveen):** hero metric choice (cost per extra order vs earned, not leakage %), exact AI wording, the four named components, placement.
- **Assumed:** leaked rupees for ALPHA10 come from the same formula applied to last month's code usage. Phase 2 values are engine output, so they show ₹730 / ₹614 rather than §3.2's ₹746 / ₹617 (see Phase 1).
- **Time:** ~45 min.

## Phase 3 — Learning loop: Suggest → Test → Prove → Promote (11 Oct 2026)

- **AI did:**
  - `src/engine/learning.ts`:
    - A deterministic synthetic timeline: the ₹150 vs ₹200 challenger from day 8, the playbook suggestion on day 15, the promotion proposal on day 22, the festive drift pause on day 26, the organic early read on day 29, the projected organic promotion on day 43, and the lapsed lift-decay check on day 60.
    - Per-group "segments" of what treated shoppers saw, which drive the formula counts for days 21+ (mixed offers use an average cost per order).
    - A champion-vs-challenger read with 90% ranges and a stated decision rule.
    - Proof mode vs Playbook mode from holdout volume.
    - Re-test triggers.
    - Plan-v2 priors for promoted variants.
  - Offer variants (₹150 off, Free shipping on ₹999+, Free shipping prepaid only) were added in code with a per-group `costShare`; fixtures untouched.
  - `src/data/network/playbook.ts` holds the synthetic benchmark table. Pool medians are used wherever the pool has the combination.
  - UI:
    - New Experiments tab (between Weekly reviews and Impact).
    - "Now · Next · Waiting on you" strip on every Agent Studio tab and in compact form on Results.
    - Runs whose action reflects that day's event.
    - Activity log merging merchant and agent rows with before → after, ₹ impact and Undo while a test is running.
    - Weekly reviews with Approve / Keep as is for learning proposals.
    - "Challenger running" and mode chips in Results "By group".
    - The WhatsApp line mentions the week's experiment.
    - An experiment-space approval row on the plan, also listed in Guardrails and logged.
  - 11 new tests, 142 total.
- **From the spec (Praveen):** the loop and its names, 15% traffic, holdout never used for challengers, the event table, autonomy policy (space approved once; promotions and new offer types need approval; undo for automatic steps), proof vs playbook mode, the strip and tab contents.
- **Assumed / decided:**
  - ₹150 off counts as "an offer from your menu" (a cheaper amount of the ₹ off offer already on it), so the agent may test it inside the space. "Free shipping on ₹999+" is not on the menu, so it needs approval.
  - Promotion rule: the challenger must cost less per shopper, make at least as much profit per shopper once this store's result is blended with the playbook (trust = shoppers ÷ (shoppers + 300)), and show a lift gap within noise. A pure lower-bound rule could never promote with 38 shoppers in two weeks; the blend is what lets a small store learn.
  - Days 7–20 still come from the generated sessions (every treated shopper saw the champion), so the 15% challenger slice before day 21 is reported in Experiments, not in group totals. From day 21 the totals include it. This keeps the §3.2 day-20 numbers exact.
  - Day 60 assumes the organic promotion that the test is on course for is approved at the week-6 review. It is labelled as a projection.
  - Lapsed decay (keeps 59% of lift from day 33) is part of the synthetic truth, so Day 60 numbers fall a little versus Phase 1.
- **Differs from §3.2:**
  - Promoting ₹150 off adds about +₹8,050 a month to the plan (spec ≈ +₹4,900). The cost per extra order falls to ₹450 (spec ≈ ₹442).
  - Measured +8.8 vs +8.3 pp at the week-3 review (spec +9.6 vs +9.2). The store's true lift for big carts is 9.5 pp in `pilot_truth.json`, and small-sample rounding takes it lower.
  - "Day 13 of ~14" in the strip (spec "of ~21"), because the decision is due at the week-3 review.
- **Time:** ~2.5 h.

## Phase 4 — Network playbook "Stores like yours" (11 Oct 2026)

- **AI did:**
  - `PlaybookCard` on Setup & plan: the benchmark table beside "Your store" (measured lift with range once live), the peer definition, the synthetic footer and a Give-to-get toggle (on by default, logged).
  - "Offers you haven't tried" with **Add as challenger**. Off-menu offers first show "Needs your OK to add to your offer menu". The organic ₹999+ offer starts the Phase 3 test (same decision key as the week-2 review). Other approvals are queued in the Experiments tab.
  - `WhyPlaybook` adds "Playbook (180 stores like yours) · Your store" side by side to every **Why?** drawer, in the plan and in Results.
  - 3 tests: the four priors and ranges are unchanged, every row covers ≥ 20 stores, no store names, menu flags.
- **From the spec (Praveen):** "what worked, not what others give", peer definition text, the benchmark rows, ≥ 20-store rule, off-menu approval, Give-to-get line.
- **Assumed / decided:**
  - Where the 180-store pool already has an estimate for a group × offer, the table shows the pool median, so the playbook never disagrees with the plan's priors. "₹100 off, new from ads under ₹1,500" reads +8.0 pp (spec table +6.2) and "₹100 off, returning" reads +2.0 pp (spec +1.8).
  - "Offers you haven't tried" hides offers that beat no-offer in under half the tests (returning ₹100 off) so the list never suggests a loss-maker.
  - A decision on a review proposal takes effect from that review's date, because the demo clock jumps. Approving the organic test at day 20 shows it running since 16 Oct.
- **Time:** ~40 min.

## Phase 5 — One discount brain for every Razorpay agent (11 Oct 2026)

- **AI did:**
  - Seeded synthetic requests from the Cart Abandonment agent (`src/data/generator/agentDecisions.ts`): one month, sized from each group's abandoned checkouts × reachable share, with Neha's example included.
  - `src/engine/discountBrain.ts` authorises only the live plan's offer, and only if recovery economics pay back. These are net of returns at the approved margin. The 10% holdout gets no discount; the kill switch authorises nothing.
  - The Agent Studio Overview has a new "Decisions served to other agents" section: the summary KPIs, 20 latest rows with reasons and the collapsible illustrative API contract.
  - The Cart Abandonment card shows the badge "Asks Smart Offers before offering a discount (simulated)".
  - 2 tests.
- **From the spec (Praveen):** the story, positioning line, examples (Neha → No offer; small ads 12% → 17%; lapsed 15% → 21%), API shape, holdout on recovery decisions.
- **Assumed / decided:**
  - The recovery rates for the other three groups are illustrative and labelled as such: big carts 14→19%, creator 20→22%, organic 16→20%. The reachable share is 60%.
  - Neha's expected profit change is −₹26 per request, not the spec's −₹61. It is computed from the group AOV, the kept rate and the margin.
- **Time:** ~35 min.

## Phase 6 — Payment-aware offers (11 Oct 2026)

- **AI did:**
  - `src/engine/paymentAware.ts` implements the spec formula: value per switch, discount cost and net per group for a blanket ₹50 prepaid discount, plus failed deliveries avoided per 100 orders.
  - The `PrepaidInsight` card on Offers & Coupons (full table) and in the Results sidebar (compact). Its headline is computed from the engine.
  - "Free shipping, prepaid only" vs "Free shipping, any payment" for New · ads · under ₹1,500 is now a challenger. It starts from the insight card or the playbook, needs the merchant's OK and keeps one offer per order.
  - The Experiments tab shows the conversion lift and failed deliveries avoided for both arms.
  - The checkout preview shows "Free shipping when you pay by UPI" for that group while the test runs.
  - 3 tests.
- **From the spec (Praveen):** the insight, the formula and defaults (₹160 failed-delivery cost, 4% prepaid failures, half the sale recovered), the prepaid shares p0 → p1, the challenger, the checkout line.
- **Assumed / decided:**
  - The failed-COD rate is the store's own 22%, the same figure behind the 81% kept rate, not the spec's 28%.
  - At 22% the blanket discount loses money in all 6 groups, so the card says so. The spec expected "pays only for small ad carts", which holds at 28%: the computation is kept honest and the copy follows it.
  - The prepaid test starts the day after the merchant approves it, because it is merchant-initiated.
  - Failed deliveries avoided are reported but not yet added to profit.
- **Time:** ~40 min.

## Phase 7 — Ray upgrades (11 Oct 2026)

- **AI did:**
  - New tool `get_engine_snapshot` (`src/ray/snapshot.ts`). It is one compact snapshot of approved and draft settings with the diff, the live plan, results for the selected day, ALPHA10's cost per order, the Why-AI comparison, experiments, the timeline, waiting-on-you items, the playbook, decisions served and the prepaid insight. Live and Demo both read it.
  - New tool `draft_settings_change`: budget, margin and goal changes become a draft with a diff, applied only through Approve → `approveChanges` (logged).
  - Demo intents for the four new chips, all templated over the snapshot.
  - "What if" cards are titled "Scenario: … (not applied)".
  - Named-guardrail refusals: monthly budget hard stop, no shopper messaging, no price changes, max discount per order; protected attributes were already declined.
  - System prompt rules 9–11 tell Ray to quote only snapshot numbers, draft changes and name guardrails. The model, keys and the function's auth are untouched.
  - 12 tests.
- **From the spec (Praveen):** snapshot contents, drafts with diff, true guardrail list, scenario titles, chip wording.
- **Assumed:** "My margin is 45%" is treated as a change (draft); "What if my margin is 45%" stays a scenario. Ray's day is the day selected on Results.
- **Time:** ~45 min.

## Phase 8 — About: evidence and positioning (11 Oct 2026)

- **AI did:** `AboutV2` sections below the existing brief (kept intact):
  - Why this matters, with the six sources linked and CPG/US data labelled.
  - How merchants run offers today, with the positioning line against Magic Checkout's Offer Engine.
  - The Agent Studio principles table.
  - Who it's for, with this store's Proof mode and Playbook mode groups computed.
  - What we chose not to build.
  - Roadmap.
  - A render test.
- **From the spec (Praveen):** all section content and links (paraphrased as given).
- **Assumed:** the links were provided in the spec. They were not re-fetched from this environment (network policy), so they are shown as given.
- **Time:** ~20 min.

## Phase 9 — Demo tour v2 (11 Oct 2026)

- **AI did:**
  - `src/ui/components/tourV2.ts`: 14 steps (≈ 87 s). Every caption is a function of the engine state at the moment it shows, and the tour ends on an outcome.
  - Flow: Home → Ray signals → Why AI (same budget) → setup with the playbook Why? → approve with the experiment space → checkout (Priya / Neha) → day 20 hero → Now strip → Experiments → decisions served → Week 3 promotion approved → day 30 keep → Impact trend → kill switch and resume.
  - The v1 steps stay in `DemoPlayer.tsx` behind the flag.
  - Play demo and Reset moved to the bottom-left of the concept bar; the player sits bottom-left too, clear of the Netlify badge (bottom-right).
  - Tests: storage blocked still renders, Reset returns to defaults, tour shape.
  - Browser run: all 14 steps from a fresh profile, no console errors, no horizontal scroll at 390 px.
- **From the spec (Praveen):** the 14 beats, the bottom-left move.
- **Differs:** the captions show engine values: ₹730 (ALPHA10) → ₹473 (day 20) → ₹450 (plan v2), where the spec has ₹746 → ₹473 → ₹442.
- **Time:** ~35 min.

## Phase 10 — Leak radar (stretch) (11 Oct 2026)

- **AI did:**
  - `src/engine/leakRadar.ts` takes ALPHA10's real uses from last month's generated checkouts and adds seeded, synthetic referrers (deal channels rise after a listing on 8 Sep). Alert rule: 7-day deal-channel share above 15%, or first-time uses at 1.5× their earlier level.
  - `LeakRadar` card on Offers & Coupons: daily bars with the deal-channel share, and "Switch to unique single-use codes" (simulated, logged).
  - 1 test.
- **From the spec (Praveen):** the signals, the action, the ALPHA10 example.
- **Decided:** built because there was time; it stays behind `leakRadar` (on) and can be switched off in one line. The referrer field is labelled synthetic on the card.
- **Time:** ~20 min.

## QA pass (11 Oct 2026)

- **AI did:**
  - Tests: checkout latency (§15.10) and all 24 routes and tabs before and after go-live (§15.11). 192 tests total.
  - Browser sweep: 24 routes × 3 states × 2 widths plus every day toggle, 164 checks with 0 issues.
  - Browser checks of Undo, Approve/Discard, the promotion and the tour.
  - `docs/V2_QA.md` maps every §15 item to its evidence and leaves two manual items for Praveen: Ray Live on the deployed site, and the Netlify badge and phone run.
- **Not verified here:** Ray Live (needs the deployed function and key) and how the Netlify badge renders.

## v3 — Praveen's review of the live site (11 Oct 2026)

- **Praveen asked:**
  - Don't assume merchant numbers; show what stores of similar size use and let the merchant choose.
  - Fix "I couldn't run that scenario" after offering it, and fix the scenario card that disagreed with Ray's recommendation.
  - Fix the dead Edit button.
  - Show recommended offers beyond the menu.
  - Show what growth costs in profit, and what a squeezed margin costs.
  - Simulate 100–200 chats and fix every edge case.
- **AI did:**
  - **Baseline first.** 225 scripted conversations × 6 store states through Ray's conversation core (588 failures) and a headless click-sweep of 12 screens (2 dead buttons).
  - **Engine.** Store-size benchmarks from a seeded economics pass over the synthetic network. Growth frontier and margin squeeze. Off-menu offer scoring. Minimum return and growth settings. Per-input confirmations.
  - **Screens.** Your numbers with typical ranges, an Approve gate, inline Edit, Recommended offers, and Trade-offs.
  - **Ray.**
    - Scenario tool with per-group overrides and menu changes; new trade-off, recommendation and benchmark tools.
    - Scenario comparison cards; system-prompt rules 12–15.
    - Follow-ups that act on "yes", "what about 35%?", "why?" and "give them…".
    - Setup that asks every input and shows typical values.
  - **Review loop.** Two rounds of transcript review by a separate agent acting as a demanding merchant, about 40 problems each round. Each class of problem became a permanent check in `harness.ts`. An agent also played Live Ray with the real prompt and tools.
  - **Final state.** 250 conversations × 6 states, 0 failures; 227 tests; 40 browser checks; the tour runs end to end.
- **Decided:** see `docs/V3_REVIEW.md` ("Choices made"). The starting values stay, but they are labelled as typical and must be confirmed. Growth may go below break-even per offer because that is the profit the merchant chose to give up. The synthetic band is calibrated so its medians equal the starting values.
- **Not verified here:** Ray Live wording on the deployed site; the role-play only approximates the production model.
- **Time:** ~5 h.
