-- One active goal per person, enforced in the database.
--
-- The MVP validates one goal at a time, and the reader relies on it:
-- loadPlanInput uses maybeSingle(), which errors on two rows. Until now that
-- error was read as "no goal", so a second active goal would have sent the
-- person into the onboarding — where finishing the form creates a third. The
-- rule is checked where it cannot be worked around instead.
create unique index goals_one_active_per_profile_idx
  on public.goals (profile_id)
  where status = 'active';
