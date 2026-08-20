-- A running experiment has to actually change the plan.
--
-- Until now a rule only entered personal_rules once an experiment had already
-- concluded. That meant the fourteen days in between produced exactly the plan
-- the person had before, so the "test" tested nothing and the result was
-- guaranteed to be noise. The rule under test now lives here from the moment
-- the person accepts it, marked as a trial.
--
-- A trial rule is not part of the personal model yet. The Playbook screen only
-- shows what has been learned, so it filters trial rules out; the planner reads
-- them, because applying them is the entire point.
alter table public.personal_rules
  add column trial boolean not null default false;

-- A trial rule may share its key with a rule that is already learned — testing
-- a different time slot while one is already established is a normal case — so
-- the key alone can no longer be unique. Only one of each pair may exist.
alter table public.personal_rules
  drop constraint personal_rules_profile_id_rule_key_key;

alter table public.personal_rules
  add constraint personal_rules_profile_key_trial_key
  unique (profile_id, rule_key, trial);

-- One experiment at a time, enforced where it cannot be raced.
--
-- The application already refuses to accept a second experiment, but it did so
-- by reading and then writing: two requests arriving together both read zero
-- and both inserted. Two concurrent experiments make both results unreadable,
-- and the reader used maybeSingle(), so a duplicate would have thrown on every
-- subsequent load and killed the learning loop permanently.
--
-- 'extended' counts as open: it is the same test given more time, not a
-- finished one.
create unique index experiments_one_open_per_profile_idx
  on public.experiments (profile_id)
  where status in ('proposed', 'running', 'extended');
