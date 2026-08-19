-- Enums and shared helpers.
--
-- Status values are enums rather than free text so that an invalid state is a
-- database error, not a silent data problem. See docs/DATABASE.md.

create type public.goal_status as enum ('active', 'paused', 'reached', 'abandoned');

create type public.constraint_kind as enum (
  'time', 'dietary', 'equipment', 'dislike', 'medical_selfreport'
);

-- The MVP only plans training, nutrition and movement. The remaining values
-- exist so that V2 does not need an enum migration. See ADR-010.
create type public.plan_domain as enum (
  'training', 'nutrition', 'movement', 'sleep', 'self_improvement', 'priority'
);

-- `missed` is a behavioural signal, `not_relevant` a planning error and
-- `unknown` simply missing input. Only `missed` may feed pattern detection.
-- See ADR-011.
create type public.plan_item_status as enum (
  'planned', 'done', 'moved', 'missed', 'not_relevant', 'unknown'
);

create type public.plan_source as enum ('engine', 'engine_ai');

-- Experiments may only ever be evaluated against behaviour. See ADR-012.
create type public.metric_class as enum ('behavior', 'outcome');

create type public.experiment_status as enum (
  'proposed', 'running', 'evaluating', 'adopted', 'rejected', 'extended', 'aborted'
);

create type public.experiment_decision as enum ('keep', 'discard', 'continue');

create type public.insight_kind as enum (
  'pattern', 'progress', 'experiment_result', 'warning'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- metric_class decides whether a measurement may drive an experiment decision.
-- Allowing it to change after the fact would let outcome data leak into
-- experiment evaluation retroactively.
create or replace function public.freeze_metric_class()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.metric_class is distinct from old.metric_class then
    raise exception 'metric_class is immutable';
  end if;
  return new;
end;
$$;
