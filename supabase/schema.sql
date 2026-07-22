-- AlphaCode — database schema
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
  badges text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- Add badges to existing profiles tables (safe to re-run).
alter table public.profiles
  add column if not exists badges text[] not null default '{}';

alter table public.profiles
  add column if not exists badge_counts jsonb not null default '{}'::jsonb;

-- "The Threshold" gate between the Level-6 boss and the Final Gauntlet.
alter table public.profiles
  add column if not exists inter_zone_complete boolean not null default false;

alter table public.profiles
  add column if not exists inter_zone_completed_at timestamptz;

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
  last_review jsonb,
  primary key (user_id, lesson_id)
);

-- Add the review snapshot column to existing tables (safe to re-run).
alter table public.lesson_progress
  add column if not exists last_review jsonb;

-- Learn / quiz section progress (safe to re-run).
alter table public.lesson_progress
  add column if not exists learn_completed boolean not null default false;

alter table public.lesson_progress
  add column if not exists learn_step_index int;

alter table public.lesson_progress
  add column if not exists quiz_step_index int;

alter table public.lesson_progress
  add column if not exists learn_frame_index int;

alter table public.lesson_progress
  add column if not exists quiz_frame_index int;

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

-- =========================================================
-- concept_mastery: per-concept learner model (the personalization spine)
-- One row per (user, concept). Drives adaptive lessons, spaced repetition,
-- adaptive combat, and the Coder Profile dashboard.
-- =========================================================
create table if not exists public.concept_mastery (
  user_id uuid not null references auth.users on delete cascade,
  concept_id text not null,
  ability real not null default 0.5,
  confidence real not null default 0,
  seen int not null default 0,
  correct_first_try int not null default 0,
  box int not null default 1,
  due_at timestamptz,
  last_seen_at timestamptz,
  recent_results jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);

alter table public.concept_mastery enable row level security;

drop policy if exists "concept_mastery_select_own" on public.concept_mastery;
create policy "concept_mastery_select_own" on public.concept_mastery
  for select using (auth.uid() = user_id);

drop policy if exists "concept_mastery_insert_own" on public.concept_mastery;
create policy "concept_mastery_insert_own" on public.concept_mastery
  for insert with check (auth.uid() = user_id);

drop policy if exists "concept_mastery_update_own" on public.concept_mastery;
create policy "concept_mastery_update_own" on public.concept_mastery
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- learning_attempt_events: immutable v1 learning facts
-- =========================================================
create table if not exists public.learning_attempt_events (
  id text primary key check (char_length(id) between 1 and 200),
  user_id uuid not null references auth.users on delete cascade,
  interaction_id text not null check (char_length(interaction_id) between 1 and 200),
  session_id text not null check (char_length(session_id) between 1 and 200),
  device_id text not null check (char_length(device_id) between 1 and 200),
  device_seq bigint not null check (device_seq > 0),
  schema_version smallint not null default 1 check (schema_version = 1),
  source text not null check (
    source in (
      'lesson-learn',
      'lesson-quiz',
      'lesson-review',
      'warmup',
      'knowledge-surge',
      'realm-boss',
      'gauntlet-journey',
      'gauntlet-exam',
      'legacy-import'
    )
  ),
  problem_id text not null check (char_length(problem_id) between 1 and 500),
  skill_ids text[] not null default '{}',
  lesson_id text,
  step_id text,
  frame_index integer check (frame_index is null or frame_index >= 0),
  attempt_number integer not null check (attempt_number > 0),
  is_correct boolean not null,
  resolved boolean not null,
  first_try_correct boolean not null default false,
  used_hint boolean not null default false,
  revealed boolean not null default false,
  response_ms integer check (response_ms is null or response_ms >= 0),
  submitted_answer jsonb,
  expected_answer jsonb,
  metadata jsonb check (metadata is null or jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  constraint learning_attempt_first_try_valid check (
    not first_try_correct
    or (is_correct and resolved and attempt_number = 1 and not revealed)
  ),
  constraint learning_attempt_reveal_resolves check (not revealed or resolved),
  constraint learning_attempt_device_sequence_unique
    unique (user_id, device_id, device_seq),
  constraint learning_attempt_number_unique
    unique (user_id, interaction_id, attempt_number)
);

alter table public.learning_attempt_events
  drop constraint if exists learning_attempt_events_source_check;
alter table public.learning_attempt_events
  add constraint learning_attempt_events_source_check check (
    source in (
      'lesson-learn',
      'lesson-quiz',
      'lesson-review',
      'warmup',
      'knowledge-surge',
      'realm-boss',
      'gauntlet-journey',
      'gauntlet-exam',
      'legacy-import'
    )
  );

create unique index if not exists learning_attempt_one_resolution_idx
  on public.learning_attempt_events (user_id, interaction_id)
  where resolved;

create index if not exists learning_attempt_owner_received_idx
  on public.learning_attempt_events (user_id, received_at, id);

create index if not exists learning_attempt_owner_problem_idx
  on public.learning_attempt_events (user_id, problem_id, occurred_at, id);

create index if not exists learning_attempt_skill_ids_idx
  on public.learning_attempt_events using gin (skill_ids);

alter table public.learning_attempt_events enable row level security;

drop policy if exists "learning_attempt_events_select_own"
  on public.learning_attempt_events;
create policy "learning_attempt_events_select_own"
  on public.learning_attempt_events
  for select using (auth.uid() = user_id);

drop policy if exists "learning_attempt_events_insert_own"
  on public.learning_attempt_events;
create policy "learning_attempt_events_insert_own"
  on public.learning_attempt_events
  for insert with check (auth.uid() = user_id);

revoke update, delete on public.learning_attempt_events from anon, authenticated;
grant select, insert on public.learning_attempt_events to authenticated;

create or replace function public.reject_learning_attempt_event_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'learning attempt events are immutable'
    using errcode = '55000';
end;
$$;

drop trigger if exists learning_attempt_events_immutable_update
  on public.learning_attempt_events;
create trigger learning_attempt_events_immutable_update
  before update on public.learning_attempt_events
  for each row execute function public.reject_learning_attempt_event_update();

-- =========================================================
-- learning_mastery: rebuildable problem/skill projection cache
-- =========================================================
create table if not exists public.learning_mastery (
  user_id uuid not null references auth.users on delete cascade,
  entity_kind text not null check (entity_kind in ('problem', 'skill')),
  entity_id text not null check (char_length(entity_id) between 1 and 500),
  submission_count integer not null default 0 check (submission_count >= 0),
  review_count integer not null default 0 check (
    review_count >= 0 and review_count <= submission_count
  ),
  correct_count integer not null default 0 check (
    correct_count >= 0 and correct_count <= submission_count
  ),
  first_try_correct_count integer not null default 0 check (
    first_try_correct_count >= 0
    and first_try_correct_count <= correct_count
  ),
  ability double precision not null default 0.5 check (
    ability >= 0 and ability <= 1
  ),
  recent_results jsonb not null default '[]'::jsonb check (
    jsonb_typeof(recent_results) = 'array'
  ),
  scheduler_version smallint not null default 1 check (scheduler_version = 1),
  fsrs_phase text not null default 'new' check (
    fsrs_phase in ('new', 'learning', 'review', 'relearning')
  ),
  stability_days double precision not null check (
    stability_days >= (10.0 / 1440.0) and stability_days <= 3650
  ),
  difficulty double precision not null check (
    difficulty >= 1 and difficulty <= 10
  ),
  due_at timestamptz not null,
  last_review_at timestamptz,
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_event_id text,
  last_attempt_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  projection_version smallint not null default 1 check (projection_version = 1),
  legacy_seed jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, entity_kind, entity_id)
);

