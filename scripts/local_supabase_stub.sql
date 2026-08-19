-- Local-only stub that mirrors the parts of Supabase the migrations depend on.
-- Never applied to a hosted project: there, auth and the roles already exist.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique
);

-- Mirrors Supabase's auth.uid(): reads the subject claim of the request JWT.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated;

-- Supabase configures these as default privileges; locally we set them so that
-- `set role authenticated` behaves the same way as it does on a hosted project.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
