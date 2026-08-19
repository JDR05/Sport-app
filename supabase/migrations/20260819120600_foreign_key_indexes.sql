-- Covering indexes for the composite foreign keys introduced in the previous
-- migrations. Without them Postgres has to scan the child table whenever a
-- parent row is deleted or its key updated, which the cascades do routinely.
--
-- Reported by the Supabase database linter (0001_unindexed_foreign_keys).

create index goal_metrics_goal_profile_idx
  on public.goal_metrics (goal_id, profile_id);

create index plans_goal_profile_idx
  on public.plans (goal_id, profile_id);

create index plans_superseded_by_idx
  on public.plans (superseded_by);

create index plan_items_plan_profile_idx
  on public.plan_items (plan_id, profile_id);

create index experiments_goal_profile_idx
  on public.experiments (goal_id, profile_id);

create index experiment_results_experiment_profile_idx
  on public.experiment_results (experiment_id, profile_id);

create index personal_rules_source_experiment_idx
  on public.personal_rules (source_experiment_id);

-- plan_items_plan_id_idx and plans_profile_id_idx are now redundant: the new
-- composite indexes lead with the same columns.
drop index if exists public.plan_items_plan_id_idx;
drop index if exists public.plans_profile_id_idx;
