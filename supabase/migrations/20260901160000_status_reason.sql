-- Why, not just what.
--
-- Marking an action "nicht geschafft" was a dead end: the status was stored
-- and nothing happened. That is the most information-rich moment this app ever
-- gets — the person is present, has just said something true about their week,
-- and is open to exactly one question — and the app was silent through it.
--
-- Worse, it then guessed at the reason afterwards, from weekdays and time
-- slots. Detection reading "three Wednesdays missed" and concluding Wednesdays
-- are hard is a guess; the person answering "zu müde" three times is a fact.
-- The difference between recognising a pattern and knowing someone.
--
-- A code rather than free text, with free text beside it. The code is what the
-- deterministic reaction acts on — a plan change must never depend on parsing a
-- sentence — while the note is what the weekly impulse reads, the same way it
-- reads check-in notes.
alter table public.plan_items
  add column status_reason text,
  add column status_note text;

comment on column public.plan_items.status_reason is
  'Why this status was chosen. One of the codes in STATUS_REASONS; null when nobody said.';

alter table public.plan_items
  add constraint plan_items_status_reason_is_known check (
    status_reason is null or status_reason in (
      'no_time', 'too_tired', 'no_desire', 'away', 'unwell', 'too_much', 'other'
    )
  );

-- A reason with no status change behind it is a fragment. `unknown` is the
-- untouched state, so nothing can carry a reason while claiming nobody looked.
alter table public.plan_items
  add constraint plan_items_reason_needs_a_verdict check (
    status_reason is null or status <> 'unknown'
  );

alter table public.plan_items
  add constraint plan_items_note_is_short check (
    status_note is null or length(status_note) <= 300
  );
