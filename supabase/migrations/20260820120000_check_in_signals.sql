-- The rest of what a day was like.
--
-- Three more, and each earns its place by belonging to a goal the app actually
-- supports:
--
--   diet_quality  a rough sense of how the eating went. Not a calorie tracker —
--                 that would be the second job the brief rules out — but body
--                 and nutrition goals are unreadable without any food signal.
--   soreness      how the body feels. Strength and endurance goals need it, or
--                 the plan keeps piling load onto someone already carrying it.
--   alcohol_units
--   caffeine_late both land on sleep, which is the factor everything else
--                 turns out to depend on.
--
-- All nullable, all optional, all skipped rather than assumed when missing.
-- Which of them a person is *asked* is decided by their goal: a sleep goal has
-- no business asking about soreness. The columns exist for everyone so the
-- history stays readable if the goal changes.
alter table public.check_ins
  -- 1 = schlecht, 5 = gut. Same shape as energy and mood.
  add column diet_quality smallint
    check (diet_quality is null or diet_quality between 1 and 5),
  -- 1 = frisch, 5 = starker Muskelkater. Reads upwards, like stress.
  add column soreness smallint
    check (soreness is null or soreness between 1 and 5),
  -- Standard drinks. A count, not a judgement, and never shown back as one.
  add column alcohol_units numeric(3, 1)
    check (alcohol_units is null or (alcohol_units >= 0 and alcohol_units <= 50)),
  -- Caffeine after roughly 4pm: the part that reaches the night.
  add column caffeine_late boolean;
