-- Where the model's contribution to a plan is kept.
--
-- On the goal rather than on the plan, because it is an *input* to planning
-- (ADR-041), not an output of it. A plan can then be regenerated from the same
-- rows and come out identical — which is the property ADR-037 rests on and the
-- reason none of this needs a second source of truth.
--
-- It also means the model is asked once per goal, not once per week: the
-- proposal does not change because a Monday arrived, and nobody pays for a
-- call that would return the same thing.

alter table public.goals
  add column ai_proposal jsonb,
  -- Distinguishes "not asked yet" from "asked, and there was no answer". The
  -- second is a normal outcome — no key, a refusal, a failed plausibility
  -- check — and the app must not keep retrying it on every page load.
  add column ai_proposal_at timestamptz;

alter table public.goals
  add constraint goals_ai_proposal_is_object
    check (ai_proposal is null or jsonb_typeof(ai_proposal) = 'object');
