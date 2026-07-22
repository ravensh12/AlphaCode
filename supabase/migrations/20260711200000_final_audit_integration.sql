-- Final audit: stable evidence links, delayed retention, and gauntlet sync.
-- Safe to re-run after the v1 learning and academy migrations.

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
revoke all on function public.academy_quiz_attempts_valid(jsonb) from public;

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

-- Preserve grounded practice timestamps, but never convert an old completion
-- latch into delayed-retention evidence.
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

-- Rows without real event links cannot remain academy evidence.
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
  if (
    select count(*) <> cardinality(acquisition_ids)
    from public.learning_attempt_events event
    where event.user_id = owner_id
      and event.id = any(acquisition_ids)
      and event.problem_id = p_record->>'problem_id'
      and event.resolved
      and event.is_correct
      and event.first_try_correct
      and not event.used_hint
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
      and event.first_try_correct
      and not event.used_hint
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
      and event.first_try_correct
      and not event.used_hint
      and not event.revealed
      and event.metadata->'evidenceKinds' ? 'code-tests'
  ) or not exists (
    select 1
    from public.learning_attempt_events event
    where event.user_id = owner_id
      and event.id = any(transfer_ids)
      and event.id = any(code_ids)
      and event.metadata->>'assessmentKind' = 'pythonCode'
      and event.metadata->'evidenceKinds' ? 'independent-transfer'
      and event.metadata->'evidenceKinds' ? 'code-tests'
  ) then
    raise exception 'invalid linked Python transfer/code evidence'
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
          and event.first_try_correct
          and not event.used_hint
          and not event.revealed
          and event.metadata->>'academyMode' = 'retention'
          and event.metadata->'evidenceKinds' ? 'delayed-retrieval'
      ) then
      raise exception 'invalid linked delayed-retrieval evidence'
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
    user_id, problem_id, schema_version, evidence_version, curriculum_id,
    curriculum_version, content_version, acquired_at, practiced_at,
    retained_at, completed_at, acquisition_passed, transfer_passed,
    code_tests_passed, delayed_retrieval_passed, acquisition_event_ids,
    transfer_event_ids, code_test_event_ids, delayed_retrieval_event_ids,
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
    acquired_at = least(problem_progress.acquired_at, excluded.acquired_at),
    practiced_at = least(problem_progress.practiced_at, excluded.practiced_at),
    retained_at = least(problem_progress.retained_at, excluded.retained_at),
    completed_at = least(problem_progress.completed_at, excluded.completed_at),
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
    user_id, realm_id, schema_version, evidence_version, curriculum_id,
    curriculum_version, content_version, quiz_best_score, quiz_attempt_count,
    quiz_open_ended_transfer_passed, quiz_first_attempted_at,
    quiz_last_attempted_at, quiz_attempts, boss_defeated, boss_defeated_at,
    boss_defeat_ids, boss_learning_event_ids, updated_at
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
    boss_defeated,
    (p_record->>'boss_defeated_at')::timestamptz,
    boss_defeat_ids,
    boss_event_ids,
    pg_catalog.clock_timestamp()
  )
  on conflict (user_id, realm_id) do update
  set
    schema_version = greatest(realm_progress.schema_version, excluded.schema_version),
    evidence_version = greatest(realm_progress.evidence_version, excluded.evidence_version),
    curriculum_id = greatest(realm_progress.curriculum_id, excluded.curriculum_id),
    curriculum_version = greatest(realm_progress.curriculum_version, excluded.curriculum_version),
    content_version = greatest(realm_progress.content_version, excluded.content_version),
    quiz_best_score = greatest(realm_progress.quiz_best_score, excluded.quiz_best_score),
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
    boss_defeated = realm_progress.boss_defeated or excluded.boss_defeated,
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

revoke all on function public.merge_academy_mission_progress(jsonb) from public;
revoke all on function public.merge_academy_realm_progress(jsonb) from public;
grant execute on function public.merge_academy_mission_progress(jsonb)
  to authenticated;
grant execute on function public.merge_academy_realm_progress(jsonb)
  to authenticated;

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
  best_score integer not null default 0 check (best_score between 0 and 100),
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
    user_id, version, revision, best_score, attempts, exam_passed,
    exam_passed_at, certification_requirements_passed, final_boss_beaten,
    final_boss_beaten_at, concepts, legacy_attempt_count, legacy_best_score,
    legacy_exam_passed, legacy_exam_passed_at, legacy_final_boss_beaten,
    legacy_final_boss_beaten_at, legacy_concepts, certification_attempts,
    concept_outcomes, final_boss_defeats, updated_at
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
    best_score = greatest(gauntlet_progress.best_score, excluded.best_score),
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
    exam_passed = gauntlet_progress.exam_passed or excluded.exam_passed,
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