create index if not exists learning_mastery_owner_due_idx
  on public.learning_mastery (user_id, entity_kind, due_at);

create index if not exists learning_mastery_owner_weak_idx
  on public.learning_mastery (user_id, entity_kind, ability, entity_id);

alter table public.learning_mastery enable row level security;

drop policy if exists "learning_mastery_select_own"
  on public.learning_mastery;
create policy "learning_mastery_select_own"
  on public.learning_mastery
  for select using (auth.uid() = user_id);

drop policy if exists "learning_mastery_insert_own"
  on public.learning_mastery;

drop policy if exists "learning_mastery_update_own"
  on public.learning_mastery;

revoke insert, update, delete on public.learning_mastery
  from anon, authenticated;
grant select on public.learning_mastery to authenticated;

create or replace function public.upsert_learning_mastery(p_records jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  affected bigint := 0;
  changed_rows bigint;
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'p_records must be a JSON array' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_records)
  loop
    insert into public.learning_mastery (
      user_id, entity_kind, entity_id, submission_count, review_count,
      correct_count, first_try_correct_count, ability, recent_results,
      scheduler_version, fsrs_phase, stability_days, difficulty, due_at,
      last_review_at, reps, lapses, last_event_id, last_attempt_at, revision,
      projection_version, legacy_seed, updated_at
    )
    values (
      owner_id,
      item->>'entity_kind',
      item->>'entity_id',
      (item->>'submission_count')::integer,
      (item->>'review_count')::integer,
      (item->>'correct_count')::integer,
      (item->>'first_try_correct_count')::integer,
      (item->>'ability')::double precision,
      item->'recent_results',
      (item->>'scheduler_version')::smallint,
      item->>'fsrs_phase',
      (item->>'stability_days')::double precision,
      (item->>'difficulty')::double precision,
      (item->>'due_at')::timestamptz,
      (item->>'last_review_at')::timestamptz,
      (item->>'reps')::integer,
      (item->>'lapses')::integer,
      item->>'last_event_id',
      (item->>'last_attempt_at')::timestamptz,
      (item->>'revision')::bigint,
      (item->>'projection_version')::smallint,
      nullif(item->'legacy_seed', 'null'::jsonb),
      clock_timestamp()
    )
    on conflict (user_id, entity_kind, entity_id) do update
    set
      submission_count = excluded.submission_count,
      review_count = excluded.review_count,
      correct_count = excluded.correct_count,
      first_try_correct_count = excluded.first_try_correct_count,
      ability = excluded.ability,
      recent_results = excluded.recent_results,
      scheduler_version = excluded.scheduler_version,
      fsrs_phase = excluded.fsrs_phase,
      stability_days = excluded.stability_days,
      difficulty = excluded.difficulty,
      due_at = excluded.due_at,
      last_review_at = excluded.last_review_at,
      reps = excluded.reps,
      lapses = excluded.lapses,
      last_event_id = excluded.last_event_id,
      last_attempt_at = excluded.last_attempt_at,
      revision = excluded.revision,
      projection_version = excluded.projection_version,
      legacy_seed = excluded.legacy_seed,
      updated_at = excluded.updated_at
    where excluded.revision > learning_mastery.revision;

    get diagnostics changed_rows = row_count;
    if changed_rows = 0 and not exists (
      select 1
      from public.learning_mastery current_row
      where current_row.user_id = owner_id
        and current_row.entity_kind = item->>'entity_kind'
        and current_row.entity_id = item->>'entity_id'
        and current_row.revision = (item->>'revision')::bigint
        and current_row.last_event_id is not distinct from item->>'last_event_id'
    ) then
      raise exception 'stale learning mastery revision for %:%',
        item->>'entity_kind', item->>'entity_id'
        using errcode = '40001';
    end if;
    affected := affected + changed_rows;
  end loop;

  return affected;
end;
$$;

revoke all on function public.upsert_learning_mastery(jsonb) from public;
grant execute on function public.upsert_learning_mastery(jsonb) to authenticated;

-- =========================================================
-- problem_progress: durable academy mission completion evidence
-- =========================================================
create or replace function public.jsonb_object_key_count(p_value jsonb)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select count(*)::integer
  from pg_catalog.jsonb_object_keys(
    coalesce(p_value, '{}'::jsonb)
  ) as keys(key);
$$;

create or replace function public.text_array_union(
  p_left text[],
  p_right text[]
)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    pg_catalog.array_agg(merged_values.value order by merged_values.value),
    '{}'::text[]
  )
  from (
    select distinct value
    from pg_catalog.unnest(
      coalesce(p_left, '{}'::text[]) || coalesce(p_right, '{}'::text[])
    ) as items(value)
    where value is not null and pg_catalog.btrim(value) <> ''
  ) as merged_values;
$$;

create or replace function public.jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    pg_catalog.array_agg(merged_values.value order by merged_values.value),
    '{}'::text[]
  )
  from (
    select distinct value
    from pg_catalog.jsonb_array_elements_text(
      case
        when pg_catalog.jsonb_typeof(p_value) = 'array' then p_value
        else '[]'::jsonb
      end
    ) as items(value)
    where pg_catalog.btrim(value) <> ''
  ) as merged_values;
$$;

