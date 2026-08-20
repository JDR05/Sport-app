-- Schema verification. Runs against a local Postgres or a hosted Supabase
-- project. Creates two throwaway users, asserts, then removes them again.
--
-- Every assertion raises on failure, so a clean run means everything held.

\set ON_ERROR_STOP on

do $$
declare
  user_a constant uuid := '00000000-0000-4000-a000-00000000000a';
  user_b constant uuid := '00000000-0000-4000-b000-00000000000b';
  goal_a uuid;
  goal_b uuid;
  plan_a uuid;
  exp_a  uuid;
  n int;
  failed boolean;
begin
  -- ---------------------------------------------------------------- setup ---
  insert into auth.users (id, email) values
    (user_a, 'a@verify.local'), (user_b, 'b@verify.local')
    on conflict (id) do nothing;
  insert into public.profiles (id, birth_year, height_cm, sex_at_birth) values
    (user_a, 2000, 180.0, 'male'), (user_b, 1995, 165.0, 'female');

  insert into public.goals (profile_id, raw_text, target_date)
    values (user_a, 'Lose 5 kg', current_date + 84) returning id into goal_a;
  insert into public.goals (profile_id, raw_text, target_date)
    values (user_b, 'Lose 5 kg', current_date + 84) returning id into goal_b;

  insert into public.plans (profile_id, goal_id, week_start, strategy)
    values (user_a, goal_a, date_trunc('week', current_date)::date, '{"kcal": 2100}')
    returning id into plan_a;

  insert into public.experiments
    (profile_id, goal_id, hypothesis, variable, change_description, baseline,
     metric_key, start_date, end_date)
    values (user_a, goal_a, 'Wednesday collides with your week', 'training_day',
            'Move training to Thursday', '{"completion": 0.2}', 'training_completion',
            current_date, current_date + 7)
    returning id into exp_a;

  -- ------------------------------------------------- 1. RLS is switched on ---
  select count(*) into n
    from pg_tables
   where schemaname = 'public' and not rowsecurity;
  if n <> 0 then
    raise exception 'FAIL 1: % public table(s) without row level security', n;
  end if;

  -- ------------------------------------ 2. four policies on every table ------
  select count(*) into n from (
    select c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
     where ns.nspname = 'public' and c.relkind = 'r'
     group by c.relname
    having count(p.oid) <> 4
  ) s;
  if n <> 0 then
    raise exception 'FAIL 2: % table(s) do not have exactly four policies', n;
  end if;

  -- --------------------------------------- 3. one active goal per profile ---
  begin
    insert into public.goals (profile_id, raw_text) values (user_a, 'Second active goal');
    raise exception 'FAIL 3: a second active goal was accepted';
  exception when unique_violation then
    null;
  end;

  -- ------------------------- 4. experiment results only on behaviour data ---
  begin
    insert into public.experiment_results
      (experiment_id, profile_id, metric, metric_class, baseline_value,
       observed_value, decision)
      values (exp_a, user_a, 'weight_kg', 'outcome', 80, 79, 'keep');
    raise exception 'FAIL 4: an experiment result on an outcome metric was accepted';
  exception when check_violation then
    null;
  end;

  insert into public.experiment_results
    (experiment_id, profile_id, metric, metric_class, baseline_value,
     observed_value, decision)
    values (exp_a, user_a, 'training_completion', 'behavior', 0.2, 0.8, 'keep');

  -- ------------------------------------------ 5. insights need evidence ----
  begin
    insert into public.insights (profile_id, kind, statement, evidence)
      values (user_a, 'pattern', 'Something without proof', '[]'::jsonb);
    raise exception 'FAIL 5: an insight without evidence was accepted';
  exception when check_violation then
    null;
  end;

  -- --------------------------------------- 6. metric_class is immutable ----
  insert into public.measurements (profile_id, metric_key, metric_class, value, unit)
    values (user_a, 'weight_kg', 'outcome', 82.5, 'kg');
  begin
    update public.measurements set metric_class = 'behavior'
     where profile_id = user_a and metric_key = 'weight_kg';
    raise exception 'FAIL 6: metric_class was changed after the fact';
  exception when raise_exception then
    if sqlerrm like 'FAIL 6%' then raise; end if;
  end;

  -- ------------------- 7. a plan cannot be attached to a foreign goal ------
  begin
    insert into public.plans (profile_id, goal_id, week_start, strategy)
      values (user_a, goal_b, current_date, '{}');
    raise exception 'FAIL 7: a plan was attached to another user''s goal';
  exception when foreign_key_violation then
    null;
  end;

  -- ------------------------------------------ 8. cascade delete is clean ---
  insert into public.plan_items (plan_id, profile_id, scheduled_on, domain, title)
    values (plan_a, user_a, current_date, 'training', 'Strength, 40 min');
  delete from auth.users where id = user_b;
  select count(*) into n from public.goals where profile_id = user_b;
  if n <> 0 then
    raise exception 'FAIL 8: % orphaned goal(s) after deleting the user', n;
  end if;

  -- ---------------------------------------------------- cleanup -------------
  delete from auth.users where id in (user_a, user_b);
  select count(*) into n from public.plan_items where profile_id = user_a;
  if n <> 0 then
    raise exception 'FAIL 8b: plan items survived the profile deletion';
  end if;

  raise notice 'structural checks 1-8 passed';
