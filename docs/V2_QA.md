# Smart Offers v2 — QA

Branch `v2-smart-offers`. Last run: 11 Oct 2026. `npm test`: **192 passed**. `npm run build`: **passes**.
"Verified" = run by Claude Code in headless Chromium (Playwright) or Vitest. "You" = needs Praveen (deployed site, real key, real phone).

## §15 acceptance checks

| # | Check | How | Result |
|---|---|---|---|
| 1 | Group spend and extra sales sum to totals, every day view | `src/engine/__tests__/v2.net.test.ts` | Pass (5 days) |
| 2 | Same profit, return, cost per extra order on Home, Results, Agent Studio, Impact, weekly reviews, WhatsApp line, Ray | `src/ui/__tests__/v2.consistency.test.tsx` (renders pages), `v2.learning.test.ts` | Pass |
| 3 | Editing Setup changes no live number until Approve; Discard restores | `src/state/__tests__/v2.state.test.ts` + browser | Pass |
| 4 | ALPHA10, simple rule, Smart Offers on the same kept rate, margin, budget and shoppers | `v2.net.test.ts` | Pass |
| 5 | No-offer control groups within ±3 pp on every day and review | `v2.net.test.ts` | Pass |
| 6 | No fractional orders rendered | `v2.consistency.test.tsx` (5 pages) | Pass |
| 7 | No hard-coded engine figures in UI, Ray copy or tour captions | `v2.net.test.ts` scans `src/ui` and `src/ray` | Pass |
| 8 | Approving ₹150 off updates day 30/60 everywhere; not approving keeps plan v1 | `v2.learning.test.ts` + browser | Pass |
| 9 | Tour v2 end to end from a fresh browser, no console errors; Reset → defaults; storage blocked renders | Browser (14 steps), `v2.storage.test.tsx` | Pass |
| 10 | Checkout lookup < 50 ms | `v2.routes.test.tsx` + Impact's live measurement | Pass (well under 1 ms) |
| 11 | Build passes; every existing route loads | `npm run build`; `v2.routes.test.tsx` (24 routes × before/after go-live) | Pass |
| 12 | Manual click-through list | This file, below | Verified items marked |

Browser sweep: 24 routes and tabs × 3 states (fresh · day 20 live · day 30 with the promotion approved) × 1366 px and 390 px, plus every day toggle. **164 checks, 0 issues** (no console errors, no horizontal scroll, no "NaN" / "undefined" / "Infinity").

## Manual click-through

### Routes
- [x] `/` Home: pre-launch banner (ALPHA10 cost per order vs earned, loss), live banner (day, cost per order, profit after returns) — verified
- [x] `/ray` — verified (Demo)
- [x] `/transactions`, `/settlements`, `/reports` — verified load
- [x] `/offers`: prepaid insight, leak radar, coupons — verified
- [x] `/offers/smart` Results / Setup & plan / Checkout preview / Creator codes — verified
- [x] `/studio`: Cart Abandonment badge — verified
- [x] `/studio/smart-offers`: Overview, Weekly reviews, **Experiments** (new), Impact, Runs, Transactions, Guardrails, Activity log — verified
- [x] `/settings`, `/banking`, `/payroll`, `/products/invoices`, `/about` — verified

### Day toggles (Results)
- [x] Day 7 / 14 / 20 / 30 (proj.) / 60 (proj.) at moment day 20 — verified; proof sentence changes with the day; projections labelled
- [x] Same at day 30, with and without the ₹150 promotion — verified; day 30/60 change only when approved

### Draft vs approved
- [x] Edit budget after approval → yellow "Draft · not live" with diff; Results unchanged — verified
- [x] Discard → draft gone — verified
- [x] Approve changes → live budget changes; Activity log has the diff — verified (via Ray draft card too)

### Learning loop
- [x] Day 20 strip: "Waiting on you (2)": MEERA15 and the organic test — verified
- [x] Week 3 review: Approve "Promote ₹150 off" → Day 30 numbers change, Experiments shows "promoted" — verified
- [x] Activity log: Undo on the automatic challenger start → test stopped, no promotion proposal — verified
- [x] Playbook "Add as challenger" for an off-menu offer asks for an OK first — verified
- [x] Prepaid-only test from the insight card → UPI line in checkout preview, read in Experiments — verified

### Control
- [x] Kill switch → Resume (tour step 14) — verified
- [x] Stop Smart Offers drawer (turn off / restore ALPHA10) — existing; loads
- [x] Reset clears v1 and v2 storage — verified (test)

### Ray
- [x] Demo: four new chips, settings change → draft with diff → Approve → live, guardrail refusals named — verified
- [ ] **Live (Claude)**: ask "What does ALPHA10 cost me per order?" and "Set my budget to ₹80,000" on the deployed site; expect numbers from the snapshot and a draft card — **you** (needs the Netlify function and the key; not reachable from the build environment)

### Tour and badge
- [x] Play demo v2: 14 steps, captions computed, ends on the outcome; controls bottom-left — verified
- [ ] Netlify badge does not cover Play demo / Reset on the deployed preview, in an incognito window — **you**
- [ ] Run the full tour once on a phone — **you**
