-- The app asking, unprompted.
--
-- There is one place where the model already asks rather than answers, and it
-- fires exactly once: after the intake, before the first plan (ADR-084). After
-- that the app never asks anything again. Everything it learns from then on it
-- has to infer from ticks — so a person's actual life reaches it only if they
-- think to type it in, and the product owner named that precisely: "das stört
-- mich so arg, dass man alles selber aus dem Arsch ziehen muss".
--
-- This table is the app taking an interest. One question at a time, about the
-- week that actually happened, with tappable answers, and the answer goes
-- straight into what the plan is built from.
--
-- Two things are enforced here rather than trusted to the application, because
-- both are the difference between an app that is interested and one that
-- interrogates:
--
--   * At most ONE open question per person, ever. The partial unique index is
--     the check — two requests arriving together cannot leave somebody with a
--     queue of questions to work through.
--   * A question is either open or resolved, and resolved means somebody
--     touched it. "Answered" and "skipped" are both resolutions and are kept
--     apart: skipping is information, the same way `unknown` is everywhere
--     else in this product.
create table public.app_questions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,

  -- The local day, from the client's clock like every other date here.
  asked_on date not null,

  question text not null check (length(btrim(question)) > 0 and length(question) <= 200),
  -- What the answer would change about the plan. Shown with the question: a
  -- question whose purpose is invisible reads as a form, and a form is the one
  -- thing this app may not feel like.
  why text not null check (length(btrim(why)) > 0 and length(why) <= 200),
  -- Up to four tappable answers. This is a phone.
  options jsonb not null default '[]'::jsonb,

  -- Null while open, and null on a skip. `skipped` tells the two apart.
  answer text check (answer is null or length(answer) <= 300),
  skipped boolean not null default false,
  answered_on date,

  source text not null,
  created_at timestamptz not null default now(),

  constraint app_questions_options_is_array check (jsonb_typeof(options) = 'array'),
  -- Resolved exactly when somebody touched it. Without this a row could carry
  -- an answer and still count as open, which is the state that would let the
  -- app ask the same thing twice.
  constraint app_questions_resolution_is_consistent check (
    (answered_on is null and answer is null and not skipped)
    or (answered_on is not null and (answer is not null or skipped))
  )
);

-- One open question, or none. The rule that keeps this from becoming an
-- interview.
create unique index app_questions_one_open_per_profile
  on public.app_questions (profile_id)
  where answered_on is null;

create index app_questions_profile_asked_idx
  on public.app_questions (profile_id, asked_on desc);

alter table public.app_questions enable row level security;

-- The same four policies every other table gets. Written out rather than
-- generated, so a reader can see exactly what is allowed without chasing a
-- helper — and so verify_rls_isolation.sql has something real to check.
create policy app_questions_select on public.app_questions
  for select using (profile_id = auth.uid());
create policy app_questions_insert on public.app_questions
  for insert with check (profile_id = auth.uid());
create policy app_questions_update on public.app_questions
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy app_questions_delete on public.app_questions
  for delete using (profile_id = auth.uid());
