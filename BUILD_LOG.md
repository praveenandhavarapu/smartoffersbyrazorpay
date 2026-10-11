# AI Build Log — Smart Offers

How AI tools were used, what they did, how they sped up the work, and where I made the decisions myself. Entries are newest last. Edit freely; this is my log.

## Tools
- **Claude (claude.ai, with research, docs and code tools):** problem research, Razorpay product research, stress tests, numbers modelled in Python, PRD, critique, build plan, design samples, this build spec.
- **Claude Code (cloud sessions on GitHub):** the working prototype, from an empty repo to a deployed app.
- **Netlify:** hosting and pull-request previews.

## Before the build (product work)
| Date | What AI did | My decision |
| --- | --- | --- |
| Late Sep – 7 Oct 2026 | Read the challenge brief; researched Razorpay's Agentic Dashboard, Agent Studio and offer stack from public pages; first pitch and stress test | Chose Track 2 and the "decide and prove" checkout-offer problem |
| 8 Oct | Wrote the execution logic; simulated 25 stores over 8 weeks in Python (engine vs blanket coupon) | Agreed: shopper groups, not per-shopper pricing; no LLM at checkout |
| 9 Oct | Built the first demo merchant's numbers; flagged and fixed its own inconsistent lapsed-shopper lift, then re-ran all totals | Asked how "similar stores" are chosen and how extra sales are counted, which shaped the explanation screens |
| 9–10 Oct | PRD, white paper, cohort sizing from public store data | Narrowed the cohort to Instagram-first fashion brands at ₹20–50L a month, after founder conversations and PM feedback |
| 10 Oct | Design samples in Razorpay's public dashboard style | Approved the screen set |
| 10 Oct | Explained the group-to-offer maths; ran stress tests | **Challenged the 3x return target.** Switched the engine to "most profit, never below break-even" because a ratio target drops big profitable groups |
| 10 Oct | Recruiter-style critique, product and build plan, this spec, Alpha Apparel numbers computed in Python | Set the demo brand (Alpha Apparel) and persona. Accepted AI's correction of my sales figure from ₹15–20K to about ₹27 lakh a month (₹15–20K is about 12 orders, too few to optimise) |

## Build sessions (Claude Code appends below)
<!-- Format: ### YYYY-MM-DD HH:MM — Part N: title
- Built:
- Key prompts or decisions:
- Changed from spec (and why):
- Tests:
- Time taken: -->

### 2026-10-10 — Parts 2–7 in one cloud session (foundation → ship)
- Built: Vite + React + TS (strict) + Tailwind/tokens shell with prototype bar, demo clock and Ray top bar (Part 2); typed fixtures, Razorpay-shaped entities, `DataSource`, `MockDataSource`, seeded Alpha generator (baseline + pilot day 20, exact counts, holdout hash by rejection sampling), 1,200-merchant network with a 180-store quota pool re-centred to the fixture lifts, `peerPrivacyCheck`, Razorpay adapter stub, `npm run gen` (Part 3); economics, plan optimiser (3 goals), scenarios, measure (90% ranges, blended lifts, fee basis), guardrails, explain, checkout lookup, creator report (Part 4); Home, Setup & plan (approve + jump 20 days), Checkout simulator, Results with override drawer and audit log (Part 5); Ray demo router + tools + templates, privacy and red-team tests, Agent Studio, Guardrails & data, optional live mode via `netlify/functions/ray.ts` (Part 6); Play demo stepper, mobile checks at 390 px, loading/error states, README (Part 7).
- Key decisions: the user asked for the whole kit in one session to save credit, so Parts 2–7 were built together and committed per part at the end rather than across three sessions. Every on-screen number is computed by the engine from fixtures; captions in the demo stepper carry no figures.
- Changed from spec (and why):
  - Results always measure the default plan's offers, because the synthetic pilot data was generated for `pilot_truth.plan_offers`. If the merchant approves a different plan, a banner says so.
  - The "orders steady" infeasible case reports two numbers: the best change reachable within budget (−3.6% at ₹1L) and the best at any budget up to ₹10L at break-even (−2.85%, "about −2.9%"). The budget option is offered only when the second meets the floor (spec test: floor 2% → infeasible, no budget option).
  - Privacy and guardrail refusals are always answered locally, even in live mode, so those messages never reach the model.
