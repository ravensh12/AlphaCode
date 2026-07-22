-- DEMO ONLY: fictional guarantee workflow evidence.
-- This table must never be repurposed for real refunds or transactional use.

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
