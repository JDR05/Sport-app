-- One current plan per week, enforced where it cannot be raced.
--
-- Plans are materialised lazily: the first time a week is opened, it is written.
-- Two requests arriving together — a tab restored on a phone plus a tap — would
-- otherwise both find nothing and both insert, and the person would tick an
-- action off on one copy while the screen showed the other.
--
-- Checking first and inserting after cannot fix that in application code; only
-- the database can. Superseded plans are excluded, because keeping the previous
-- version is the whole point of the column: an experiment compares the plan
-- before a change with the plan after it.

create unique index plans_one_current_per_week
  on public.plans (profile_id, week_start)
  where superseded_by is null;
