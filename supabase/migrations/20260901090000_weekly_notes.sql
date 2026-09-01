-- The ongoing half of the AI.
--
-- Until now the model was asked twice per goal — classify it, propose actions —
-- and then never again. Everything after that was deterministic, which means
-- the app could only ever notice what somebody had written a rule for.
--
-- Two things it therefore could not do, and both are the whole point:
--
--   1. Read the free text. `check_ins.note` has been collected every day since
--      the check-in shipped and read by nothing. Somebody types "war krank" and
--      the engine sees three missed actions and starts forming a pattern about
--      Wednesdays. That is not a missing feature, it is a wrong answer.
--
--   2. Connect things across domains that no rule anticipated — drinking on
--      Friday, sleeping badly on Saturday, the Sunday run not happening.
--
-- One note per week, and the unique index is what makes that true rather than
-- a promise in the application. Same device as `plans`: the write is the check,
-- so two requests arriving together cannot produce two notes.
create table public.weekly_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,

  -- One thing worth knowing, in the person's own week.
  observation text not null check (length(btrim(observation)) > 0),
  -- One concrete, additive next step. Never a restriction — the same rule the
  -- plan proposals live under.
  suggestion text not null check (length(btrim(suggestion)) > 0),
  -- Optional: the one question whose answer would sharpen the model. Null when
  -- there is nothing worth asking, because a question every week is a form.
  question text,

  -- The rows this was derived from. Non-empty for the same reason it is on
  -- `insights`: a statement nobody can trace back to real data must not exist.
  evidence jsonb not null,
  -- Which model wrote it, so an odd note can be traced to where it came from.
  source text not null,

  created_at timestamptz not null default now(),

  constraint weekly_notes_evidence_is_non_empty_array check (
    jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0
  ),
  unique (profile_id, week_start)
);

create index weekly_notes_profile_week_idx
  on public.weekly_notes (profile_id, week_start desc);

alter table public.weekly_notes enable row level security;

-- The same four policies every other table gets. Written out rather than
-- generated, so a reader can see exactly what is allowed without chasing a
-- helper — and so verify_rls_isolation.sql has something real to check.
create policy weekly_notes_select on public.weekly_notes
  for select using (profile_id = auth.uid());
create policy weekly_notes_insert on public.weekly_notes
  for insert with check (profile_id = auth.uid());
create policy weekly_notes_update on public.weekly_notes
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy weekly_notes_delete on public.weekly_notes
  for delete using (profile_id = auth.uid());
