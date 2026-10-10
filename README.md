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

| Route | Screen |
| --- | --- |
| `/` | Ray home: last month's KPIs and the "ALPHA10 lost you money" insight |
| `/ray` | Setup and plan: setup card, live plan card, Approve, "Jump 20 days", chat with Ray |
| `/checkout` | Checkout simulator: sample shoppers, a Magic Checkout-style sheet, the "Why" panel, outage toggle |
| `/results` | Results at day 20 / day 60: holdout proof, ranges, overrides, alerts, billing, creator codes |
| `/studio` | Agent Studio page: how it works, permissions, pricing, install and kill switch |
| `/settings` | Guardrails and data: data sources, guardrail values, outage simulator, audit log, reset |

**Play demo** (top bar) runs a scripted walkthrough of about 80 seconds, with Back, Pause and Next.

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

- `netlify/functions/ray.ts` adds the system prompt and tool schemas and calls the Claude Messages API.
- The browser runs the tools locally and sends the results back. Each question is limited to 4 tool rounds and 1,024 output tokens.
- Privacy and guardrail refusals are always answered locally, before anything is sent to the model.
- The rate limit is about 30 questions an hour per IP, held in memory. It resets when the function cold-starts, so it is best-effort only.
- Without a key the function returns 503, and the app quietly stays in demo mode ("Demo mode" chip).
