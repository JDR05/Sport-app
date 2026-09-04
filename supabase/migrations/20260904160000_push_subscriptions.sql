-- Reminders, so the app stops waiting to be remembered.
--
-- The check-in is where the behaviour model gets its data, and somebody who
-- does not think of the app in the evening records nothing — so it learns
-- nothing, so it gets worse, so they think of it even less. That loop is the
-- single largest thing between this app and being used, and it costs no new
-- data category: a push subscription is an endpoint, not a fact about a person.
--
-- One reminder a day at most, at an hour the person chooses. No streaks, no
-- "du hast 3 Tage verpasst" — the brief rules out guilt mechanics, and a
-- notification is the easiest place in an app to break that rule.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,

  -- The push service's URL for this device. Unique because re-subscribing on
  -- the same device returns the same endpoint, and two rows would mean two
  -- notifications for one tap.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,

  -- Local hour, 0-23. Stored with the zone rather than as UTC: the person means
  -- "20:00 for me", and a stored UTC hour silently drifts an hour twice a year.
  remind_hour smallint not null default 20,
  time_zone text not null default 'Europe/Berlin',

  -- When a reminder was last actually sent, so an hourly job cannot send twice
  -- and a person who opens the app anyway can be skipped.
  last_sent_on date,
  created_at timestamptz not null default now(),

  constraint push_hour_range check (remind_hour between 0 and 23),
  constraint push_endpoint_len check (char_length(endpoint) <= 1000),
  constraint push_zone_len check (char_length(time_zone) <= 64)
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
-- The sending job's only query: everyone due this hour who has not had one today.
create index push_subscriptions_due_idx on public.push_subscriptions (remind_hour, last_sent_on);

alter table public.push_subscriptions enable row level security;

-- The person owns their own subscriptions and nothing else.
create policy "own subscriptions" on public.push_subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

comment on table public.push_subscriptions is
  'Web push endpoints, one per device. remind_hour is local to time_zone; last_sent_on stops an hourly job sending twice.';


-- Who the sending job may see, without a service key.
--
-- Sending reminders needs to read across everybody, which RLS exists to
-- prevent. The obvious fix is the service role key — and ADR-034 keeps that out
-- of the deployment on purpose, because a key that bypasses RLS is a key that
-- bypasses the entire security model the moment it leaks.
--
-- So the elevated read lives in the database instead, in one function that:
--
--   * requires a shared secret the deployment holds and nobody else does;
--   * returns **only** what a push needs — an endpoint and its two keys. No
--     name, no goal, no health data of any kind. Even with the secret, this
--     cannot be used to read anything about anybody;
--   * returns only rows actually due, so it is not a bulk export either.
--
-- The secret lives in a table only this function reads. Compared in constant
-- time, because a timing oracle on a secret is still a leak even when the
-- payload is dull.
create table public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
-- No policy at all: nothing reaches this table through the API, ever. Only
-- `security definer` functions and the dashboard can see it.

create or replace function public.due_reminders(secret text)
returns table (endpoint text, p256dh text, auth text, profile_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected text;
begin
  select value into expected from public.app_secrets where key = 'cron_secret';

  -- No secret configured means the feature is off, not open.
  if expected is null or secret is null then
    raise exception 'not authorised' using errcode = '28000';
  end if;

  -- Constant time, so the comparison cannot be probed character by character.
  if not hmac(secret, expected, 'sha256') = hmac(expected, expected, 'sha256') then
    raise exception 'not authorised' using errcode = '28000';
  end if;

  return query
    select s.endpoint, s.p256dh, s.auth, s.profile_id
    from public.push_subscriptions s
    -- Due when the person's own local hour matches, and not already sent on
    -- their own local date. Both computed in their zone, which is why the zone
    -- is stored rather than a UTC hour.
    where extract(hour from (now() at time zone s.time_zone)) = s.remind_hour
      and (s.last_sent_on is null
           or s.last_sent_on < (now() at time zone s.time_zone)::date);
end;
$$;

revoke all on function public.due_reminders(text) from public;
revoke all on function public.due_reminders(text) from anon;
revoke all on function public.due_reminders(text) from authenticated;
grant execute on function public.due_reminders(text) to anon;

comment on function public.due_reminders(text) is
  'Endpoints due a reminder this hour. Requires the deployment secret and returns no health data of any kind — an endpoint and its keys only.';

-- Marking one as sent needs the same gate, for the same reason.
create or replace function public.mark_reminder_sent(secret text, target text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected text;
begin
  select value into expected from public.app_secrets where key = 'cron_secret';
  if expected is null or secret is null then
    raise exception 'not authorised' using errcode = '28000';
  end if;
  if not hmac(secret, expected, 'sha256') = hmac(expected, expected, 'sha256') then
    raise exception 'not authorised' using errcode = '28000';
  end if;

  update public.push_subscriptions s
     set last_sent_on = (now() at time zone s.time_zone)::date
   where s.endpoint = target;
end;
$$;

revoke all on function public.mark_reminder_sent(text, text) from public;
grant execute on function public.mark_reminder_sent(text, text) to anon;
