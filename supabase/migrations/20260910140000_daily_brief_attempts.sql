-- Telling "the model said nothing" apart from "the call did not work".
--
-- Both were written as the same row, and that was wrong in whichever direction
-- you pick. Storing nothing on a failure means every further open of Today
-- calls the provider again — pull-to-refresh and a tab switch are page loads,
-- so a provider having a bad afternoon gets hammered. Storing silence means one
-- hiccup costs the whole day, which is exactly the "die KI verschwindet"
-- complaint this feature exists to answer.
--
-- The first day it ran in production it was the second of those: every call
-- came back invalid_json because the model wrapped its object in prose, and the
-- day went quiet on the strength of a parser problem.
--
-- So the row now records how many attempts have failed. Zero means the model
-- answered — including when it answered "nothing to say", which is a real
-- answer and final. Above zero means nobody has heard from it yet, and the next
-- load may try again until the ceiling.
alter table public.daily_briefs
  add column attempts smallint not null default 0;

comment on column public.daily_briefs.attempts is
  'Failed calls for this day. 0 = the model answered (silence included). >0 = retryable until the app''s ceiling.';

alter table public.daily_briefs
  add constraint daily_briefs_attempts_is_sane check (attempts >= 0 and attempts <= 10);

-- A brief that says something came from an answer, by definition.
alter table public.daily_briefs
  add constraint daily_briefs_speech_had_no_failure check (
    not has_something_to_say or attempts = 0
  );
