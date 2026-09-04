-- Knowing that the app broke, without telling a third party about it.
--
-- Before this, a crash reached the operator only if the person mentioned it.
-- Measured: 4.4 % of generated profiles used to get "Plan nicht möglich" and
-- nobody would have known — the number came from a simulation, not from
-- production, because production could not report anything.
--
-- The usual answer is Sentry. For this app it is the wrong one. Every screen
-- here is about health data, a stack trace carries the path and often the state
-- that produced it, and session replay carries the screen itself. That means a
-- second processor, a second Art. 28 contract, and a second place where
-- Art. 9 data can end up. The operator's own database is where the data already
-- is, so reporting there adds no recipient and no contract.
--
-- What is stored is deliberately thin: what broke and where, never the values.

create table public.error_reports (
  id uuid primary key default gen_random_uuid(),

  -- Nullable, and that is the point: the most valuable crash to hear about is
  -- the one on the login screen, where there is no profile yet.
  profile_id uuid references public.profiles (id) on delete cascade,

  -- Which release. Without it, "it broke yesterday" cannot be tied to a change.
  release text,
  -- The route, never the full URL: a query string is a place user data hides.
  path text not null,
  message text not null,
  -- Truncated in the client before it gets here. A stack is for locating code,
  -- and the first frames are the ones that do that.
  stack text,
  -- Which of the app's own boundaries caught it, so a server error and a
  -- render error are not one bucket.
  source text not null,
  created_at timestamptz not null default now(),

  -- Nothing here should be long enough to hold a payload. These are limits on
  -- what can be *stored*, not just on what the client sends — a client-side cap
  -- is a suggestion.
  constraint error_reports_path_len check (char_length(path) <= 200),
  constraint error_reports_message_len check (char_length(message) <= 500),
  constraint error_reports_stack_len check (char_length(stack) <= 4000),
  constraint error_reports_source check (source in ('render', 'server', 'client'))
);

create index error_reports_recent_idx on public.error_reports (created_at desc);

alter table public.error_reports enable row level security;

-- Insert-only, and open to the anonymous role on purpose.
--
-- A crash on the sign-up screen is a crash nobody is signed in for, and those
-- are exactly the ones that cost users. The row is write-only from the client's
-- side: there is no select policy, so nobody — signed in or not — can read
-- these back through the API. The operator reads them in the dashboard.
--
-- The risk this accepts is somebody writing junk rows. The constraints above
-- bound the size, and the alternative is being blind to the failures that
-- happen before anyone has an account.
create policy "anyone may report an error"
  on public.error_reports for insert
  with check (
    -- A signed-in report must be about the person making it. An anonymous one
    -- carries no profile at all. Neither may name somebody else.
    (auth.uid() is null and profile_id is null)
    or profile_id = auth.uid()
  );

comment on table public.error_reports is
  'Crash reports from the app itself. Write-only for clients: no select policy, so nothing here can be read back through the API. Deliberately holds no user values — what broke and where, never what with.';
