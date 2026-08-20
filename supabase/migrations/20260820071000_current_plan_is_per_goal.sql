-- Correcting the previous index: one current plan per week *and goal*.
--
-- The first version keyed only on (profile_id, week_start), which made a goal
-- change mid-week impossible to represent. The new plan could not be inserted
-- until the old one was superseded, and superseding it requires the id of the
-- successor — which does not exist yet. A chicken-and-egg standoff enforced by
-- a unique index.
--
-- Including goal_id dissolves it. The old goal's plan simply stops being the
-- current plan *for the active goal*, and stays exactly where it is: the
-- actions taken under it are history, and the adaptive engine still learns
-- from them. `superseded_by` goes back to meaning only what it was for — a new
-- version of a plan for the same goal, which is what an experiment compares
-- against.
--
-- The race this protects against is unchanged: two requests opening the same
-- week at once still cannot both insert.

drop index if exists public.plans_one_current_per_week;

create unique index plans_one_current_per_week_and_goal
  on public.plans (profile_id, week_start, goal_id)
  where superseded_by is null;