end;
$$;

-- ------------------------------------------------------------------------ --
-- RLS isolation has to run outside the DO block: `set local role` needs its
-- own statements, and a definer-side DO block would not exercise the policies.
-- ------------------------------------------------------------------------ --

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'a@verify.local'),
  ('00000000-0000-4000-b000-00000000000b', 'b@verify.local');
insert into public.profiles (id) values
  ('00000000-0000-4000-a000-00000000000a'),
  ('00000000-0000-4000-b000-00000000000b');
insert into public.goals (profile_id, raw_text) values
  ('00000000-0000-4000-a000-00000000000a', 'Goal of A'),
  ('00000000-0000-4000-b000-00000000000b', 'Goal of B');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-00000000000a"}';

-- A sees exactly one goal: their own.
do $$
declare n int; t text;
begin
  select count(*) into n from public.goals;
  if n <> 1 then raise exception 'FAIL 9: user A sees % goals, expected 1', n; end if;

  select raw_text into t from public.goals;
  if t <> 'Goal of A' then raise exception 'FAIL 9: user A sees "%"', t; end if;

  -- A cannot read B's profile.
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL 10: user A sees % profiles, expected 1', n; end if;

  -- A cannot write a row belonging to B.
  begin
    insert into public.constraints (profile_id, kind, value)
      values ('00000000-0000-4000-b000-00000000000b', 'time', '{}');
    raise exception 'FAIL 11: user A inserted a row for user B';
  exception when insufficient_privilege then
    null;
  end;

  -- A cannot update B's goal (update matches no row rather than erroring).
  update public.goals set raw_text = 'hijacked'
   where profile_id = '00000000-0000-4000-b000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 12: user A updated % of B''s rows', n; end if;

  -- A cannot delete B's goal.
  delete from public.goals
   where profile_id = '00000000-0000-4000-b000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 13: user A deleted % of B''s rows', n; end if;

  raise notice 'isolation checks 9-13 passed';
end;
$$;
commit;

reset role;
delete from auth.users where email in ('a@verify.local', 'b@verify.local');

-- ---------------------------------------------------------------------------
-- 14-17: the corrected architecture actually reached the schema.
-- ---------------------------------------------------------------------------
do $$
begin
  -- The fossil is gone. A column called goal_type sitting next to archetype
  -- would sooner or later be written to instead of it.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'goals' and column_name = 'goal_type'
  ) then
    raise exception 'FAIL 14: goals.goal_type still exists';
  end if;

  -- No default anywhere may reintroduce the weight-loss framing (ADR-021).
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and column_default ilike '%weight_loss%'
  ) then
    raise exception 'FAIL 15: a column still defaults to weight_loss';
  end if;

  -- The full intake has somewhere to go (ADR-024).
  if (
    select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name in ('weight_kg', 'sport', 'nutrition', 'sleep', 'mind')
  ) <> 5 then
    raise exception 'FAIL 16: profiles is missing intake columns';
  end if;

  -- Both tracks stay distinguishable once stored (ADR-022).
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'plan_items' and column_name = 'track'
  ) then
    raise exception 'FAIL 17: plan_items.track is missing';
  end if;

  raise notice 'architecture checks 14-17 passed';
end;
$$;

select 'all schema checks passed' as result;
