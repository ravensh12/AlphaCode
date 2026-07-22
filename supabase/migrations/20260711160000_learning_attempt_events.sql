-- Immutable v1 learning facts. Legacy public.attempts remains unchanged.
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
  for select
  using (auth.uid() = user_id);

drop policy if exists "learning_attempt_events_insert_own"
  on public.learning_attempt_events;
create policy "learning_attempt_events_insert_own"
  on public.learning_attempt_events
  for insert
  with check (auth.uid() = user_id);

-- No UPDATE or DELETE policy is intentionally defined.
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
