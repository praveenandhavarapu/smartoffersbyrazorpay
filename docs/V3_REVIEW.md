# Smart Offers v3: fixes from the live-site review

Branch `claude/confident-wozniak-42snhx` · 11 Oct 2026 · synthetic data throughout.

## What was asked, and where it is now

| Ask | What changed | Where to see it |
|---|---|---|
| Don't assume the merchant's numbers (the "4x", "30%", "₹50,000" chips) | Every input (budget, what you keep from ₹1,000, goal, offer menu and max discount, minimum return, festive rule) shows what stores this size typically use. The merchant confirms each one or types their own. Approve stays disabled until all are confirmed. Before that, Ray adds a visible note to any answer that relies on typical values. The preset chips are gone; the new chips ask about the merchant's own numbers. | Smart Offers → Setup & plan → **Your numbers**; the yellow "Before you approve" box on the plan; Ray → "Set up Smart Offers" |
| Benchmarks from stores of similar size, backed by data | Each of the 1,200 synthetic stores now has its own economics: what it keeps per ₹1,000, offer budget as % of sales, goal, menu, max discount, minimum return, and festive pauses. They are aggregated by category and monthly-sales band, with at least 20 stores and no store above 25% of the band's sales. Alpha's band: **150 apparel stores with ₹20–35 lakh monthly sales**. | Hints under every setup input; Ray "What are my numbers?" |
| Ray offered a scenario, then said "I couldn't run that scenario" | Scenarios now accept per-group overrides (e.g. returning → ₹100 off), playbook offers, menu changes, max discount, minimum return and growth trade-offs. The Live system prompt now says to offer only what the tools can do and to do it on "yes". In Demo mode, "yes", "go with that", "draft that", "what about 35%?", "why?" and "give them…" all act on the previous answer. | Ray chat |
| The scenario card (₹94,665) didn't match the plan Ray recommended (₹33,062) | Every scenario Ray runs is now shown. Several become one comparison table, in the order they were run, each titled by what changed. Ray is told the plan it recommends must be one it ran. | Ray chat (Live and Demo) |
| Edit button in the chat plan did nothing | Edit opens the inputs inline inside the chat plan card. On Setup & plan it jumps to the inputs. | Ray → any plan card → Edit |
| Recommended offers beyond the preset menu: where are they? | New card: **Recommended offers not on your menu**. It scores ₹150 off, free shipping on ₹999+, prepaid-only free shipping, a non-cash perk, and any standard offer you removed, using the plan engine at your numbers: profit change, new-customer change and evidence from stores like yours. "Add to my menu" makes a draft. | Smart Offers → Setup & plan (below the plan); Ray → "What other offers should I try?" |
| Flexibility on margins, and the cost of growth | New card: **Trade-offs you choose**. *Grow more, earn less* lists real plans from most profit to most new customers (or orders). Each shows the profit given up, the budget needed, the cost per extra customer, and the repeat profit a new customer brings. "Use this" makes it a draft. *If my margin is squeezed* shows which offers stop paying at a lower margin, and what keeping today's new customers would cost. | Smart Offers → Setup & plan; Ray → "I want more new customers", "What if my margin is lower?" |

## The 250 conversations

`src/ray/__tests__/scenarios/corpus.ts` holds 250 merchant conversations. They cover payments, coupons, plan questions, what-ifs, trade-offs, recommendations, drafts, results, guardrails, small talk, multi-turn follow-ups, and cases taken from the transcript reviews. Typos and Hinglish are included ("pymnts lst 7 days", "kitna collect hua aaj", "settlement kab aayega").

Each conversation runs in 6 store states: not set up; live day 20; live day 30 with a promotion; draft pending; paused; and 40% margin. That is **1,500 runs** through the same conversation core the app uses (`src/ray/converse.ts`).

Every reply is checked for the following (`harness.ts`):
- no fallback to generic help;
- no "I couldn't…";
- no NaN or undefined;
- cards agree with the text;
- every chip leads somewhere;
- a "yes" to an offer carries it out;
- no number the merchant never gave;
- correct refusals, and no wrong ones;
- a live store is never treated as not set up;
- before go-live, no chips that only work once live, and answers that use typical values say so;
- "why" never creates a draft;
- drafts always change something;
- no pause is drafted before anything is live.

| Run | Failures | Conversations affected |
|---|---|---|
| Before the fixes (225 conversations) | 588 | 87 |
| After round 1 | 0 by the first checks; a transcript review found about 40 more problems the checks didn't catch | – |
| After round 2 (checks tightened to cover them) | **0** | **0** |
| Final (250 conversations) | **0** | **0** |

### Problems found and fixed

**Before the fixes:**
- 402 replies fell through to generic help. These included typos, fees, guardrails, "go live", every growth or trade-off question, most recommendation questions, and follow-ups like "yes please" or "what about 35%?".
- 96 cards disagreed with their text.
- 48 replies offered a next step that "yes" couldn't do.
- The chat Edit button and the "Waiting on you" links on the reviews tab did nothing.

**Found by reviewing transcripts (round 1):**
- **"Why" questions:** "Why does returning get no offer?" drafted a ₹0 change.
- **ALPHA10:** "Should I stop ALPHA10?" drafted a pause of Smart Offers.
- **Live store treated as new:**
  - A live store was offered "Set up Smart Offers" and told "Nothing goes live until you approve".
  - Typical values were quoted as if they were the merchant's own.
