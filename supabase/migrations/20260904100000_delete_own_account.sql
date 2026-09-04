-- Erasure, as a right rather than a support request.
--
-- Article 17 GDPR is not a feature somebody may or may not build: a person can
-- demand their data be gone, and for an app processing health data under
-- Article 9 there is no version of "write us an email" that is good enough.
-- Until now this app had no way to delete an account at all.
--
-- Everything in `public` already cascades from `profiles`, and `profiles`
-- cascades from `auth.users`, so removing the auth row removes all of it. The
-- problem is that removing an auth row needs elevated rights, and ADR-034
-- deliberately keeps the service key out of the deployment — RLS is the
-- security model, and a service key in the app is a key that bypasses it.
--
-- A `security definer` function is the resolution and not a loophole. The
-- elevated rights live *inside the database*, are reachable only through this
-- one function, and the function takes no parameters: it can delete the caller
-- and nothing else. There is no argument to tamper with and no id to guess.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
-- Pinned, and this is the part that makes `security definer` safe. Without it
-- a caller who can create objects could shadow `auth.users` with their own
-- table and have this function run against that instead, with the owner's
-- rights. `pg_temp` last is the same rule for temporary objects.
set search_path = public, auth, pg_temp
as $$
declare
  caller uuid := auth.uid();
begin
  -- No session, no deletion. `auth.uid()` is null for the anon role, and
  -- without this the function would be an unauthenticated no-op at best and a
  -- confusing error at worst.
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- One statement, because every table in `public` hangs off this row by
  -- `on delete cascade`. Deleting them individually would be a list that has
  -- to be maintained, and the day somebody adds a table and forgets it is the
  -- day an erasure quietly leaves health data behind.
  delete from auth.users where id = caller;
end;
$$;

-- Nobody but a signed-in user, and never the anonymous role.
revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Deletes the calling user and, by cascade, every row belonging to them. Takes no parameters on purpose: it can only ever delete auth.uid().';
