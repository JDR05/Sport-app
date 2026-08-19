-- Plans and the individual planned actions.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  week_start date not null,
  strategy jsonb not null,
  -- Per item: why it is in the plan, referencing the user's own input. Without
  -- this the personalisation is invisible to the user. See critique K1.
  rationale jsonb not null default '[]'::jsonb,
  -- What the engine had to assume because the user did not supply it.
  assumptions jsonb not null default '[]'::jsonb,
  generated_by public.plan_source not null default 'engine',
  -- Plans are versioned, never overwritten: without the previous version a
  -- before/after comparison of an experiment cannot be reconstructed.
  superseded_by uuid references public.plans (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (goal_id, profile_id)
    references public.goals (id, profile_id) on delete cascade,
  unique (id, profile_id),
  constraint plans_rationale_is_array check (jsonb_typeof(rationale) = 'array'),
  constraint plans_assumptions_is_array check (jsonb_typeof(assumptions) = 'array'),
  constraint plans_not_self_superseding check (superseded_by is distinct from id)
);

create index plans_profile_id_idx on public.plans (profile_id);
create index plans_profile_week_idx on public.plans (profile_id, week_start desc);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  profile_id uuid not null,
  scheduled_on date not null,
  domain public.plan_domain not null,
  title text not null check (length(btrim(title)) > 0),
  details jsonb not null default '{}'::jsonb,
  planned_duration_min smallint check (planned_duration_min between 1 and 600),
  time_slot text,
  rationale text,
  status public.plan_item_status not null default 'planned',
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (plan_id, profile_id)
    references public.plans (id, profile_id) on delete cascade
);

create index plan_items_profile_date_idx on public.plan_items (profile_id, scheduled_on);
create index plan_items_plan_id_idx on public.plan_items (plan_id);

-- Pattern detection reads this index: only `missed` counts as a behavioural
-- signal, `not_relevant` and `unknown` must never be aggregated as failure.
create index plan_items_missed_idx
  on public.plan_items (profile_id, domain, scheduled_on)
  where status = 'missed';
