-- Code Tracer — database schema
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).

-- =========================================================
-- profiles: one row per authenticated user
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  email text,
  experience_level text,
  streak_current int not null default 0,
  streak_longest int not null default 0,
  last_activity_date date,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- =========================================================
-- lesson_progress: one row per (user, lesson)
-- =========================================================
create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users on delete cascade,
  lesson_id text not null,
  status text not null default 'notStarted',
  current_step_index int not null default 0,
  completed_step_ids jsonb not null default '[]'::jsonb,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  total_attempts int not null default 0,
  correct_first_try int not null default 0,
  accuracy int not null default 0,
  mastery_score int not null default 0,
  unlock_next_lesson boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lesson_progress enable row level security;

drop policy if exists "lesson_progress_select_own" on public.lesson_progress;
create policy "lesson_progress_select_own" on public.lesson_progress
  for select using (auth.uid() = user_id);

drop policy if exists "lesson_progress_insert_own" on public.lesson_progress;
create policy "lesson_progress_insert_own" on public.lesson_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "lesson_progress_update_own" on public.lesson_progress;
create policy "lesson_progress_update_own" on public.lesson_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "lesson_progress_delete_own" on public.lesson_progress;
create policy "lesson_progress_delete_own" on public.lesson_progress
  for delete using (auth.uid() = user_id);

-- =========================================================
-- attempts: append-only log of every answer submission
-- =========================================================
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  lesson_id text not null,
  step_id text not null,
  submitted_answer jsonb,
  expected_answer jsonb,
  is_correct boolean not null,
  attempt_number int not null,
  created_at timestamptz not null default now()
);

create index if not exists attempts_user_lesson_idx
  on public.attempts (user_id, lesson_id, created_at);

alter table public.attempts enable row level security;

drop policy if exists "attempts_select_own" on public.attempts;
create policy "attempts_select_own" on public.attempts
  for select using (auth.uid() = user_id);

drop policy if exists "attempts_insert_own" on public.attempts;
create policy "attempts_insert_own" on public.attempts
  for insert with check (auth.uid() = user_id);
