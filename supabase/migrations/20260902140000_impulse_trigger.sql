-- The impulse gets an occasion.
--
-- It used to fire on Thursday, once a week, whatever had happened. That is a
-- good rhythm for reflection and a bad one for everything else: somebody gives
-- the same reason three times on Monday and Tuesday and the app sits on it
-- until Thursday, by which point the week is decided and the impulse is
-- history rather than help. Monday to Wednesday the app said nothing at all.
--
-- So `trigger` records why this one was written, and the uniqueness moves with
-- it: one impulse per *occasion* per week rather than one per week. The
-- calendar is still an occasion — 'weekly' is the old behaviour, unchanged and
-- still exactly once — but no longer the only one.
--
-- The cap is the point. Four kinds exist, each fires at most once a week, and
-- the application additionally holds two days between any two impulses. An app
-- that comments on everything is one people stop reading, and the table is
-- where that limit becomes a fact rather than a habit.
alter table public.weekly_notes
  add column trigger text not null default 'weekly';

comment on column public.weekly_notes.trigger is
  'Why this impulse was written now. One of IMPULSE_TRIGGERS; "weekly" is the calendar.';

alter table public.weekly_notes
  add constraint weekly_notes_trigger_is_known check (
    trigger in ('weekly', 'reason_repeated', 'domain_slipping', 'going_well')
  );

-- The old index said one row per week. Dropping it before adding the new one,
-- because the new one is strictly weaker and an overlapping pair would leave
-- two rules to reason about where there should be one.
alter table public.weekly_notes
  drop constraint weekly_notes_profile_id_week_start_key;

alter table public.weekly_notes
  add constraint weekly_notes_one_per_occasion unique (profile_id, week_start, trigger);
