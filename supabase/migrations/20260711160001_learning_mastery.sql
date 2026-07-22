-- Rebuildable problem/skill projection cache. The immutable event table is the
-- canonical source for v1 learning history.
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
  for select
  using (auth.uid() = user_id);

drop policy if exists "learning_mastery_insert_own"
  on public.learning_mastery;

drop policy if exists "learning_mastery_update_own"
  on public.learning_mastery;

-- Projection rows are never client-writable directly. The owner-scoped RPC
-- below is the only mutation path, so revision checks cannot be bypassed.
revoke insert, update, delete on public.learning_mastery
  from anon, authenticated;
grant select on public.learning_mastery to authenticated;

/**
 * Revision-safe projection upsert. It is intentionally separate from immutable
 * event insertion: callers acknowledge their outbox only after both operations
 * succeed, and event retries are idempotent.
 */
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
      user_id,
      entity_kind,
      entity_id,
      submission_count,
      review_count,
      correct_count,
      first_try_correct_count,
      ability,
      recent_results,
      scheduler_version,
      fsrs_phase,
      stability_days,
      difficulty,
      due_at,
      last_review_at,
      reps,
      lapses,
      last_event_id,
      last_attempt_at,
      revision,
      projection_version,
      legacy_seed,
      updated_at
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
