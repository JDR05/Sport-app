-- What this person's own training actually does for this goal.
--
-- The engine decided that with a hardcoded list: gym, bodyweight and climbing
-- were "strength", running, cycling and swimming were "endurance". Plausible
-- for an average and generic for everybody — which is precisely the thing this
-- product claims not to be. Whether swimming is endurance work *for this goal*,
-- whether climbing replaces a gym session *for this person*, whether winter
-- football is the same as summer football: that is a judgement, not a table.
--
-- So the model makes it, per commitment, and says how to get the most out of
-- it. The list stays in the code as the fallback for an account with no model,
-- explicitly the worse answer rather than the normal one.
--
-- On the goal rather than on the schedule, because the answer depends on the
-- goal: the same football training is a training session for someone chasing
-- 10 km and a recovery cost for someone chasing a deadlift. Change the goal
-- and the judgement has to be made again.
alter table public.goals
  add column commitment_insights jsonb;

comment on column public.goals.commitment_insights is
  'Per-commitment model judgement for this goal: does it do the goal''s work, and how to use it. Null = never asked.';

-- What the judgement was made about.
--
-- Commitments are editable now (ADR-099), and an insight about a football
-- training somebody has since dropped is worse than none: it would keep
-- shaping the plan invisibly. The signature is compared before the stored
-- answer is used, so a changed week means the app asks again rather than
-- reasoning from a life the person no longer has.
alter table public.goals
  add column commitment_insights_for text;
