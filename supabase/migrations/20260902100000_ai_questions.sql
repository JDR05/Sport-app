-- The person asking, rather than being asked.
--
-- Every AI call in this product so far was started by the app: classify this
-- goal, propose these actions, write this week's note, and — the one that
-- looks like an exception but is not — decide what to ask before planning.
-- All four are the app's initiative. None of them is a conversation.
--
-- This table is the other direction. Somebody types a question on Today and
-- gets an answer built from their own data, which is what makes the app a
-- counterpart rather than a form that occasionally speaks.
--
-- Stored rather than transient, for three reasons that all matter:
--
--   1. The daily limit needs something to count. Five a day is a product rule
--      (an app answering unlimited typing is the "zweiter Job" the rules
--      forbid), and a rule enforced from a variable in a browser is not a rule.
--   2. An answer that vanishes on reload is an answer nobody can act on later.
--   3. Today's earlier questions go back into the next question's context, so
--      the second one does not restate the first.
--
-- Deliberately not threaded. One question, one answer, and the day is the unit
-- — a chat history would invite the open-ended back-and-forth this feature is
-- shaped to avoid.
create table public.ai_questions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,

  -- The local day the question was asked, from the client's clock like every
  -- other date in this app: the server runs in UTC, and somebody asking at
  -- half past midnight in Berlin must not spend tomorrow's allowance.
  asked_on date not null,

  question text not null check (length(btrim(question)) > 0 and length(question) <= 300),

  -- The answer, or the honest refusal. `can_answer = false` is a real outcome,
  -- not a failure: the model saying "das steht nicht in deinen Daten" and what
  -- it would need to know is worth more than a fluent invention.
  can_answer boolean not null,
  answer text not null check (length(answer) <= 700),
  -- What it would have to know. Required precisely when it could not answer,
  -- because declining without saying what is missing is a shrug, and a shrug is
  -- what this feature exists to replace.
  needs text check (length(needs) <= 200),

  -- The rows the answer was built from. Same rule as `insights` and
  -- `weekly_notes`: a statement nobody can trace back to real data must not
  -- exist. Empty is allowed only for a refusal, which cites nothing because it
  -- claims nothing.
  evidence jsonb not null default '[]'::jsonb,
  -- Which model answered, so an odd answer can be traced to where it came from.
  source text not null,

  created_at timestamptz not null default now(),

  constraint ai_questions_evidence_is_array check (jsonb_typeof(evidence) = 'array'),
  constraint ai_questions_answer_is_grounded check (
    not can_answer or jsonb_array_length(evidence) > 0
  ),
  constraint ai_questions_refusal_says_what_is_missing check (
    can_answer or (needs is not null and length(btrim(needs)) > 0)
  )
);

-- The two reads this table gets: today's count for the allowance, and today's
-- exchanges for the screen and for the next question's context.
create index ai_questions_profile_day_idx
  on public.ai_questions (profile_id, asked_on desc, created_at desc);

alter table public.ai_questions enable row level security;

-- The same four policies every other table gets. Written out rather than
-- generated, so a reader can see exactly what is allowed without chasing a
-- helper — and so verify_rls_isolation.sql has something real to check.
create policy ai_questions_select on public.ai_questions
  for select using (profile_id = auth.uid());
create policy ai_questions_insert on public.ai_questions
  for insert with check (profile_id = auth.uid());
create policy ai_questions_update on public.ai_questions
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy ai_questions_delete on public.ai_questions
  for delete using (profile_id = auth.uid());
