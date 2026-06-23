# Code Tracer

A Brilliant-style Python puzzle app where beginners learn how code runs by
stepping through code, updating visual variable boxes, and getting instant
feedback.

> Learn Python by tracing what the computer does.

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

## Deploy

The app is a static SPA, so any static host works. Both options below include a
catch-all rewrite to `index.html` so client-side routes (e.g. `/lesson/...`)
survive a hard refresh.

Set these environment variables in your host's dashboard (same values as
`.env.local`):

```sh
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

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
