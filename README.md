# AlphaCode

**LeetCode prep course** for high schoolers — interactive lessons, quizzes, and
core coding patterns before interview-style problems.

> LeetCode prep course.

Built with **React + TypeScript + Vite**, with **Supabase** for authentication
and progress persistence.

## Status

This MVP is being built in phases:

- **Phase 1 — Foundation** ✅ TypeScript + routing, Supabase auth (with guest
  mode), landing page, auth screen, onboarding, and the course home with the
  5-lesson learning path, streak, and mastery stats.
- **Phase 2 — Core Lesson** ⏳ Interactive lesson player: code display, line
  highlighting, variable boxes, typed/drag answers, and instant feedback.
- **Phase 3 — Persistence & Unlocking** ✅ Supabase persistence (profiles,
  lesson progress, per-attempt log) with cross-device sync for accounts and
  local fallback for guests, plus mastery, streaks, the 75% unlock rule, and
  review recommendations.
- **Phase 4 — Polish & Deploy** ✅ Branded loading screens, an app-wide error
  boundary, answer/completion animations, mobile-responsive polish, SEO/social
  meta tags, and deploy config (Vercel + Netlify SPA fallback).

## Database setup (one time)

For logged-in accounts to sync across devices, create the tables in your
Supabase project:

1. Open the Supabase dashboard → **SQL Editor** → **New query**
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**

This creates `profiles`, `lesson_progress`, and `attempts` with row-level
security so each user only sees their own data. Until this is run, logged-in
users fall back to on-device storage (the app warns you on the course page).
Guests always save locally.

## Setup

Install dependencies:

```sh
npm install
```

Create a local env file from the example and add your Supabase values:

```sh
cp .env.example .env.local
```

```sh
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app runs without Supabase configured — use **Continue as guest** to explore.
Guest progress is stored locally in the browser.

## Develop

```sh
npm run dev        # start the dev server
npm run typecheck  # TypeScript project build / type check
npm run lint       # oxlint
npm run build      # type check + production build
```

## Browser Python judge

Python code assessments load the self-hosted Pyodide runtime lazily in a module
worker. Only the assessment test plan and submitted source cross the worker
boundary; authentication and progress data do not.

Example cases may be shown as learner feedback. Hidden cases are educational,
non-displayed checks, but they are still downloaded to the browser and can be
inspected or modified by a determined user. Browser-judge results are therefore
not tamper-proof certification or proctoring evidence. Execution and output
limits are enforced by terminating the worker, while the content-authored
memory limit is advisory because WebAssembly does not provide a reliable
per-run memory quota here.

## AI tutor

Mission pages include a collapsible AI tutor drawer, and review/exam screens
include "Bit" (Socratic hints; neither dumps solutions unless the learner
insists after a hint). Both talk to an OpenAI-compatible chat-completions
endpoint over one of two transports, chosen automatically:

| Transport | Chosen when | Streams | Key location |
| --- | --- | --- | --- |
| direct | `VITE_TUTOR_API_KEY` is set | yes | client bundle — **local only** |
| proxy | Supabase is configured and there is no client key | no | Supabase secret |

With neither available the tutor shows a friendly "not plugged in" note behind a
subtle button.

### Local (direct)

Put a key in `.env.local` (git-ignored — never commit it):

```bash
# .env.local
VITE_TUTOR_API_KEY=tfy_...
# optional overrides
#VITE_TUTOR_BASE_URL=https://gateway.truefoundry.ai
#VITE_TUTOR_MODEL=openai-group/gpt-5.4-mini
```

> ⚠️ **Never set `VITE_TUTOR_API_KEY` on a public host.** `VITE_` vars are baked
> into the client bundle at build time, so the key would be readable by anyone
> who opens devtools. Deployments use the proxy transport instead.

### Deployed (proxy)

The `ai-tutor` edge function holds the provider key server-side, so a deployment
needs **no tutor `VITE_` vars at all** — just the two Supabase ones. Configure it
with Supabase secrets (these never enter a build):

```sh
supabase secrets set AI_TUTOR_API_KEY=...                          # required
supabase secrets set AI_TUTOR_BASE_URL=https://gateway.truefoundry.ai  # default api.openai.com
supabase secrets set AI_TUTOR_MODEL=openai-group/gpt-5.4-mini       # default gpt-4o-mini
npm run ai:deploy   # supabase functions deploy ai-tutor --no-verify-jwt
```

`OPENAI_API_KEY` is still honoured as a legacy key name. `AI_TUTOR_TEMPERATURE`
and `AI_TUTOR_MAX_TOKENS` are optional and omitted by default, since some models
reject them.

Check a deployment without spending a token — `GET` returns the resolved config
(never the key):

```sh
curl -s "$VITE_SUPABASE_URL/functions/v1/ai-tutor" -H "apikey: $VITE_SUPABASE_ANON_KEY"
# {"ok":true,"hasKey":true,"baseUrl":"https://...","model":"..."}
```

If the tutor answers with canned hints and an `offline` badge, the browser
console carries the reason (`[ai-tutor] offline hints: …`), including the
provider's own error text.

## Deploy

The app is a static SPA, so any static host works. Both options below include a
catch-all rewrite to `index.html` so client-side routes (e.g. `/lesson/...`)
survive a hard refresh.

Set these environment variables in your host's dashboard — and only these. The
tutor's provider key belongs in a Supabase secret, not here (see
[AI tutor](#ai-tutor)):

```sh
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`VITE_` vars are inlined at build time, so changing any of them requires a
**redeploy** — an env-var edit alone does not affect the already-built bundle.

**Vercel** — import the repo (build command `npm run build`, output `dist`).
[`vercel.json`](vercel.json) handles SPA routing. Or from the CLI:

```sh
npm i -g vercel
vercel        # preview
vercel --prod # production
```

**Netlify** — build command `npm run build`, publish directory `dist`.
[`public/_redirects`](public/_redirects) handles SPA routing.

After your first deploy, run the [database setup](#database-setup-one-time) so
accounts sync across devices.

## Project structure

```
src/
  components/   shared UI (Brand, AppHeader, ProtectedRoute)
  content/      lesson catalog (the course path)
  context/      AuthContext (Supabase auth + guest), ProgressContext
  lib/          supabase client, mastery formula, date helpers
  pages/        Landing, Auth, Onboarding, CourseHome, Lesson
  types/        lesson + progress type definitions
```