- Tests: 58 passing (`npm test`): all `expected_outputs.json` values within tolerance, generator/aggregate per-group checks, 180-store pool and medians, MEERA15 140/90, privacy refusals and import scan, guardrails, all 11 red-team cases, smoke render of every route. `npm run build` passes. Playwright check at 390 px and 1366 px: no horizontal scroll, no console errors, approve → jump → override shows −₹31,248.
- Time taken: one session.

### 2026-10-10 — v2: production-style dashboard, live Ray fix, payments data
- Built:
  - **Dashboard shell**, in the style of a payments console, replacing the slide-like tab bar:
    - top nav: Ray AI, Payments, Agent Studio, Banking+, Payroll, More;
    - Payments sidebar: Home, Transactions, Settlements, Reports, Offers & Coupons, other payment products, Smart Offers Agent, Account & Settings;
    - concept bar fixed at the bottom with the demo date, Play demo and Reset.
  - **Six-month synthetic ledger:** payments, orders, refunds, disputes and settlements.
  - **Pages:** Transactions (filters, search, payment drawer), Settlements (T+1 plus instant "Settle now"), Reports (CSV downloads), Offers & Coupons, and Smart Offers (results, setup & plan, checkout preview, creator codes).
  - **Agent Studio:** a list of agents, and a Smart Offers Agent page with daily 06:00 runs, the transactions it decided, guardrails and an activity log.
  - **Ray as a chat page:** guided setup in four questions, cards, follow-up chips, and payment, settlement and refund tools.
  - **Live/Demo toggle** with a health check.
