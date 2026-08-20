-- What else was going on that day.
--
-- The check-in asked for energy and mood. Both are outcomes — they tell you a
-- day was hard, not why. Sleep and stress are the two circumstances people can
-- actually name, and the two that explain most missed sessions: someone who
-- trains until nine and gets up at five did not fail at discipline, they ran
-- out of night.
--
-- Without these the app can only see that Tuesdays go badly, and an app that
-- sees a pattern with no cause ends up implying the cause is the person.
alter table public.check_ins
  add column sleep_hours numeric(3, 1)
    check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
  -- 1 = ruhig, 5 = viel. Deliberately the same 1..5 shape as energy and mood so
  -- the check-in stays one gesture, but read in the opposite direction.
  add column stress smallint
    check (stress is null or stress between 1 and 5);