create or replace function public.merge_academy_quiz_attempts(
  p_left jsonb,
  p_right jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  attempt_id text;
  left_attempt jsonb;
  right_attempt jsonb;
  merged jsonb := '{}'::jsonb;
begin
  if pg_catalog.jsonb_typeof(coalesce(p_left, '{}'::jsonb)) <> 'object'
    or pg_catalog.jsonb_typeof(coalesce(p_right, '{}'::jsonb)) <> 'object' then
    raise exception 'academy quiz attempts must be JSON objects'
      using errcode = '22023';
  end if;

  for attempt_id in
    select ids.key
    from (
      select key
      from pg_catalog.jsonb_object_keys(
        coalesce(p_left, '{}'::jsonb)
      ) as left_keys(key)
      union
      select key
      from pg_catalog.jsonb_object_keys(
        coalesce(p_right, '{}'::jsonb)
      ) as right_keys(key)
    ) as ids
    order by ids.key
  loop
    left_attempt := p_left->attempt_id;
    right_attempt := p_right->attempt_id;

    if left_attempt is null then
      merged := merged || pg_catalog.jsonb_build_object(
        attempt_id,
        right_attempt
      );
    elsif right_attempt is null then
      merged := merged || pg_catalog.jsonb_build_object(
        attempt_id,
        left_attempt
      );
    else
      merged := merged || pg_catalog.jsonb_build_object(
        attempt_id,
        pg_catalog.jsonb_build_object(
          'evidenceVersion',
          greatest(
            (left_attempt->>'evidenceVersion')::integer,
            (right_attempt->>'evidenceVersion')::integer
          ),
          'attemptId',
          attempt_id,
          'attemptedAt',
          case
            when (left_attempt->>'attemptedAt')::timestamptz
              <= (right_attempt->>'attemptedAt')::timestamptz
              then left_attempt->>'attemptedAt'
            else right_attempt->>'attemptedAt'
          end,
          'score',
          greatest(
            (left_attempt->>'score')::double precision,
            (right_attempt->>'score')::double precision
          ),
          'openEndedTransferPassed',
          (left_attempt->>'openEndedTransferPassed')::boolean
            or (right_attempt->>'openEndedTransferPassed')::boolean,
          'learningEventIds',
          pg_catalog.to_jsonb(
            public.text_array_union(
              public.jsonb_text_array(left_attempt->'learningEventIds'),
              public.jsonb_text_array(right_attempt->'learningEventIds')
            )
          )
        )
      );
    end if;
  end loop;

  return merged;
end;
$$;

create or replace function public.academy_quiz_attempts_valid(p_value jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.jsonb_typeof(coalesce(p_value, '{}'::jsonb)) = 'object'
    and not exists (
      select 1
      from pg_catalog.jsonb_each(coalesce(p_value, '{}'::jsonb))
        as attempts(attempt_id, evidence)
      where pg_catalog.jsonb_typeof(evidence) <> 'object'
        or evidence->>'attemptId' <> attempt_id
        or cardinality(
          public.jsonb_text_array(evidence->'learningEventIds')
        ) = 0
    );
$$;

revoke all on function public.jsonb_object_key_count(jsonb) from public;
revoke all on function public.text_array_union(text[], text[]) from public;
revoke all on function public.jsonb_text_array(jsonb) from public;
revoke all on function public.merge_academy_quiz_attempts(jsonb, jsonb)
  from public;
revoke all on function public.academy_quiz_attempts_valid(jsonb) from public;

create table if not exists public.problem_progress (
  user_id uuid not null references auth.users on delete cascade,
  problem_id text not null check (
    char_length(problem_id) between 9 and 500
    and problem_id like 'problem:%'
  ),
  schema_version smallint not null default 1 check (schema_version = 1),
  evidence_version smallint not null default 1 check (evidence_version = 1),
  curriculum_id text not null check (char_length(curriculum_id) between 1 and 200),
  curriculum_version text not null check (
    curriculum_version ~ '^v[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  content_version text not null check (
    content_version ~ '^v[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  acquired_at timestamptz not null,
  practiced_at timestamptz not null,
  retained_at timestamptz,
  completed_at timestamptz,
  acquisition_passed boolean not null check (acquisition_passed),
  transfer_passed boolean not null check (transfer_passed),
  code_tests_passed boolean not null check (code_tests_passed),
  delayed_retrieval_passed boolean not null default false,
  acquisition_event_ids text[] not null default '{}',
  transfer_event_ids text[] not null default '{}',
  code_test_event_ids text[] not null default '{}',
  delayed_retrieval_event_ids text[] not null default '{}',
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, problem_id),
  constraint problem_progress_practice_time_order check (
    practiced_at >= acquired_at
  ),
  constraint problem_progress_nonempty_evidence check (
    cardinality(acquisition_event_ids) > 0
    and cardinality(transfer_event_ids) > 0
    and cardinality(code_test_event_ids) > 0
  ),
  constraint problem_progress_atomic_python_evidence check (
    transfer_event_ids && code_test_event_ids
  ),
  constraint problem_progress_retention_evidence check (
    (
      delayed_retrieval_passed
      and retained_at is not null
      and completed_at = retained_at
      and retained_at >= acquired_at + interval '24 hours'
      and cardinality(delayed_retrieval_event_ids) > 0
    )
    or (
      not delayed_retrieval_passed
      and retained_at is null
      and completed_at is null
      and cardinality(delayed_retrieval_event_ids) = 0
    )
  )
);

-- Upgrade pre-retention academy rows without inventing delayed evidence.
alter table public.problem_progress
  add column if not exists acquired_at timestamptz;
alter table public.problem_progress
  add column if not exists practiced_at timestamptz;
alter table public.problem_progress
  add column if not exists retained_at timestamptz;
alter table public.problem_progress
  add column if not exists delayed_retrieval_passed boolean not null default false;
alter table public.problem_progress
  add column if not exists delayed_retrieval_event_ids text[] not null default '{}';
alter table public.problem_progress
  alter column completed_at drop not null;
update public.problem_progress
set
  acquired_at = (
    select min(event.received_at)
    from public.learning_attempt_events event
    where event.user_id = problem_progress.user_id
      and event.id = any(problem_progress.acquisition_event_ids)
  ),
  practiced_at = (
    select max(event.received_at)
    from public.learning_attempt_events event
    where event.user_id = problem_progress.user_id
      and event.id = any(
        problem_progress.acquisition_event_ids
        || problem_progress.transfer_event_ids
        || problem_progress.code_test_event_ids
      )
  ),
  retained_at = case
    when delayed_retrieval_passed then (
      select max(event.received_at)
      from public.learning_attempt_events event
      where event.user_id = problem_progress.user_id
        and event.id = any(problem_progress.delayed_retrieval_event_ids)
    )
    else null
  end,
  completed_at = case
    when delayed_retrieval_passed then (
      select max(event.received_at)
      from public.learning_attempt_events event
      where event.user_id = problem_progress.user_id
        and event.id = any(problem_progress.delayed_retrieval_event_ids)
    )
    else null
  end;
delete from public.problem_progress
where acquired_at is null
   or practiced_at is null
   or cardinality(acquisition_event_ids) = 0
   or cardinality(transfer_event_ids) = 0
   or cardinality(code_test_event_ids) = 0
   or not (transfer_event_ids && code_test_event_ids)
   or (
     delayed_retrieval_passed
     and (
       retained_at is null
       or retained_at < acquired_at + interval '24 hours'
     )
   );
alter table public.problem_progress
  alter column acquired_at set not null;
alter table public.problem_progress
  alter column practiced_at set not null;
alter table public.problem_progress
  alter column completed_at drop not null;
alter table public.problem_progress
  drop constraint if exists problem_progress_practice_time_order;
alter table public.problem_progress
  add constraint problem_progress_practice_time_order check (
    practiced_at >= acquired_at
  );
alter table public.problem_progress
  drop constraint if exists problem_progress_nonempty_evidence;
alter table public.problem_progress
  add constraint problem_progress_nonempty_evidence check (
    cardinality(acquisition_event_ids) > 0
    and cardinality(transfer_event_ids) > 0
    and cardinality(code_test_event_ids) > 0
  );
alter table public.problem_progress
  drop constraint if exists problem_progress_atomic_python_evidence;
alter table public.problem_progress
  add constraint problem_progress_atomic_python_evidence check (
    transfer_event_ids && code_test_event_ids
  );
alter table public.problem_progress
  drop constraint if exists problem_progress_retention_evidence;
alter table public.problem_progress
  add constraint problem_progress_retention_evidence check (
    (
      delayed_retrieval_passed
      and retained_at is not null
      and completed_at = retained_at
      and retained_at >= acquired_at + interval '24 hours'
      and cardinality(delayed_retrieval_event_ids) > 0
    )
    or (
      not delayed_retrieval_passed
      and retained_at is null
      and completed_at is null
      and cardinality(delayed_retrieval_event_ids) = 0
    )
  );

create index if not exists problem_progress_owner_completed_idx
  on public.problem_progress (user_id, completed_at, problem_id);

alter table public.problem_progress enable row level security;

drop policy if exists "problem_progress_select_own" on public.problem_progress;
create policy "problem_progress_select_own"
  on public.problem_progress
  for select using (auth.uid() = user_id);

drop policy if exists "problem_progress_insert_own" on public.problem_progress;

drop policy if exists "problem_progress_update_own" on public.problem_progress;

drop policy if exists "problem_progress_delete_own" on public.problem_progress;
revoke insert, update, delete on public.problem_progress
  from anon, authenticated;
grant select on public.problem_progress to authenticated;

-- =========================================================
-- realm_progress: quiz attempts and boss defeat evidence
-- =========================================================
create table if not exists public.realm_progress (
  user_id uuid not null references auth.users on delete cascade,
  realm_id text not null check (realm_id ~ '^realm[1-6]$'),
  schema_version smallint not null default 1 check (schema_version = 1),
  evidence_version smallint not null default 1 check (evidence_version = 1),
  curriculum_id text not null check (char_length(curriculum_id) between 1 and 200),
  curriculum_version text not null check (
    curriculum_version ~ '^v[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  content_version text not null check (
    content_version ~ '^v[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  quiz_best_score double precision not null default 0 check (
    quiz_best_score >= 0 and quiz_best_score <= 100
  ),
  quiz_attempt_count integer not null default 0 check (quiz_attempt_count >= 0),
  quiz_open_ended_transfer_passed boolean not null default false,
  quiz_first_attempted_at timestamptz,
  quiz_last_attempted_at timestamptz,
  quiz_attempts jsonb not null default '{}'::jsonb check (
    jsonb_typeof(quiz_attempts) = 'object'
  ),
  boss_defeated boolean not null default false,
  boss_defeated_at timestamptz,
  boss_defeat_ids text[] not null default '{}',
  boss_learning_event_ids text[] not null default '{}',
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, realm_id),
  constraint realm_progress_quiz_attempt_count check (
    quiz_attempt_count >= public.jsonb_object_key_count(quiz_attempts)
  ),
  constraint realm_progress_quiz_evidence check (
    public.academy_quiz_attempts_valid(quiz_attempts)
  ),
  constraint realm_progress_quiz_time_order check (
    quiz_first_attempted_at is null
    or quiz_last_attempted_at is null
    or quiz_first_attempted_at <= quiz_last_attempted_at
  ),
  constraint realm_progress_boss_evidence check (
    (
      boss_defeated
      and boss_defeated_at is not null
      and cardinality(boss_defeat_ids) > 0
      and cardinality(boss_learning_event_ids) > 0
    )
    or (
      not boss_defeated
      and boss_defeated_at is null
      and cardinality(boss_defeat_ids) = 0
      and cardinality(boss_learning_event_ids) = 0
    )
  )
);

-- Remove unverifiable legacy latches instead of inventing event links.
update public.realm_progress
set
  boss_defeated = false,
  boss_defeated_at = null,
  boss_defeat_ids = '{}',
  boss_learning_event_ids = '{}'
where boss_defeated
  and (
    cardinality(boss_defeat_ids) = 0
    or cardinality(boss_learning_event_ids) = 0
  );
delete from public.realm_progress
where not public.academy_quiz_attempts_valid(quiz_attempts);
alter table public.realm_progress
  drop constraint if exists realm_progress_quiz_evidence;
alter table public.realm_progress
  add constraint realm_progress_quiz_evidence check (
    public.academy_quiz_attempts_valid(quiz_attempts)
  );
alter table public.realm_progress
  drop constraint if exists realm_progress_boss_evidence;
alter table public.realm_progress
  add constraint realm_progress_boss_evidence check (
    (
      boss_defeated
      and boss_defeated_at is not null
      and cardinality(boss_defeat_ids) > 0
      and cardinality(boss_learning_event_ids) > 0
    )
    or (
      not boss_defeated
      and boss_defeated_at is null
      and cardinality(boss_defeat_ids) = 0
      and cardinality(boss_learning_event_ids) = 0
    )
  );

create index if not exists realm_progress_owner_updated_idx
  on public.realm_progress (user_id, updated_at, realm_id);

create index if not exists realm_progress_owner_boss_idx
  on public.realm_progress (user_id, boss_defeated, realm_id);

alter table public.realm_progress enable row level security;

drop policy if exists "realm_progress_select_own" on public.realm_progress;
create policy "realm_progress_select_own"
  on public.realm_progress
  for select using (auth.uid() = user_id);

drop policy if exists "realm_progress_insert_own" on public.realm_progress;

drop policy if exists "realm_progress_update_own" on public.realm_progress;

drop policy if exists "realm_progress_delete_own" on public.realm_progress;
revoke insert, update, delete on public.realm_progress
  from anon, authenticated;
grant select on public.realm_progress to authenticated;

create or replace function public.merge_academy_mission_progress(p_record jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  acquisition_ids text[];
  transfer_ids text[];
  code_ids text[];
  delayed_ids text[];
  acquired_at timestamptz;
  practiced_at timestamptz;
  retained_at timestamptz;
  delayed_passed boolean;
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_record) <> 'object' then
    raise exception 'p_record must be a JSON object' using errcode = '22023';
  end if;

  acquisition_ids := public.jsonb_text_array(
    p_record->'acquisition_event_ids'
  );
  transfer_ids := public.jsonb_text_array(p_record->'transfer_event_ids');
  code_ids := public.jsonb_text_array(p_record->'code_test_event_ids');
  delayed_ids := public.jsonb_text_array(
    p_record->'delayed_retrieval_event_ids'
  );
  acquired_at := null;
  practiced_at := null;
  retained_at := null;
  delayed_passed := (p_record->>'delayed_retrieval_passed')::boolean;

  if cardinality(acquisition_ids) = 0
    or cardinality(transfer_ids) = 0
    or cardinality(code_ids) = 0
    or not (transfer_ids && code_ids) then
    raise exception 'mission practice requires nonempty atomic event evidence'
      using errcode = '23514';
  end if;
  -- Retried-but-passing answers count (authored failure policies grant
  -- multiple attempts); only revealed answers are disqualified. Must match
  -- isPassingLinkedEvent in src/context/ProgressContext.tsx.
  if (
    select count(*) <> cardinality(acquisition_ids)
    from public.learning_attempt_events event
    where event.user_id = owner_id
      and event.id = any(acquisition_ids)
      and event.problem_id = p_record->>'problem_id'
      and event.resolved
      and event.is_correct
      and not event.revealed
      and event.metadata->'evidenceKinds' ? 'acquisition'
  ) then
    raise exception 'invalid linked acquisition event evidence'
      using errcode = '23514';
  end if;
  select min(event.received_at)
  into acquired_at
  from public.learning_attempt_events event
  where event.user_id = owner_id and event.id = any(acquisition_ids);

  if (
    select count(*) <> cardinality(transfer_ids)
    from public.learning_attempt_events event
    where event.user_id = owner_id
      and event.id = any(transfer_ids)
      and event.problem_id = p_record->>'problem_id'
      and event.resolved
      and event.is_correct
      and not event.revealed
      and event.metadata->'evidenceKinds' ? 'independent-transfer'
  ) or (
    select count(*) <> cardinality(code_ids)
    from public.learning_attempt_events event
    where event.user_id = owner_id
      and event.id = any(code_ids)
      and event.problem_id = p_record->>'problem_id'
      and event.resolved
      and event.is_correct
      and not event.revealed
      and event.metadata->'evidenceKinds' ? 'code-tests'
  ) or not exists (
    select 1
    from public.learning_attempt_events event
    where event.user_id = owner_id
      and event.id = any(transfer_ids)
      and event.id = any(code_ids)
      and event.problem_id = p_record->>'problem_id'
      and event.resolved
      and event.is_correct
      and not event.revealed
      and event.metadata->>'assessmentKind' = 'pythonCode'
      and event.metadata->'evidenceKinds' ? 'independent-transfer'
      and event.metadata->'evidenceKinds' ? 'code-tests'
  ) then
    raise exception 'invalid linked Python transfer/code event evidence'
      using errcode = '23514';
  end if;
  select max(event.received_at)
  into practiced_at
  from public.learning_attempt_events event
  where event.user_id = owner_id
    and event.id = any(acquisition_ids || transfer_ids || code_ids);
  if delayed_passed then
    if cardinality(delayed_ids) = 0 or (
        select count(*) <> cardinality(delayed_ids)
        from public.learning_attempt_events event
        where event.user_id = owner_id
          and event.id = any(delayed_ids)
          and event.problem_id = p_record->>'problem_id'
          and event.resolved
          and event.is_correct
          and not event.revealed
          and event.metadata->>'academyMode' = 'retention'
          and event.metadata->'evidenceKinds' ? 'delayed-retrieval'
      ) then
      raise exception 'invalid linked delayed-retrieval event evidence'
        using errcode = '23514';
    end if;
    select max(event.received_at)
    into retained_at
    from public.learning_attempt_events event
    where event.user_id = owner_id and event.id = any(delayed_ids);
    if retained_at < acquired_at + interval '24 hours' then
      raise exception 'delayed retrieval is not yet server-authorized'
        using errcode = '23514';
    end if;
  elsif cardinality(delayed_ids) <> 0
    or p_record->>'retained_at' is not null then
    raise exception 'unretained mission cannot include delayed evidence'
      using errcode = '23514';
  end if;

  insert into public.problem_progress (
    user_id,
    problem_id,
    schema_version,
    evidence_version,
    curriculum_id,
    curriculum_version,
    content_version,
    acquired_at,
    practiced_at,
    retained_at,
    completed_at,
    acquisition_passed,
    transfer_passed,
    code_tests_passed,
    delayed_retrieval_passed,
    acquisition_event_ids,
    transfer_event_ids,
    code_test_event_ids,
    delayed_retrieval_event_ids,
    updated_at
  )
  values (
    owner_id,
    p_record->>'problem_id',
    (p_record->>'schema_version')::smallint,
    (p_record->>'evidence_version')::smallint,
    p_record->>'curriculum_id',
    p_record->>'curriculum_version',
    p_record->>'content_version',
    acquired_at,
    practiced_at,
    retained_at,
    retained_at,
    (p_record->>'acquisition_passed')::boolean,
    (p_record->>'transfer_passed')::boolean,
    (p_record->>'code_tests_passed')::boolean,
    delayed_passed,
    acquisition_ids,
    transfer_ids,
    code_ids,
    delayed_ids,
    pg_catalog.clock_timestamp()
  )
  on conflict (user_id, problem_id) do update
  set
    schema_version = greatest(
      problem_progress.schema_version,
      excluded.schema_version
    ),
    evidence_version = greatest(
      problem_progress.evidence_version,
      excluded.evidence_version
    ),
    curriculum_id = greatest(
      problem_progress.curriculum_id,
      excluded.curriculum_id
    ),
    curriculum_version = greatest(
      problem_progress.curriculum_version,
      excluded.curriculum_version
    ),
    content_version = greatest(
      problem_progress.content_version,
      excluded.content_version
    ),
    acquired_at = least(
      problem_progress.acquired_at,
      excluded.acquired_at
    ),
    practiced_at = least(
      problem_progress.practiced_at,
      excluded.practiced_at
    ),
    retained_at = least(
      problem_progress.retained_at,
      excluded.retained_at
    ),
    completed_at = least(
      problem_progress.completed_at,
      excluded.completed_at
    ),
    acquisition_passed = true,
    transfer_passed = true,
    code_tests_passed = true,
    delayed_retrieval_passed =
      problem_progress.delayed_retrieval_passed
      or excluded.delayed_retrieval_passed,
    acquisition_event_ids = public.text_array_union(
      problem_progress.acquisition_event_ids,
      excluded.acquisition_event_ids
    ),
    transfer_event_ids = public.text_array_union(
      problem_progress.transfer_event_ids,
      excluded.transfer_event_ids
    ),
    code_test_event_ids = public.text_array_union(
      problem_progress.code_test_event_ids,
      excluded.code_test_event_ids
    ),
    delayed_retrieval_event_ids = public.text_array_union(
      problem_progress.delayed_retrieval_event_ids,
      excluded.delayed_retrieval_event_ids
    ),
    updated_at = pg_catalog.clock_timestamp();
end;
$$;

create or replace function public.merge_academy_realm_progress(p_record jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  attempt_record record;
  attempt_event_ids text[];
  boss_defeat_ids text[];
  boss_event_ids text[];
  boss_defeated boolean;
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_record) <> 'object' then
    raise exception 'p_record must be a JSON object' using errcode = '22023';
  end if;
  if not public.academy_quiz_attempts_valid(p_record->'quiz_attempts') then
    raise exception 'realm quiz attempts require nonempty event evidence'
      using errcode = '23514';
  end if;
  for attempt_record in
    select key as attempt_id, value as evidence
    from pg_catalog.jsonb_each(p_record->'quiz_attempts')
  loop
    attempt_event_ids := public.jsonb_text_array(
      attempt_record.evidence->'learningEventIds'
    );
    if (
      select count(*) <> cardinality(attempt_event_ids)
      from public.learning_attempt_events event
      where event.user_id = owner_id
        and event.id = any(attempt_event_ids)
        and event.resolved
        and event.is_correct
        and (
          event.metadata->>'assessmentKind' <> 'shortAnswer'
          or (
            event.first_try_correct
            and not event.used_hint
            and not event.revealed
          )
        )
    ) then
      raise exception 'realm quiz attempt % has unlinked event evidence',
        attempt_record.attempt_id
        using errcode = '23514';
    end if;
  end loop;

  boss_defeated := (p_record->>'boss_defeated')::boolean;
  boss_defeat_ids := public.jsonb_text_array(p_record->'boss_defeat_ids');
  boss_event_ids := public.jsonb_text_array(
    p_record->'boss_learning_event_ids'
  );
  if boss_defeated then
    if cardinality(boss_defeat_ids) = 0
      or cardinality(boss_event_ids) = 0
      or (
        select count(*) <> cardinality(boss_event_ids)
        from public.learning_attempt_events event
        where event.user_id = owner_id
          and event.id = any(boss_event_ids)
          and event.resolved
          and event.is_correct
          and event.metadata->>'academyMode' = 'realm-boss'
          and event.metadata->>'realmId' = p_record->>'realm_id'
      ) then
      raise exception 'realm boss defeat requires linked combat evidence'
        using errcode = '23514';
    end if;
  elsif cardinality(boss_defeat_ids) <> 0
    or cardinality(boss_event_ids) <> 0 then
    raise exception 'undefeated realm cannot include boss evidence'
      using errcode = '23514';
  end if;

  insert into public.realm_progress (
    user_id,
    realm_id,
    schema_version,
    evidence_version,
    curriculum_id,
    curriculum_version,
    content_version,
    quiz_best_score,
    quiz_attempt_count,
    quiz_open_ended_transfer_passed,
    quiz_first_attempted_at,
    quiz_last_attempted_at,
    quiz_attempts,
    boss_defeated,
    boss_defeated_at,
    boss_defeat_ids,
    boss_learning_event_ids,
    updated_at
  )
  values (
    owner_id,
    p_record->>'realm_id',
    (p_record->>'schema_version')::smallint,
    (p_record->>'evidence_version')::smallint,
    p_record->>'curriculum_id',
    p_record->>'curriculum_version',
    p_record->>'content_version',
    (p_record->>'quiz_best_score')::double precision,
    (p_record->>'quiz_attempt_count')::integer,
    (p_record->>'quiz_open_ended_transfer_passed')::boolean,
    (p_record->>'quiz_first_attempted_at')::timestamptz,
    (p_record->>'quiz_last_attempted_at')::timestamptz,
    p_record->'quiz_attempts',
    (p_record->>'boss_defeated')::boolean,
    (p_record->>'boss_defeated_at')::timestamptz,
    boss_defeat_ids,
    boss_event_ids,
    pg_catalog.clock_timestamp()
  )
  on conflict (user_id, realm_id) do update
  set
    schema_version = greatest(
      realm_progress.schema_version,
      excluded.schema_version
    ),
    evidence_version = greatest(
      realm_progress.evidence_version,
      excluded.evidence_version
    ),
    curriculum_id = greatest(
      realm_progress.curriculum_id,
      excluded.curriculum_id
    ),
    curriculum_version = greatest(
      realm_progress.curriculum_version,
      excluded.curriculum_version
    ),
    content_version = greatest(
      realm_progress.content_version,
      excluded.content_version
    ),
    quiz_best_score = greatest(
      realm_progress.quiz_best_score,
      excluded.quiz_best_score
    ),
    quiz_attempt_count =
      public.jsonb_object_key_count(
        public.merge_academy_quiz_attempts(
          realm_progress.quiz_attempts,
          excluded.quiz_attempts
        )
      )
      + greatest(
        realm_progress.quiz_attempt_count
          - public.jsonb_object_key_count(realm_progress.quiz_attempts),
        excluded.quiz_attempt_count
          - public.jsonb_object_key_count(excluded.quiz_attempts)
      ),
    quiz_open_ended_transfer_passed =
      realm_progress.quiz_open_ended_transfer_passed
      or excluded.quiz_open_ended_transfer_passed,
    quiz_first_attempted_at = least(
      realm_progress.quiz_first_attempted_at,
      excluded.quiz_first_attempted_at
    ),
    quiz_last_attempted_at = greatest(
      realm_progress.quiz_last_attempted_at,
      excluded.quiz_last_attempted_at
    ),
    quiz_attempts = public.merge_academy_quiz_attempts(
      realm_progress.quiz_attempts,
      excluded.quiz_attempts
    ),
    boss_defeated =
      realm_progress.boss_defeated or excluded.boss_defeated,
    boss_defeated_at = least(
      realm_progress.boss_defeated_at,
      excluded.boss_defeated_at
    ),
    boss_defeat_ids = public.text_array_union(
      realm_progress.boss_defeat_ids,
      excluded.boss_defeat_ids
    ),
    boss_learning_event_ids = public.text_array_union(
      realm_progress.boss_learning_event_ids,
      excluded.boss_learning_event_ids
    ),
    updated_at = pg_catalog.clock_timestamp();
end;
$$;

create or replace function public.merge_academy_progress(
  p_problem_records jsonb,
  p_realm_records jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  affected bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_problem_records) <> 'array'
    or pg_catalog.jsonb_typeof(p_realm_records) <> 'array' then
    raise exception 'academy record parameters must be JSON arrays'
      using errcode = '22023';
  end if;

  for item in
    select value
    from pg_catalog.jsonb_array_elements(p_problem_records)
  loop
    perform public.merge_academy_mission_progress(item);
    affected := affected + 1;
  end loop;

  for item in
    select value
    from pg_catalog.jsonb_array_elements(p_realm_records)
  loop
    perform public.merge_academy_realm_progress(item);
    affected := affected + 1;
  end loop;

  return affected;
end;
$$;

revoke all on function public.merge_academy_mission_progress(jsonb)
  from public;
revoke all on function public.merge_academy_realm_progress(jsonb)
  from public;
revoke all on function public.merge_academy_progress(jsonb, jsonb)
  from public;
grant execute on function public.merge_academy_mission_progress(jsonb)
  to authenticated;
grant execute on function public.merge_academy_realm_progress(jsonb)
  to authenticated;
grant execute on function public.merge_academy_progress(jsonb, jsonb)
  to authenticated;

-- =========================================================
-- gauntlet_progress: signed-in certification/final-boss state
-- =========================================================
create or replace function public.merge_gauntlet_concepts(
  p_left jsonb,
  p_right jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  concept_id text;
  left_value jsonb;
  right_value jsonb;
  merged jsonb := '{}'::jsonb;
begin
  if pg_catalog.jsonb_typeof(coalesce(p_left, '{}'::jsonb)) <> 'object'
    or pg_catalog.jsonb_typeof(coalesce(p_right, '{}'::jsonb)) <> 'object' then
    raise exception 'gauntlet concepts must be JSON objects'
      using errcode = '22023';
  end if;
  for concept_id in
    select key
    from (
      select key from pg_catalog.jsonb_object_keys(
        coalesce(p_left, '{}'::jsonb)
      ) as left_keys(key)
      union
      select key from pg_catalog.jsonb_object_keys(
        coalesce(p_right, '{}'::jsonb)
      ) as right_keys(key)
    ) ids
    order by key
  loop
    left_value := p_left->concept_id;
    right_value := p_right->concept_id;
    merged := merged || pg_catalog.jsonb_build_object(
      concept_id,
      case
        when left_value is null then right_value
        when right_value is null then left_value
        when coalesce((right_value->>'lastSeenAt')::bigint, 0)
          > coalesce((left_value->>'lastSeenAt')::bigint, 0)
          then right_value
        when coalesce((right_value->>'lastSeenAt')::bigint, 0)
          < coalesce((left_value->>'lastSeenAt')::bigint, 0)
          then left_value
        when right_value::text > left_value::text then right_value
        else left_value
      end
    );
  end loop;
  return merged;
end;
$$;

revoke all on function public.merge_gauntlet_concepts(jsonb, jsonb)
  from public;

create table if not exists public.gauntlet_progress (
  user_id uuid primary key references auth.users on delete cascade,
  version smallint not null default 4 check (version = 4),
  revision bigint not null default 0 check (revision >= 0),
  best_score integer not null default 0 check (
    best_score between 0 and 100
  ),
  attempts integer not null default 0 check (attempts >= 0),
  exam_passed boolean not null default false,
  exam_passed_at timestamptz,
  certification_requirements_passed boolean not null default false,
  final_boss_beaten boolean not null default false,
  final_boss_beaten_at timestamptz,
  concepts jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(concepts) = 'object'
  ),
  legacy_attempt_count integer not null default 0 check (
    legacy_attempt_count >= 0
  ),
  legacy_best_score integer not null default 0 check (
    legacy_best_score between 0 and 100
  ),
  legacy_exam_passed boolean not null default false,
  legacy_exam_passed_at timestamptz,
  legacy_final_boss_beaten boolean not null default false,
  legacy_final_boss_beaten_at timestamptz,
  legacy_concepts jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(legacy_concepts) = 'object'
  ),
  certification_attempts jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(certification_attempts) = 'object'
  ),
  concept_outcomes jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(concept_outcomes) = 'object'
  ),
  final_boss_defeats jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(final_boss_defeats) = 'object'
  ),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint gauntlet_exam_evidence check (
    exam_passed = (
      certification_requirements_passed and exam_passed_at is not null
    )
  ),
  constraint gauntlet_boss_evidence check (
    final_boss_beaten = (final_boss_beaten_at is not null)
  ),
  constraint gauntlet_attempt_count check (
    attempts =
      legacy_attempt_count
      + public.jsonb_object_key_count(certification_attempts)
  )
);