- Key decisions (owner's answers):
  - 6 months of data; UPI 50%, cards 40%, netbanking and wallets 10%; fee 2%.
  - Settlement options T+1 and instant; a few refunds and failures.
  - Banking+ and Payroll as overview pages.
  - No Razorpay logo or wordmark, and no access to the owner's real account (synthetic data rule).
- Live mode fix: the old client silently locked into demo mode after one failed call and showed "Demo mode" before any call. Now:
  - the function has a GET health check and returns JSON errors with reasons;
  - a 9-second upstream timeout fits Netlify's limit;
  - Sonnet 5.5 runs with `between_tools` thinking and low effort, which makes each round faster;
  - every failed live answer shows its reason and retries on the next message.
- Changed from spec (and why):
  - The prototype tab bar and numbered screens were removed at the owner's request ("production-ready, everything inside the dashboard").
  - Setup in Ray is a guided form in both modes, so the plan is built from validated inputs.
  - Server-side refusal fallbacks are not sent alongside `between_tools` thinking; refusals return a polite message instead.
  - Instant settlement fee (0.25%) is demo pricing, labelled as such.
- Tests: 76 passing (ledger mix, fees, settlements netting, demo-date cut-off; new Ray intents; guided-setup parsing; smoke render of 14 routes). Build passes. Playwright at 390 px and 1366 px: no horizontal scroll, Ray setup → approve → jump → runs flow works.
- Not done: the owner's two YouTube videos and razorpay.com could not be opened from the build environment (network policy), so the design follows the owner's screenshots and `design/reference.html`.

### 2026-10-10 — Live key diagnostics and day-on-day chart
- Owner saw "Anthropic rejected the API key". The function now:
  - trims spaces, newlines and quotes from the key;
  - reports the key's format (API key, admin key, OAuth token);
  - verifies the key with a free model lookup (`GET ?verify=1`), so the Live toggle is disabled with the exact reason before anyone asks a question.
- New Ray tool `get_daily_payments` and a day-by-day chart card. "Give me DoD graph of txn details of last 10 days" now draws the chart in both modes.
- Tests: 76 passing; build passes.

### 2026-10-11 — v2 (SMART_OFFERS_V2_BUILD_SPEC) on branch `v2-smart-offers`
- Phase 0 audit: `docs/V2_AUDIT.md`. Phase-by-phase AI build log: `docs/AI_BUILD_LOG.md`.
- Phase 1 (flag `netReturns`): profit and returns net of returns and failed COD (81% kept), default keep ₹500, draft vs approved settings with Approve changes / Discard, storage v2 with v1 migration, honest Why-AI comparison on the same budget, day-aware proof/alerts, control groups within ±3 pp. Tests 128 passing; build passes.

- Phase 2 (flag `heroMetric`): cost per extra order hero card (Results, Impact, Home), named AI (uplift model, network playbook, experiment engine, Ray), "AI re-decides every night" replaces "No AI at checkout". Tests 131 passing; build passes.

- Phase 3 (flag `experiments`): learning loop with experiment space, ₹150 vs ₹200 challenger, playbook suggestion, promotion proposal with Approve/Keep, drift and lift-decay triggers, Experiments tab, Now · Next · Waiting strip, runs/activity wiring with Undo, proof vs playbook mode. Tests 142 passing; build passes.

- Phase 4 (flag `playbook`): "Stores like yours" card with the benchmark table vs your store, Why? drawers side by side, offers you haven't tried with Add as challenger (off-menu needs OK), Give-to-get toggle. Tests 145 passing; build passes.

- Phase 5 (flag `discountBrain`): Cart Abandonment asks Smart Offers before discounting; decisions-served section (KPIs, 20 rows, API contract), holdout on recovery decisions. Tests 147 passing; build passes.

- Phase 6 (flag `paymentAware`): prepaid insight (computed), prepaid-only challenger for small ad carts with RTO saved, checkout UPI line. Tests 150 passing; build passes.

- Phase 7 (flag `rayV2`): Ray reads one engine snapshot (new tool), budget/margin/goal changes are drafts with a diff, scenario titles, named guardrails, four new chips. Model/keys unchanged. Tests 162 passing; build passes.

- Phase 8 (flag `aboutV2`): About adds evidence with sources, today's offer tools and positioning, Agent Studio principles, who it's for (proof vs playbook), exclusions and roadmap. Tests 163 passing; build passes.

- Phase 9 (flag `tourV2`): 14-step tour with engine-computed captions ending on the outcome; Play demo / Reset bottom-left. Tests 166 passing; build passes.

<!-- Claude Code adds unclear spec points here with the option it chose. -->
- v2 §10 defaults say COD fails 28%; the fixture says Alpha's failed-COD rate is 22% (and the 81% kept rate uses it). Chose: the fixture's 22% everywhere. At 22% a blanket ₹50 prepaid discount loses in all 6 groups; the insight copy is computed and says so.
- v2 §7.2's decision rule ("challenger lower bound ≥ champion − tolerance") cannot promote with ~38 challenger shoppers. Chose: blend the store's result with the playbook (same trust weighting as the plan) and require cost lower, profit per shopper at least equal, and the store's lift gap within noise.
- v2 §3.2 expects ALPHA10 ₹746 per extra order and ₹617 earned; the engine gives ₹730 (254.8 extra orders) and ₹614 (store AOV ₹1,516). Chose: keep the engine values and report them.
- v2 Phase 3 needs "₹150 off", which is not in `fixtures/offers.json`. Chose: define it in code as a cheaper amount of the "₹ off" offer already on the menu (fixtures untouched).
- SPEC 5.2 asks the aggregated baseline "conversions within 0.5%" of the fixture, but the baseline month includes code lifts, so it can't match `base_conversion`. Chose: compare with the fixture-implied rate (base + share × code lift); checkouts exact, AOV exact to the rupee.
- "About −2.9%" for the best reachable orders change is −2.85% exactly (rounds to −2.8 half-even). Chose: test with the spec's ±0.1 tolerance.
- Live-mode model: spec says `claude-sonnet-5-5`; kept as default (override with `ANTHROPIC_MODEL`). The function uses low effort and the server-side refusal fallback (`fallbacks: "default"`).

## Where AI was wrong or I overruled it
- 3x return target → most-profit objective (my challenge).
- Lapsed-shopper lift inconsistency in the first demo numbers (AI flagged and fixed its own error).
- Early design samples used a Razorpay-style wordmark → replaced with a concept label and no brand assets.
