-- Profile, daily structure, goals and constraints.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  birth_year smallint check (birth_year between 1900 and 2100),
  height_cm numeric(5, 1) check (height_cm between 80 and 260),
  -- Collected solely for the basal metabolic rate formula. Optional; the engine
  -- falls back to the most conservative value when absent.
  sex_at_birth text check (sex_at_birth in ('female', 'male', 'unspecified')),
  life_situation text,
  onboarding_stage smallint not null default 1 check (onboarding_stage between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  wake_time time,
  sleep_time time,
  work_pattern text,
  free_slots jsonb not null default '[]'::jsonb,
  weekend_differs boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_free_slots_is_array check (jsonb_typeof(free_slots) = 'array')
);

create trigger schedules_set_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  goal_type text not null default 'weight_loss',
  target_date date,
  priority smallint not null default 1 check (priority between 1 and 5),
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets children reference the goal and its owner together, so a row can never
  -- be attached to a goal belonging to somebody else.
  unique (id, profile_id)
);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- Exactly one active goal per profile in the MVP, enforced by the database
-- rather than by application code. See ADR-004.
create unique index goals_one_active_per_profile
  on public.goals (profile_id)
  where status = 'active';

create index goals_profile_id_idx on public.goals (profile_id);

create table public.goal_metrics (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  profile_id uuid not null,
  metric_key text not null,
  start_value numeric not null,
  target_value numeric not null,
  unit text not null,
  created_at timestamptz not null default now(),
  foreign key (goal_id, profile_id)
    references public.goals (id, profile_id) on delete cascade,
  unique (goal_id, metric_key)
);

create index goal_metrics_profile_id_idx on public.goal_metrics (profile_id);

create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind public.constraint_kind not null,
  value jsonb not null,
  -- Hard constraints must never be violated by the engine; soft ones are
  -- preferences it may trade off.
  hard boolean not null default false,
  created_at timestamptz not null default now()
);

create index constraints_profile_id_idx on public.constraints (profile_id);
