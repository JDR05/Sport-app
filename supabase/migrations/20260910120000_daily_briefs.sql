-- The AI, every day.
--
-- Measured before it was built. In four weeks of real use the model spoke five
-- times: twice when the goal was created, three times as a weekly impulse.
-- That was not a setting, it was the architecture — every call except the
-- impulse is capped at once per goal (`goals.intake_asked_at`,
-- `goals.ai_proposal_at`), and the impulse has a two-day floor of its own.
--
-- An app whose stated advantage is a personal behaviour model built over
-- months cannot be silent six days out of seven.
--
-- One row per person per day. The uniqueness is the rate limit: the call
-- happens when Today is opened and there is no row yet, so opening the app
-- eleven times costs one call, and the eleventh render reads the first answer.
create table public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,

  -- The local day, from the client's clock like every other date here. The
  -- server runs in UTC; somebody opening the app at 00:30 in Berlin is looking
  -- at their today, not at yesterday's row.
  brief_on date not null,

  -- False is the expected answer on an ordinary day, and the row still exists.
  -- That is the point of writing it: without a row for "nothing to say", every
  -- subsequent open of the app that day would ask the model again and pay for
  -- the same silence repeatedly.
  has_something_to_say boolean not null,

  line text not null check (length(line) <= 240),

  -- Which of today's actions the model would put first. A plan item id, but
  -- deliberately not a foreign key: the brief is a record of what was said on
  -- a day, and a re-planned week that deletes an item must not delete the
  -- history of the app having pointed at it. The screen resolves it against
  -- today's rows and shows nothing when it no longer matches.
  focus_item_id uuid,

  -- The proposed change, exactly as the model produced it, or null.
  -- `adjust_kind` is checked here rather than trusted from the schema: this
  -- column is what the apply path reads, and 'add' must be unrepresentable in
  -- the database and not merely absent from a zod enum.
  adjust_item_id uuid,
  adjust_kind text check (adjust_kind in ('move', 'drop')),
  adjust_to_slot text check (adjust_to_slot in ('early', 'midday', 'evening')),
  adjust_reason text check (length(adjust_reason) <= 200),

  -- Set when the person tapped it. Null means offered and not taken, which is
  -- a real answer about the suggestion and worth being able to count.
  adjust_applied_at timestamptz,

  -- The rows it was built from. Same rule as insights, weekly_notes and
  -- ai_questions: a statement nobody can trace back to real data must not
  -- exist.
  evidence jsonb not null default '[]'::jsonb,
  source text not null,

  created_at timestamptz not null default now(),

  constraint daily_briefs_one_per_day unique (profile_id, brief_on),
  constraint daily_briefs_evidence_is_array check (jsonb_typeof(evidence) = 'array'),

  -- Silence claims nothing and so cites nothing; speech cites something.
  constraint daily_briefs_speech_is_grounded check (
    not has_something_to_say or jsonb_array_length(evidence) > 0
  ),
  -- A silent brief carries no line and no adjustment. Without this the day
  -- could hold a change proposal attached to a card that is never drawn.
  constraint daily_briefs_silence_is_empty check (
    has_something_to_say or (length(btrim(line)) = 0 and adjust_item_id is null)
  ),
  -- An adjustment is all four columns or none of them. A half-written one is
  -- a button whose label the app would have to guess.
  constraint daily_briefs_adjust_is_whole check (
    (adjust_item_id is null and adjust_kind is null and adjust_reason is null)
    or (adjust_item_id is not null and adjust_kind is not null
        and adjust_reason is not null and length(btrim(adjust_reason)) > 0)
  ),
  -- A move needs a destination; a drop must not carry one. The two are
  -- different changes to somebody's day and the column may not be ambiguous
  -- about which one was proposed.
  constraint daily_briefs_move_has_a_slot check (
    adjust_kind is distinct from 'move' or adjust_to_slot is not null
  ),
  constraint daily_briefs_drop_has_no_slot check (
    adjust_kind is distinct from 'drop' or adjust_to_slot is null
  ),
  -- Nothing can be applied that was never offered.
  constraint daily_briefs_applied_needs_an_adjust check (
    adjust_applied_at is null or adjust_item_id is not null
  )
);

-- The one read this table gets: today's row, and yesterday's line so two days
-- do not say the same thing.
create index daily_briefs_profile_day_idx
  on public.daily_briefs (profile_id, brief_on desc);

alter table public.daily_briefs enable row level security;

create policy daily_briefs_select on public.daily_briefs
  for select using (profile_id = auth.uid());
create policy daily_briefs_insert on public.daily_briefs
  for insert with check (profile_id = auth.uid());
create policy daily_briefs_update on public.daily_briefs
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy daily_briefs_delete on public.daily_briefs
  for delete using (profile_id = auth.uid());
