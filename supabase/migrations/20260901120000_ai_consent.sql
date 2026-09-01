-- Explicit consent before anything personal reaches a model provider.
--
-- Health data is a special category under Art. 9 DSGVO: processing is
-- forbidden unless an exception applies, and for a consumer app the realistic
-- exception is explicit consent, Art. 9 (2) (a). "Explicit" rules out an
-- implied yes — no pre-ticked box, no consent buried in terms nobody opens.
--
-- Two columns rather than a boolean, on purpose:
--
--   * A timestamp is the evidence. Art. 7 (1) puts the burden of proof on the
--     controller: the question is never "is it on" but "when did this person
--     agree, and to what". A boolean answers neither.
--   * A version, because what they agreed to can change. Swapping the provider
--     or sending materially more data makes the old consent about something
--     else, and comparing against the current version is what turns that into
--     "ask again" instead of a silent widening.
--
-- Null means never asked, and never asked means the deterministic path — which
-- is a real product, not a degraded one. That is what makes this consent free
-- in the sense Art. 7 (4) requires: refusing costs the AI, not the app.
alter table public.profiles
  add column ai_consent_at timestamptz,
  add column ai_consent_version smallint;

comment on column public.profiles.ai_consent_at is
  'When this person explicitly agreed to AI processing. Null = never agreed = no AI call is made.';
comment on column public.profiles.ai_consent_version is
  'Which version of the consent text they saw. A bump means asking again rather than assuming.';

-- Both together or neither. A timestamp without a version cannot be checked
-- against the current text, and a version without a timestamp is not consent.
alter table public.profiles
  add constraint profiles_ai_consent_is_complete check (
    (ai_consent_at is null and ai_consent_version is null)
    or (ai_consent_at is not null and ai_consent_version is not null)
  );
