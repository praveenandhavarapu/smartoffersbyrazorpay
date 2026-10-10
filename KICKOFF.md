# Kickoff — how to run the build

## Before the first session (about 20 minutes, you)

1. **Create the repo.** On GitHub: New repository → name `alpha-smart-offers` → **Private** → tick "Add a README" → Create.
2. **Upload this kit.** In the repo: Add file → Upload files → drag in everything from this kit, keeping the folders (`docs/`, `design/`, `fixtures/` and the `.md` files at the top level) → Commit to `main`.
   - Do not upload the challenge brief PDF. It is marked confidential.
3. **Open Claude Code on the web** (claude.ai/code) → choose the `alpha-smart-offers` repo → start a session and paste Session 1's prompt below.
   - If `npm install` fails inside the session, check that the environment's network access allows package registries.
4. **Connect Netlify** once the first pull request exists. Follow `NETLIFY_SETUP.md`.

## Session 1 — Saturday: Parts 2 and 3 (foundation and data)

```
Read CLAUDE.md and docs/SPEC.md completely before doing anything.
Then build Part 2 (Foundation) and Part 3 (Data layer) exactly as SPEC section 12 describes.
Create a branch named build/part-2-3. After each part: run npm test and npm run build, commit, push, and append an entry to BUILD_LOG.md.
Open a pull request to main titled "Parts 2-3: foundation and data layer" as soon as the first commit is pushed, so Netlify builds a preview.
Do not edit anything in fixtures/. If the spec is unclear, log the question under "Open questions" in BUILD_LOG.md, choose the safest option, and continue.
When both parts are done, stop and reply with: what is done, test results, anything you changed from the spec and why, and open questions.
```

## Session 2 — Sunday: Parts 4 and 5 (engine and core screens)

Merge Session 1's pull request first.

```
Read CLAUDE.md and docs/SPEC.md again, then read BUILD_LOG.md to see what exists.
Build Part 4 (Decision engine) and Part 5 (Core screens: Home, Setup and plan, Checkout simulator, Results) from SPEC section 12. Agent Studio and Settings come in Session 3.
Branch build/part-4-5; commit per part; push often; open one pull request to main.
Part 4 is done only when every value in fixtures/expected_outputs.json is reproduced by src/engine/__tests__/expected.test.ts.
For Part 5, use design/reference.html for layout and style, but every number must come from the engine.
Check every screen at 390 px wide and at desktop width.
Append to BUILD_LOG.md after each part. Stop at the end and summarise as before.
```

## Session 3 — Monday: Parts 6 and 7 (Ray, Agent Studio, settings, ship)

Merge Session 2's pull request first.

```
Read CLAUDE.md, docs/SPEC.md and BUILD_LOG.md.
Build Part 6 (Ray in demo mode with tools, privacy rules and red-team tests; Agent Studio; Guardrails and data page) and Part 7 (Play demo stepper, polish, README, final BUILD_LOG) from SPEC section 12.
Build live mode (the Netlify function) only after everything else passes, and only if the session still has room.
Branch build/part-6-7; one pull request to main.
All red-team tests in SPEC 8.5 must pass in demo mode. If live mode is built, it must fall back to demo mode cleanly when no API key is set.
Finish with a short checklist of what I should click through on the preview before recording the 90-second video.
```

## Fix prompt (use any time after reviewing a preview)

```
On the Netlify preview, [screen] shows [problem]. Expected: [what you want].
Fix it without changing fixtures/, keep npm test and npm run build passing, commit, push, and add one line to BUILD_LOG.md.
```

## Making the cloud credit last

- One clear goal per session; point it at CLAUDE.md and SPEC.md instead of re-explaining.
- Review on the Netlify preview link, then send one batched fix prompt rather than many small ones.
- Check the credit balance after Session 1 to see what a session costs, and keep about a quarter for Monday and Tuesday fixes.
