-- Time that is already spent.
--
-- The schedule knew only about time a person offered. Everything else looked
-- like an empty week, so the planner put sessions into hours that were never
-- free — and, the case that actually came up, a second training session on the
-- evening someone already plays football.
--
-- Stored as JSON next to free_slots, and for the same reason: a commitment is
-- read as a whole or not at all, never joined against, and the shape is
-- validated in TypeScript before it is written.
alter table public.schedules
  add column commitments jsonb not null default '[]'::jsonb;

alter table public.schedules
  add constraint schedules_commitments_is_array check (jsonb_typeof(commitments) = 'array');
