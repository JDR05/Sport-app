-- Row Level Security on every table, without exception.
--
-- Policies are split per operation rather than using `for all`, so that a future
-- change to one operation cannot silently widen the others. `(select auth.uid())`
-- is wrapped in a subselect so Postgres evaluates it once per statement instead
-- of once per row.

alter table public.profiles          enable row level security;
alter table public.schedules         enable row level security;
alter table public.goals             enable row level security;
alter table public.goal_metrics      enable row level security;
alter table public.constraints       enable row level security;
alter table public.plans             enable row level security;
alter table public.plan_items        enable row level security;
alter table public.check_ins         enable row level security;
alter table public.measurements      enable row level security;
alter table public.experiments       enable row level security;
alter table public.experiment_results enable row level security;
alter table public.insights          enable row level security;
alter table public.personal_rules    enable row level security;

-- profiles keys on `id`, every other table on `profile_id`.
create policy profiles_select on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy profiles_delete on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'schedules', 'goals', 'goal_metrics', 'constraints', 'plans', 'plan_items',
    'check_ins', 'measurements', 'experiments', 'experiment_results',
    'insights', 'personal_rules'
  ]
  loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using ((select auth.uid()) = profile_id)', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check ((select auth.uid()) = profile_id)', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using ((select auth.uid()) = profile_id)
         with check ((select auth.uid()) = profile_id)', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using ((select auth.uid()) = profile_id)', t);
  end loop;
end;
$$;
