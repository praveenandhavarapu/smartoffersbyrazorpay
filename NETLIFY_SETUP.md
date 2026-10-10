# Netlify setup (about 10 minutes)

Netlify now calls sites "projects". Steps checked against Netlify's docs on 10 Oct 2026; button names can change slightly.

1. **Sign up.** Go to app.netlify.com/signup and choose "Sign up with GitHub". Approve the GitHub authorisation.
2. **Import the repo.** In your Netlify team dashboard: **Add new project** → **Import an existing project** → **GitHub**.
   - When GitHub asks which repositories Netlify can see, choose "Only select repositories" and pick `alpha-smart-offers`. Private repos are fine.
3. **Build settings.** Netlify reads `netlify.toml` from the repo (Claude Code creates it in Part 2): build command `npm run build`, publish directory `dist`, functions `netlify/functions`. Keep these and click **Deploy** (or **Publish**).
   - If you import before Part 2 is merged, the first build may fail. That's fine; it rebuilds when the pull request lands.
4. **Deploy previews.** Each pull request gets its own preview link, posted on the pull request in GitHub. Open it on your phone to review.
5. **Nicer URL.** Project configuration → General → change the project name, e.g. `alpha-smart-offers` → `alpha-smart-offers.netlify.app`.
6. **Make it public for judges.** If your team makes projects private by default, change the project's visibility to public before you submit.
7. **Optional: live Ray mode.** Project configuration → **Environment variables** → add `ANTHROPIC_API_KEY` (from console.anthropic.com) and optionally `ANTHROPIC_MODEL`. Then trigger a new deploy, because variable changes only apply after a build.
   - API usage is billed separately from your Claude plan and from the cloud-session credit. The demo works without it.

Submit the production URL (the `.netlify.app` link), not a preview link.