alter table public.gauntlet_progress
  add column if not exists legacy_attempt_count integer not null default 0;
alter table public.gauntlet_progress
  add column if not exists legacy_best_score integer not null default 0;
alter table public.gauntlet_progress
  add column if not exists legacy_exam_passed boolean not null default false;
alter table public.gauntlet_progress
  add column if not exists legacy_exam_passed_at timestamptz;
alter table public.gauntlet_progress
  add column if not exists legacy_final_boss_beaten boolean not null default false;
alter table public.gauntlet_progress
  add column if not exists legacy_final_boss_beaten_at timestamptz;
alter table public.gauntlet_progress
  add column if not exists legacy_concepts jsonb not null default '{}'::jsonb;
alter table public.gauntlet_progress
  add column if not exists certification_attempts jsonb not null default '{}'::jsonb;
alter table public.gauntlet_progress
  add column if not exists concept_outcomes jsonb not null default '{}'::jsonb;
alter table public.gauntlet_progress
  add column if not exists final_boss_defeats jsonb not null default '{}'::jsonb;
alter table public.gauntlet_progress
  drop constraint if exists gauntlet_progress_version_check;
update public.gauntlet_progress
set
  legacy_attempt_count = greatest(legacy_attempt_count, attempts),
  legacy_best_score = greatest(legacy_best_score, best_score),
  legacy_exam_passed = legacy_exam_passed or exam_passed,
  legacy_exam_passed_at = least(legacy_exam_passed_at, exam_passed_at),
  legacy_final_boss_beaten =
    legacy_final_boss_beaten or final_boss_beaten,
  legacy_final_boss_beaten_at = least(
    legacy_final_boss_beaten_at,
    final_boss_beaten_at
  ),
  legacy_concepts = case
    when version < 4 then concepts
    else legacy_concepts
  end,
  version = 4
