# Smart Offers — concept prototype

> Concept prototype for the Razorpay × ISB Build Challenge. Not a Razorpay product. All data is synthetic.

Smart Offers is a concept agent for Agent Studio, run through Ray. It decides which shopper groups get which approved Magic Checkout offer, or none. It aims for the most extra profit within a monthly budget, never runs an offer below break-even, and proves results against a 10% holdout. Demo merchant: **Alpha Apparel** (synthetic). The full spec is in [`docs/SPEC.md`](docs/SPEC.md).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: engine vs fixtures, generator, privacy, guardrails, Ray red-team, app smoke test
npm run build    # type-check + production build into dist/
npm run gen      # writes the generated synthetic data to generated/ (gitignored) for inspection
```

Deploy: Netlify reads `netlify.toml` (build `npm run build`, publish `dist`, functions `netlify/functions`). See `NETLIFY_SETUP.md`.

## Screens

A dashboard in the style of a payments console (no brand assets; concept label always visible):

| Area | Route | What it does |
| --- | --- | --- |
| Payments → Home | `/` | 30-day KPIs, 6-month collections chart, method mix, recent payments, Ray insight |
| Transactions | `/transactions` | Payments, Orders, Refunds, Disputes with filters, search and a detail drawer |
| Settlements | `/settlements` | T+1 settlements; instant on-demand "Settle now" when enabled |
| Reports | `/reports` | Download CSV reports (settlements, recon, payments, offers, refunds, orders) |
| Offers & Coupons | `/offers`, `/offers/smart` | Coupons, and Smart Offers: results, setup & plan (your numbers with typical values for stores your size, recommended offers not on your menu, growth-vs-profit and margin-squeeze trade-offs), checkout preview, creator codes |
| Ray AI | `/ray` | Chat with Ray. Live (Claude) or Demo toggle; guided setup; cards and follow-up suggestions |
| Agent Studio | `/studio`, `/studio/smart-offers` | Smart Offers Agent: daily 06:00 runs, transactions it decided, guardrails, activity log, kill switch |
| Agent Studio → Weekly reviews / Impact | `/studio/smart-offers?tab=reviews`, `?tab=impact` | Monday reviews with approvals; north-star metric, outcomes, funnel, engagement, prediction accuracy, guardrails |
| About this concept | `/about` | Why this problem (selection scoring), merchant and current workflow, product loop, what we left out, risks |
| Account & Settings | `/settings` | Ray mode and health, settlement schedule, data sources, outage simulator, audit log, reset |
| Banking+, Payroll, other products | `/banking`, `/payroll`, `/products/*` | Overview pages (outside this concept's scope) |

**Product lifecycle in the prototype:**
- **Find:** Ray's opportunity signals with thresholds, plus a notification bell.
- **Decide and approve:** the merchant gives each input (or accepts a typical value for stores their size; nothing is assumed); "why AI, not a rule" on the same shoppers; plan with holdout cost; trade-offs they choose; Approve.
- **Run:** daily 06:00 agent runs.
- **Prove:** results against the holdout, and predicted vs measured lift.
- **Review weekly:** Monday reviews, no verdicts before day 14, approve changes.
- **Decide on day 30:** keep, extend or stop, with the fee on proven sales.
- **Grow:** next experiments needing approval.
- **Exit:** stop, or restore ALPHA10, with the cost stated once.
- **Measure:** the Impact tab.

**Play demo** (bottom bar) runs a scripted walkthrough of about 90 seconds, with Back, Pause and Next. Ray uses scripted answers while it plays, so the video is repeatable.

### Synthetic data (display only)
- Six months (11 Apr – 10 Oct 2026) of orders, payments, refunds, disputes and settlements in `src/data/generator/ledger.ts`.
- Method mix is UPI 50%, cards 40%, netbanking and wallets 10%.
- Fee is 2% plus 18% GST on the fee. Settlements are T+1, with instant on-demand settlement as an option (0.25% demo fee).
- 22 Aug – 10 Oct reuses the exact-count orders the Smart Offers engine measures, so the dashboard and the engine agree.

## How it is built

- **Vite + React 18 + TypeScript (strict)**, React Router, Zustand. The styling comes from `design/reference.html`, with tokens in `src/styles/tokens.css` and Tailwind utilities available.
- **Data layer** (`src/data`): Razorpay-shaped raw entities (paise), domain types (rupees), a `DataSource` interface, `MockDataSource` (fixtures plus a seeded generator), and `aggregate.ts` (raw sessions → per-group stats).
  - `generator/alpha.ts` generates the baseline month and pilot days 1–20 with exact counts.
  - `generator/network.ts` generates 1,200 synthetic merchants, 180 of which form Alpha's similar-store pool.
- **Engine** (`src/engine`): economics, the plan optimiser, scenarios, measurement against the holdout (90% ranges, blended lifts), guardrails, explanations and the precomputed checkout lookup. `expected.test.ts` reproduces every value in `fixtures/expected_outputs.json`.
- **Ray** (`src/ray`): tools (the only way Ray touches data), a demo-mode router with templates (no key needed, and it never invents numbers), red-team and privacy tests, and an optional live mode.
- **Persistence**: only user inputs (settings, approvals, overrides, pause state) and the audit log, stored in `localStorage` under `smart-offers:v1`. Everything else is recomputed. "Reset demo" clears it.

### Swapping in real Razorpay data

`src/state/model.ts` creates the data source (`new MockDataSource()`). `src/data/adapters/razorpay/RazorpayDataSource.ts` implements the same interface as a stub. Each method throws `NotConnectedError` and names the Razorpay API it would call (Orders, Payments, Magic Checkout promotions). To connect real data:

1. Implement those methods.
2. Classify sessions with `checkoutTable.classify()`.
3. Build `GroupStats` with `aggregate.ts`.
4. Change the one line in `model.ts`.

Field names marked `// VERIFY` must be checked against Razorpay's API docs first.

### Privacy and safety (enforced in code)

- Peer data leaves `network/peers.ts` only as aggregates: at least 20 stores, no store above 25% of the sample, rounded to 0.5 pp. A test fails if `ui/` or `ray/` imports the raw network module.
- There is no LLM in the checkout path. Offers come from a precomputed table with a 50 ms fail-safe.
- Ray can only draft. Anything that spends money needs a human click, and every action is written to the audit log.

### Live Ray (optional)

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) in Netlify's environment variables, then redeploy.

- Checking the key: `GET /.netlify/functions/ray` returns `{"configured": true, "model": "…"}` when the key is set. The value of the key is never returned.
- The Ray page and Account & Settings show the result. If live mode fails, the chat shows the real reason (missing key, timeout, auth, model) and answers that message in demo mode.
- Each round trip uses low effort and, on Sonnet 5.5, thinking only between tool calls. This keeps each round inside Netlify's roughly 10-second function limit.

- `netlify/functions/ray.ts` adds the system prompt and tool schemas and calls the Claude Messages API.
- The browser runs the tools locally and sends the results back. Each question is limited to 4 tool rounds and 1,024 output tokens.
- Privacy and guardrail refusals are always answered locally, before anything is sent to the model.
- The rate limit is about 30 questions an hour per IP, held in memory. It resets when the function cold-starts, so it is best-effort only.
- Without a key the function returns 503, and the app quietly stays in demo mode ("Demo mode" chip).
