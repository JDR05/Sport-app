-- Experiments, insights and the learned personal rules.

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  hypothesis text not null check (length(btrim(hypothesis)) > 0),
  -- Exactly one variable per experiment. Two changes at once make the result
  -- uninterpretable.
  variable text not null check (length(btrim(variable)) > 0),
  change_description text not null,
  baseline jsonb not null,
  metric_key text not null,
  start_date date not null,
  end_date date not null,
  status public.experiment_status not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (goal_id, profile_id)
    references public.goals (id, profile_id) on delete cascade,
  unique (id, profile_id),
  constraint experiments_period_is_positive check (end_date > start_date)
);

create trigger experiments_set_updated_at
  before update on public.experiments
  for each row execute function public.set_updated_at();

create index experiments_profile_status_idx on public.experiments (profile_id, status);

create table public.experiment_results (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null,
  profile_id uuid not null,
  metric text not null,
  metric_class public.metric_class not null,
  baseline_value numeric not null,
  observed_value numeric not null,
  decision public.experiment_decision not null,
  evaluated_at timestamptz not null default now(),
  foreign key (experiment_id, profile_id)
    references public.experiments (id, profile_id) on delete cascade,
  -- ADR-012 as a database constraint rather than a convention: an experiment
  -- evaluated against an outcome metric cannot even be stored.
  constraint experiment_results_behavior_only check (metric_class = 'behavior')
);

create index experiment_results_profile_id_idx on public.experiment_results (profile_id);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind public.insight_kind not null,
  statement text not null check (length(btrim(statement)) > 0),
  -- References the concrete rows the insight was derived from. An insight
  -- without evidence must not exist, so the empty array is rejected.
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  constraint insights_evidence_is_non_empty_array check (
    jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0
  )
);

create index insights_profile_created_idx on public.insights (profile_id, created_at desc);

create table public.personal_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  rule_key text not null,
  rule_value jsonb not null,
  confidence numeric not null check (confidence between 0 and 1),
  -- Only a confirmed experiment may produce a rule; plan care never does.
  -- See ADR-013. Nullable so that deleting an experiment keeps the rule.
  source_experiment_id uuid references public.experiments (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, rule_key)
);

create trigger personal_rules_set_updated_at
  before update on public.personal_rules
  for each row execute function public.set_updated_at();

create index personal_rules_profile_active_idx
  on public.personal_rules (profile_id) where active;