where version < 4;
alter table public.gauntlet_progress
  drop constraint if exists gauntlet_progress_version_check;
alter table public.gauntlet_progress
  alter column version set default 4;
alter table public.gauntlet_progress
  add constraint gauntlet_progress_version_check check (version = 4);
alter table public.gauntlet_progress
  drop constraint if exists gauntlet_progress_event_maps;
alter table public.gauntlet_progress
  add constraint gauntlet_progress_event_maps check (
    pg_catalog.jsonb_typeof(certification_attempts) = 'object'
    and pg_catalog.jsonb_typeof(concept_outcomes) = 'object'
    and pg_catalog.jsonb_typeof(final_boss_defeats) = 'object'
    and pg_catalog.jsonb_typeof(legacy_concepts) = 'object'
  );
alter table public.gauntlet_progress
  drop constraint if exists gauntlet_attempt_count;
alter table public.gauntlet_progress
  add constraint gauntlet_attempt_count check (
    attempts =
      legacy_attempt_count
      + public.jsonb_object_key_count(certification_attempts)
  );

alter table public.gauntlet_progress enable row level security;
drop policy if exists "gauntlet_progress_select_own"
  on public.gauntlet_progress;
create policy "gauntlet_progress_select_own"
  on public.gauntlet_progress
  for select using (auth.uid() = user_id);