- **Payments:**
  - "Payments yesterday" covered two days.
  - Fees, success rate, UPI share and disputes were buried in long replies.
- **Wording:**
  - Money-losing drafts had no warning.
  - Settings drafts hid what changed ("+2 more").
  - The setup said "four questions" and then asked six.

**Found by reviewing transcripts (round 2):**
- **Growth drafts:** drafting the ₹9,812 growth option picked the ₹5,962 one, because the amount was rounded.
- **Budget:**
  - Override scenarios could exceed the budget hard stop without saying so.
  - Ray offered to draft budgets the plan wouldn't use.
- **ALPHA10:** "Should I stop ALPHA10?" answered "No, it isn't worth it" (meaning yes).
- **Setup on a live store:** it started from scratch instead of showing the approved values.
- **Trade-offs:**
  - Growth totals disagreed by a rounding step.
  - "Is growth worth it?" got a list instead of an answer. It now compares the cost per new customer with the ₹143 of repeat profit a new customer brings in 180 days.

## Live mode (Claude)

Live answers come from Claude via the Netlify function. I couldn't call your key from here. Instead:
- The tool layer Claude uses was tested directly, including junk arguments on every tool (`src/ray/__tests__/v3.live.test.ts`).
- An agent played Live Ray with the real system prompt and real tool calls over 18 conversations, including the three from the screenshots.

New tools:
- `get_tradeoffs`
- `get_recommended_offers`
- `get_setup_benchmarks`
- `request_resume`

Extended tools:
- `simulate_plan`: overrides, menu changes, max discount, minimum return, growth
- `draft_settings_change`: menu, max discount, minimum return, festive rule, growth

New system-prompt rules:
- 12: never assume the merchant's numbers.
- 13: offer only what the tools can do, and do it on "yes".
- 14: every scenario run appears as a card.
- 15: which tool to use for growth, margin squeeze and recommendations.

The model, keys and function are unchanged.

### What the Live role-play found (all fixed)

**Wrong numbers or unsafe defaults**
- Plans that included a playbook offer showed a "likely" range that didn't contain their own estimate. Ranges now use the plan's own data, and variants borrow the spread of the closest standard offer.
- An unknown pause scope ("big carts") widened to pausing everything. It now returns an error.
- Override drafts could exceed the budget hard stop silently. Drafts and scenario cards now show the whole plan, the over-budget warning and the budget needed.
- Under a tight budget the optimiser could leave profitable money unspent. At ₹80,000 it planned ₹17,755 a month while ₹19,031 fit. A refill pass now uses the leftover budget. The same pass was added to `docs/reference_engine.py` and the expected outputs regenerated; they didn't change.

**Rounding and labels**
- A growth amount passed back rounded to the rupee landed one step short. There is now ₹1 tolerance.
- Labels are clearer:
  - marginal vs average cost per extra customer;
  - "not reachable" now says why and gives the maximum;
  - the pilot figure is labelled as a day-30 projection;
  - the orders baseline;
  - whether ₹150 off is on the menu;
  - titles that say what happened, e.g. "budget ₹2,00,000 (uses ₹94,665)".

**System prompt**
- One closing question, not two.
- What to say for offer types the engine can't price.
- Ask when a bare "yes" is unclear.
- Creator-code fixes are approved in Weekly reviews.

## Is the existing code compatible?

Mostly yes. The plan optimiser already supported per-group overrides, a minimum return and offer menus, but Ray's tools didn't expose them. Two gaps needed new engine code:
- a growth-vs-profit frontier (`growthSteps` in `plan.ts`, `tradeoffs.ts`);
- off-menu offer scoring (`recommend.ts`).

These are additive: with no growth setting and the default menu, every existing number and fixture test is unchanged. One consistency bug fixed on the way: Ray's scenarios priced plans on slightly different group data than the plan card. They now share one source (`derived.planGroups`).

## Choices made

- **Starting values.** The demo still opens with values filled in, but they are now labelled as typical values for stores this size, and the merchant must confirm or change each one before Approve. The synthetic band is calibrated so its medians equal the starting values (₹500 kept per ₹1,000, ₹1,00,000 budget). This is documented in `src/data/generator/network.ts`.
- **Growth can go below break-even.** A growth trade-off may run individual offers below break-even, because that is the profit the merchant chose to give up. The plan says so and shows the cost. A minimum return the merchant set above break-even still applies.
- **Budget for growth.** Growth steps that need a bigger budget say so and set the budget in the same draft.

## Evidence

**Automated tests**
- `npm test`: 231 tests pass, including 250 conversations × 6 states.
- `npm run build`: passes.

**Browser (headless Chromium)**
- v3 checks: 40 of 40 pass. They cover the input gate, inline Edit, chat setup with typical values, "yes please" running the offered scenario, trade-off and recommendation actions, the live-store wording, and no horizontal scroll at 390 px.
- Full sweep: 24 routes × 3 states × 2 widths, 164 checks, 0 issues.
- Button sweep: both real dead buttons are fixed. The remaining no-ops are re-clicks of the tab or toggle already selected.
- Demo tour: all 14 steps run with no errors.

**Still to check on the deployed site:** Ray in Live mode with your key (the wording comes from Claude), and one run of the tour on a phone.
