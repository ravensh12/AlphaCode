-- Durable NeetCode 150 academy completion facts. Current mastery remains in
-- learning_mastery and is not copied into these monotonic completion rows.

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

revoke all on function public.jsonb_object_key_count(jsonb) from public;
revoke all on function public.text_array_union(text[], text[]) from public;
revoke all on function public.jsonb_text_array(jsonb) from public;
revoke all on function public.merge_academy_quiz_attempts(jsonb, jsonb)
  from public;

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
  completed_at timestamptz not null,
  acquisition_passed boolean not null check (acquisition_passed),
  transfer_passed boolean not null check (transfer_passed),
  code_tests_passed boolean not null check (code_tests_passed),
  acquisition_event_ids text[] not null default '{}',
  transfer_event_ids text[] not null default '{}',
  code_test_event_ids text[] not null default '{}',
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, problem_id)
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
  constraint realm_progress_quiz_time_order check (
    quiz_first_attempted_at is null
    or quiz_last_attempted_at is null
    or quiz_first_attempted_at <= quiz_last_attempted_at
  ),
  constraint realm_progress_boss_evidence check (
    boss_defeated = (boss_defeated_at is not null)
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
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_record) <> 'object' then
    raise exception 'p_record must be a JSON object' using errcode = '22023';
  end if;

  insert into public.problem_progress (
    user_id,
    problem_id,
    schema_version,
    evidence_version,
    curriculum_id,
    curriculum_version,
    content_version,
    completed_at,
    acquisition_passed,
    transfer_passed,
    code_tests_passed,
    acquisition_event_ids,
    transfer_event_ids,
    code_test_event_ids,
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
    (p_record->>'completed_at')::timestamptz,
    (p_record->>'acquisition_passed')::boolean,
    (p_record->>'transfer_passed')::boolean,
    (p_record->>'code_tests_passed')::boolean,
    public.jsonb_text_array(p_record->'acquisition_event_ids'),
    public.jsonb_text_array(p_record->'transfer_event_ids'),
    public.jsonb_text_array(p_record->'code_test_event_ids'),
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
    completed_at = least(
      problem_progress.completed_at,
      excluded.completed_at
    ),
    acquisition_passed = true,
    transfer_passed = true,
    code_tests_passed = true,
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
begin
  if owner_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_record) <> 'object' then
    raise exception 'p_record must be a JSON object' using errcode = '22023';
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
    public.jsonb_text_array(p_record->'boss_defeat_ids'),
    public.jsonb_text_array(p_record->'boss_learning_event_ids'),
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