drop policy if exists "gauntlet_progress_insert_own"
  on public.gauntlet_progress;
drop policy if exists "gauntlet_progress_update_own"
  on public.gauntlet_progress;
drop policy if exists "gauntlet_progress_delete_own"
  on public.gauntlet_progress;
revoke insert, update, delete on public.gauntlet_progress
  from anon, authenticated;
grant select on public.gauntlet_progress to authenticated;

create or replace function public.merge_gauntlet_progress(p_record jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_record) <> 'object' then
    raise exception 'p_record must be a JSON object' using errcode = '22023';
  end if;

  insert into public.gauntlet_progress (
    user_id,
    version,
    revision,
    best_score,
    attempts,
    exam_passed,
    exam_passed_at,
    certification_requirements_passed,
    final_boss_beaten,
    final_boss_beaten_at,
    concepts,
    legacy_attempt_count,
    legacy_best_score,
    legacy_exam_passed,
    legacy_exam_passed_at,
    legacy_final_boss_beaten,
    legacy_final_boss_beaten_at,
    legacy_concepts,
    certification_attempts,
    concept_outcomes,
    final_boss_defeats,
    updated_at
  )
  values (
    owner_id,
    (p_record->>'version')::smallint,
    (p_record->>'revision')::bigint,
    (p_record->>'best_score')::integer,
    (p_record->>'attempts')::integer,
    (p_record->>'exam_passed')::boolean,
    (p_record->>'exam_passed_at')::timestamptz,
    (p_record->>'certification_requirements_passed')::boolean,
    (p_record->>'final_boss_beaten')::boolean,
    (p_record->>'final_boss_beaten_at')::timestamptz,
    p_record->'concepts',
    (p_record->>'legacy_attempt_count')::integer,
    (p_record->>'legacy_best_score')::integer,
    (p_record->>'legacy_exam_passed')::boolean,
    (p_record->>'legacy_exam_passed_at')::timestamptz,
    (p_record->>'legacy_final_boss_beaten')::boolean,
    (p_record->>'legacy_final_boss_beaten_at')::timestamptz,
    p_record->'legacy_concepts',
    p_record->'certification_attempts',
    p_record->'concept_outcomes',
    p_record->'final_boss_defeats',
    pg_catalog.clock_timestamp()
  )
  on conflict (user_id) do update
  set
    version = greatest(gauntlet_progress.version, excluded.version),
    revision = greatest(gauntlet_progress.revision, excluded.revision),
    best_score = greatest(
      gauntlet_progress.best_score,
      excluded.best_score
    ),
    attempts =
      greatest(
        gauntlet_progress.legacy_attempt_count,
        excluded.legacy_attempt_count
      )
      + public.jsonb_object_key_count(
        public.merge_gauntlet_concepts(
          gauntlet_progress.certification_attempts,
          excluded.certification_attempts
        )
      ),
    exam_passed =
      gauntlet_progress.exam_passed or excluded.exam_passed,
    exam_passed_at = least(
      gauntlet_progress.exam_passed_at,
      excluded.exam_passed_at
    ),
    certification_requirements_passed =
      gauntlet_progress.certification_requirements_passed
      or excluded.certification_requirements_passed,
    final_boss_beaten =
      gauntlet_progress.final_boss_beaten
      or excluded.final_boss_beaten,
    final_boss_beaten_at = least(
      gauntlet_progress.final_boss_beaten_at,
      excluded.final_boss_beaten_at
    ),
    concepts = public.merge_gauntlet_concepts(
      gauntlet_progress.concepts,
      excluded.concepts
    ),
    legacy_attempt_count = greatest(
      gauntlet_progress.legacy_attempt_count,
      excluded.legacy_attempt_count
    ),
    legacy_best_score = greatest(
      gauntlet_progress.legacy_best_score,
      excluded.legacy_best_score
    ),
    legacy_exam_passed =
      gauntlet_progress.legacy_exam_passed
      or excluded.legacy_exam_passed,
    legacy_exam_passed_at = least(
      gauntlet_progress.legacy_exam_passed_at,
      excluded.legacy_exam_passed_at
    ),
    legacy_final_boss_beaten =
      gauntlet_progress.legacy_final_boss_beaten
      or excluded.legacy_final_boss_beaten,
    legacy_final_boss_beaten_at = least(
      gauntlet_progress.legacy_final_boss_beaten_at,
      excluded.legacy_final_boss_beaten_at
    ),
    legacy_concepts = public.merge_gauntlet_concepts(
      gauntlet_progress.legacy_concepts,
      excluded.legacy_concepts
    ),
    certification_attempts = public.merge_gauntlet_concepts(
      gauntlet_progress.certification_attempts,
      excluded.certification_attempts
    ),
    concept_outcomes = public.merge_gauntlet_concepts(
      gauntlet_progress.concept_outcomes,
      excluded.concept_outcomes
    ),
    final_boss_defeats = public.merge_gauntlet_concepts(
      gauntlet_progress.final_boss_defeats,
      excluded.final_boss_defeats
    ),
    updated_at = pg_catalog.clock_timestamp();
