-- Mission evidence policy update: retried-but-passing answers count.
--
-- The authored failure policies grant multiple attempts (10 on the Python
-- challenge), so a wrong try followed by a correct answer is expected work,
-- not a disqualifier. The previous rule required first_try_correct and no
-- hints on every linked event, which made a mission permanently unrecordable
-- after a single failed "Check" — the client now accepts any resolved,
-- correct, non-revealed event (see isPassingLinkedEvent in
-- src/context/ProgressContext.tsx), and this migration aligns the server
-- gate. Revealed answers still never count.

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

revoke all on function public.merge_academy_mission_progress(jsonb) from public;
grant execute on function public.merge_academy_mission_progress(jsonb)
  to authenticated;
