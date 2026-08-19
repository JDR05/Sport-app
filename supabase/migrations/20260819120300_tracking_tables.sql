-- Check-ins and measurements.

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  checked_in_on date not null,
  energy smallint check (energy between 1 and 5),
  mood smallint check (mood between 1 and 5),
  note text,
  created_at timestamptz not null default now(),
  unique (profile_id, checked_in_on)
);

create index check_ins_profile_date_idx on public.check_ins (profile_id, checked_in_on desc);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  metric_key text not null,
  -- `behavior` may drive experiment decisions, `outcome` may not. A seven day
  -- experiment evaluated on weight would be noise, and the resulting rule would
  -- poison the personal model. See ADR-012.
  metric_class public.metric_class not null,
  value numeric not null,
  unit text not null,
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create trigger measurements_freeze_metric_class
  before update on public.measurements
  for each row execute function public.freeze_metric_class();

create index measurements_profile_metric_idx
  on public.measurements (profile_id, metric_key, measured_at desc);