end;
$$;

revoke all on function public.merge_gauntlet_progress(jsonb) from public;
grant execute on function public.merge_gauntlet_progress(jsonb)
  to authenticated;

-- =========================================================
-- demo_guarantee_simulations: DEMO ONLY fictional evidence
-- This must never be repurposed for real refunds or transactional use.
-- =========================================================
create table if not exists public.demo_guarantee_simulations (
  user_id uuid not null references auth.users on delete cascade,
  simulation_run_id text not null check (
    char_length(simulation_run_id) between 1 and 200
  ),
  schema_version smallint not null default 1 check (schema_version = 1),
  is_simulation boolean not null default true check (is_simulation = true),
  policy_version text not null check (policy_version = 'demo-guarantee-v1'),
  scenario text not null check (
    scenario in (
      'eligible-path',
      'delayed-review-not-met',
      'remediation-not-complete',
      'outside-window'
    )
  ),
  window_starts_at timestamptz not null,
  window_ends_at timestamptz not null,
  window_evaluated_at timestamptz not null,
  window_duration_days integer not null check (
    window_duration_days between 1 and 3650
  ),
  completed_missions integer not null check (completed_missions >= 0),
  required_missions integer not null default 150 check (
    required_missions = 150
  ),
  missions_complete boolean not null,
  delayed_review_adherence_met boolean not null,
  remediation_complete boolean not null,
  certification_achieved boolean not null,
  certification_not_achieved boolean not null,
  within_policy_window boolean not null,
  eligible boolean not null,
  status text not null check (status in ('pending', 'approved', 'denied')),
  reason_code text not null check (
    reason_code in (
      'awaiting-simulated-decision',
      'eligible-under-demo-policy',
      'mission-requirement-not-met',
      'delayed-review-requirement-not-met',
      'remediation-requirement-not-met',
      'certification-already-achieved',
      'outside-simulated-policy-window'
    )
  ),
  revision bigint not null check (revision > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  decided_at timestamptz,
  primary key (user_id, simulation_run_id),
  constraint demo_guarantee_window_shape check (
    window_ends_at =
      window_starts_at + make_interval(days => window_duration_days)
  ),
  constraint demo_guarantee_mission_snapshot check (
    missions_complete = (completed_missions >= required_missions)
  ),
  constraint demo_guarantee_certification_snapshot check (
    certification_not_achieved = not certification_achieved
  ),
  constraint demo_guarantee_window_snapshot check (
    within_policy_window = (
      window_evaluated_at >= window_starts_at
      and window_evaluated_at <= window_ends_at
    )
  ),
  constraint demo_guarantee_eligibility_snapshot check (
    eligible = (
      missions_complete
      and delayed_review_adherence_met
      and remediation_complete
      and certification_not_achieved
      and within_policy_window
    )
  ),
  constraint demo_guarantee_status_shape check (
    (
      status = 'pending'
      and reason_code = 'awaiting-simulated-decision'
      and decided_at is null
    )
    or (
      status = 'approved'
      and eligible
      and reason_code = 'eligible-under-demo-policy'
      and decided_at is not null
    )
    or (
      status = 'denied'
      and not eligible
      and reason_code = case
        when not missions_complete then 'mission-requirement-not-met'
        when not delayed_review_adherence_met
          then 'delayed-review-requirement-not-met'
        when not remediation_complete
          then 'remediation-requirement-not-met'
        when not certification_not_achieved
          then 'certification-already-achieved'
        else 'outside-simulated-policy-window'
      end
      and decided_at is not null
    )
  ),
  constraint demo_guarantee_timestamp_order check (
    created_at <= updated_at
    and (
      decided_at is null
      or (decided_at >= created_at and decided_at <= updated_at)
    )
  )
);

comment on table public.demo_guarantee_simulations is
  'DEMO ONLY fictional workflow evidence. Never repurpose for real refunds or transactions.';
comment on column public.demo_guarantee_simulations.is_simulation is
  'Permanent true marker required for every fictional simulation row.';

create index if not exists demo_guarantee_owner_created_idx
  on public.demo_guarantee_simulations (
    user_id,
    created_at desc,
    simulation_run_id
  );

alter table public.demo_guarantee_simulations enable row level security;

drop policy if exists "demo_guarantee_select_own"
  on public.demo_guarantee_simulations;
create policy "demo_guarantee_select_own"
  on public.demo_guarantee_simulations
  for select using (auth.uid() = user_id);

drop policy if exists "demo_guarantee_insert_own"
  on public.demo_guarantee_simulations;
create policy "demo_guarantee_insert_own"
  on public.demo_guarantee_simulations
  for insert with check (auth.uid() = user_id and is_simulation = true);

drop policy if exists "demo_guarantee_update_own"
  on public.demo_guarantee_simulations;
create policy "demo_guarantee_update_own"
  on public.demo_guarantee_simulations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and is_simulation = true);

drop policy if exists "demo_guarantee_delete_own"
  on public.demo_guarantee_simulations;

create or replace function public.enforce_demo_guarantee_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('approved', 'denied') and new is distinct from old then
    raise exception 'terminal demo simulation decisions are immutable'
      using errcode = '23514';
  end if;

  if new.user_id <> old.user_id
    or new.simulation_run_id <> old.simulation_run_id
    or new.created_at <> old.created_at then
    raise exception 'demo simulation identity and creation time are immutable'
      using errcode = '23514';
  end if;

  if new is distinct from old and new.revision <= old.revision then
    raise exception 'demo simulation revisions must increase'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_demo_guarantee_immutability
  on public.demo_guarantee_simulations;
create trigger enforce_demo_guarantee_immutability
  before update on public.demo_guarantee_simulations
  for each row execute function public.enforce_demo_guarantee_immutability();
