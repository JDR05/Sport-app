-- What the model asked before planning, and what came back.
--
-- The onboarding asks everybody the same questions. That is correct — the
-- engine needs the same fields from everybody — but it also means the app only
-- ever learns what somebody thought to put on the form in advance. For "5 kg
-- abnehmen" that is enough. For "ich will wieder zeichnen können, ohne dass
-- mein Rücken nach zwanzig Minuten dicht macht" it is not, and no fixed form
-- would have had the right question in it.
--
-- Stored on the goal rather than the profile because that is its scope: the
-- questions are about this goal, and a new goal deserves new ones rather than
-- inheriting answers given about a different ambition.
--
-- An empty array is the normal, expected state. The model is told that asking
-- nothing is the good outcome, and most complete intakes need nothing.
alter table public.goals
  add column intake_answers jsonb not null default '[]'::jsonb,
  -- Separates "never asked" from "asked, nothing to ask about". Without it the
  -- app would re-ask on every load of a goal the model was happy with, which
  -- costs a call each time and would eventually produce a different set of
  -- questions for the same intake.
  add column intake_asked_at timestamptz;

comment on column public.goals.intake_answers is
  'Array of {question, answer}. answer is null when the person skipped it — skipping is allowed.';

alter table public.goals
  add constraint goals_intake_answers_is_array check (jsonb_typeof(intake_answers) = 'array');
