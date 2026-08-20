-- Brings the schema in line with the corrected architecture.
--
-- The original tables were designed before ADR-021 (the goal is open, not
-- weight loss) and before ADR-024 (the full intake in one pass). Two fossils
-- were left behind:
--
--   * `goals.goal_type` defaulted to 'weight_loss', which is exactly the
--     framing the product decided against.
--   * `profiles` held only the three scalars the basal-rate formula needs. The
--     sport, nutrition, sleep and mind answers the onboarding collects had
--     nowhere to go, so a goal about sleep or focus could not be stored at all.

-- ------------------------------------------------------------- the goal ----

-- An enum, so that an unknown archetype is a database error rather than a text
-- value nobody notices. src/lib/domain/types.ts reads its union from here.
create type public.goal_archetype as enum (
  'body_composition', 'strength', 'endurance',
  'sleep_recovery', 'nutrition_quality', 'habit_routine', 'general_health'
);

-- Where the classification came from, so the UI can be honest about it rather
-- than presenting a keyword guess as if the model had understood the sentence.
create type public.goal_classified_by as enum ('ai', 'keywords', 'user');

alter table public.goals
  add column archetype public.goal_archetype not null default 'general_health',
  add column classified_by public.goal_classified_by not null default 'keywords';

-- `title` already holds what the person typed. Renamed so the intent is
-- explicit: this text is shown back to them and is never rewritten.
alter table public.goals rename column title to raw_text;

-- The fossil. Dropped rather than repurposed: leaving a column called
-- goal_type next to archetype invites writing to the wrong one.
alter table public.goals drop column goal_type;

-- ---------------------------------------------------------- the person ----

alter table public.profiles
  -- Flat, because the energy formulas consume it directly and a numeric column
  -- can be range-checked. It is also an outcome metric, so its *history* lives
  -- in measurements; this is only the starting point.
  add column weight_kg numeric(5, 1) check (weight_kg between 25 and 400),
  -- Grouped intake answers, stored the way free_slots already is. They are
  -- declared preferences rather than computed values, they change shape as the
  -- onboarding evolves, and every read goes through a zod schema at the
  -- boundary. Flat columns would mean a migration per question.
  add column sport jsonb not null default '{}'::jsonb,
  add column nutrition jsonb not null default '{}'::jsonb,
  add column sleep jsonb not null default '{}'::jsonb,
  add column mind jsonb not null default '{}'::jsonb;

alter table public.profiles
  add constraint profiles_sport_is_object check (jsonb_typeof(sport) = 'object'),
  add constraint profiles_nutrition_is_object check (jsonb_typeof(nutrition) = 'object'),
  add constraint profiles_sleep_is_object check (jsonb_typeof(sleep) = 'object'),
  add constraint profiles_mind_is_object check (jsonb_typeof(mind) = 'object');

-- ------------------------------------------------------------ the plan ----

-- Which track an action belongs to. The health baseline runs under every goal;
-- without this column the two are indistinguishable once stored, and the rule
-- that the baseline may never crowd out the goal track becomes unverifiable.
create type public.plan_track as enum ('goal', 'baseline');

alter table public.plan_items
  add column track public.plan_track not null default 'goal',
  -- The user input a recommendation was derived from. An empty array is
  -- rejected for the same reason it is on insights: a recommendation that
  -- cannot point at its data must not exist. See principle 4.
  add column rationale_based_on jsonb not null default '[]'::jsonb;

alter table public.plan_items
  add constraint plan_items_rationale_based_on_is_array
    check (jsonb_typeof(rationale_based_on) = 'array');
