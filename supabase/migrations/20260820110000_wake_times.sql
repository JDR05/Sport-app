-- When the person actually has to be up, day by day.
--
-- There was already a single wake_time here, and nothing ever read it. One time
-- for the whole week cannot describe the people this app is for: a student gets
-- up at a different hour every day, shift work inverts, and the case that
-- prompted this is football until nine on Tuesday with a five o'clock alarm on
-- Wednesday.
--
-- That gap is the whole point. It is the difference between the app noticing
-- "this night is six hours whatever you do" and the app cheerfully planning
-- something else into the same evening.
--
-- Stored as an object keyed by weekday, partial on purpose: a day nobody filled
-- in is unknown, and unknown must never be read as a number.
alter table public.schedules
  add column wake_times jsonb not null default '{}'::jsonb,
  add constraint schedules_wake_times_is_object
    check (jsonb_typeof(wake_times) = 'object');

comment on column public.schedules.wake_times is
  'Partial map of weekday -> HH:MM, e.g. {"mon":"06:30"}. Missing means unknown.';

-- The old single value stays for now rather than being dropped: some rows carry
-- an answer somebody gave, and throwing that away to tidy a schema is not a
-- trade worth making. It is seeded across the week below and then ignored.
update public.schedules
set wake_times = (
  select jsonb_object_agg(d, to_char(wake_time, 'HH24:MI'))
  from unnest(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) as d
)
where wake_time is not null and wake_times = '{}'::jsonb;
