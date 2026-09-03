-- What the person wants from the model's suggestions.
--
-- Insights lists what the AI proposed — "Krafttraining", "Laufen" — and the
-- list was read-only. So the one place in the app where somebody can see the
-- model's reasoning laid out was also the one place they could not answer it:
-- "dann möchte ich da aber Präferenzen geben, zum Beispiel möchte ich zweimal
-- der Woche Krafttraining machen."
--
-- Keyed by the action's title, which is what identifies a proposed action
-- everywhere else in this schema too — the proposal itself is a jsonb array
-- with no ids in it. A preference whose action has since disappeared from the
-- proposal is simply never read; it costs a few bytes and means a preference
-- survives a re-proposal that happens to keep the same wording.
--
-- On the goal, beside the proposal it refers to. Change the goal and the
-- proposal is made again, and these go with it.
alter table public.goals
  add column action_preferences jsonb not null default '{}'::jsonb;

-- An object, never an array or a scalar.
--
-- The column is read into typed code that walks its keys. A stored array would
-- not throw there, it would quietly iterate indices and match no action —
-- a preference silently doing nothing, which is the failure mode this product
-- keeps having to design against. Cheaper to refuse it here.
alter table public.goals
  add constraint goals_action_preferences_is_object
  check (jsonb_typeof(action_preferences) = 'object');

comment on column public.goals.action_preferences is
  'Per-proposed-action wishes, keyed by action title: {"<title>": {"timesPerWeek": 2, "enabled": true}}. The engine clamps and places; this is the request, not the outcome.';
