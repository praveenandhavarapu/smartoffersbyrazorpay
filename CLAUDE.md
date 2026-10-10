# CLAUDE.md — Smart Offers prototype

Concept prototype for the Razorpay × ISB Build Challenge (AI PM track). Owner: Praveen.
**Read `docs/SPEC.md` fully before writing code. It is the source of truth.**

## What this is
A Ray (Agentic Dashboard) + Agent Studio agent that decides which shopper groups get which approved Magic Checkout offer, or none, to maximise a merchant's extra profit within a budget, proven by a 10% holdout. Demo merchant: Alpha Apparel Private Limited (synthetic data).

## Commands
- `npm install` · `npm run dev` · `npm test` · `npm run build` · `npm run gen` (writes generated JSON to `generated/`, gitignored)
- Reference maths: `python3 docs/reference_engine.py` regenerates `fixtures/expected_outputs.json` (do not edit fixtures by hand)

## Rules (short form — details in SPEC section 2)
- Concept label on every screen. No Razorpay logo files or imitation wordmarks.
- Synthetic, seeded data only. Never show network merchant names. Mask phone numbers.
- No LLM in the checkout decision path. Ray drafts; humans approve anything that spends money.
- Every number on screen comes from the engine or data layer. No hard-coded figures in components.
- Privacy in code: peer data only as aggregates from 20+ merchants, no merchant > 25% of the sample.
- Never change `fixtures/*.json` to make a test pass. If the spec looks wrong, log it under "Open questions" in `BUILD_LOG.md` and pick the safest option.
- Mobile first: no horizontal page scroll at 390 px.

## Workflow
- Work in the Parts listed in SPEC section 12. One commit per part; push often; one pull request per session.
- Before each commit: `npm test` and `npm run build` must pass.
- After each part, append to `BUILD_LOG.md`: time, what was built, key decisions, deviations from spec and why, time taken.
- Keep components small; types strict; no `any` unless justified in a comment.

## Where things are
`fixtures/` source data and expected outputs · `design/reference.html` visual reference (old numbers, ignore them) · `src/data` data layer and adapters · `src/engine` decision engine · `src/ray` agent and guardrails · `src/ui` screens and components · `netlify/functions/ray.ts` live Ray proxy.
