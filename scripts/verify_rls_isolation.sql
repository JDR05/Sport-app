-- Two users, thirteen tables, read and write.
--
-- verify_schema.sql proves the policies exist. This proves they *hold* — that
-- one person cannot reach another's health data by any route the database
-- offers. It was written for the moment before the app went public, and it is
-- a file rather than a one-off session so it can be run again after every
-- migration that touches a policy.
--
-- Runs entirely inside a transaction that rolls back. Safe against a database
-- with real data in it; the last query proves nothing was left behind.
--
--   Local:  psql "$LOCAL_URL" -f scripts/verify_rls_isolation.sql
--   Hosted: paste into the Supabase SQL editor, or run via the MCP tool.
--
-- The two control checks matter more than the isolation checks:
--
--   * `impersonierung_greift` — if `set local request.jwt.claims` silently did
--     nothing, auth.uid() would be null, every "sees nothing" below would be
--     vacuously true, and this file would report a pass while proving nothing.
--   * `sieht_sich_selbst` and the Gegenproben — RLS that blocks *everything*
--     also passes an isolation test, and would mean an app that cannot read
--     its own rows. A security test without those is half a test.

begin;

-- --------------------------------------------------------------- fixtures --
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@rls.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@rls.test');

insert into public.profiles (id) values
  ('aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000002');

insert into public.schedules (profile_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000002');

insert into public.goals (id, profile_id, raw_text) values
  ('a0000000-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','Ziel von A'),
  ('b0000000-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','Ziel von B');

insert into public.plans (id, profile_id, goal_id, week_start, strategy) values
  ('a1000000-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000a','2026-09-07','{}'),
  ('b1000000-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','b0000000-0000-4000-8000-00000000000b','2026-09-07','{}');

insert into public.plan_items (plan_id, profile_id, scheduled_on, domain, title) values
  ('a1000000-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','2026-09-07','training','Aktion A'),
  ('b1000000-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','2026-09-07','training','Aktion B');

insert into public.goal_metrics (goal_id, profile_id, metric_key, start_value, target_value, unit) values
  ('a0000000-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','weight_kg',80,75,'kg'),
  ('b0000000-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','weight_kg',90,85,'kg');

insert into public.constraints (profile_id, kind, value) values
  ('aaaaaaaa-0000-4000-8000-000000000001','time','{}'),
  ('bbbbbbbb-0000-4000-8000-000000000002','time','{}');

insert into public.check_ins (profile_id, checked_in_on, note) values
  ('aaaaaaaa-0000-4000-8000-000000000001','2026-09-07','A privat'),
  ('bbbbbbbb-0000-4000-8000-000000000002','2026-09-07','B privat');

insert into public.measurements (profile_id, metric_key, metric_class, value, unit) values
  ('aaaaaaaa-0000-4000-8000-000000000001','weight_kg','outcome',80,'kg'),
  ('bbbbbbbb-0000-4000-8000-000000000002','weight_kg','outcome',90,'kg');

insert into public.personal_rules (profile_id, rule_key, rule_value, confidence) values
  ('aaaaaaaa-0000-4000-8000-000000000001','avoid_weekday','{"weekday":"wed"}',0.6),
  ('bbbbbbbb-0000-4000-8000-000000000002','avoid_weekday','{"weekday":"mon"}',0.6);

insert into public.insights (profile_id, kind, statement, evidence) values
  ('aaaaaaaa-0000-4000-8000-000000000001','pattern','Muster A','[{"x":1}]'),
  ('bbbbbbbb-0000-4000-8000-000000000002','pattern','Muster B','[{"x":1}]');

insert into public.experiments (id, profile_id, goal_id, hypothesis, variable, change_description, baseline, metric_key, start_date, end_date) values
  ('a2000000-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','a0000000-0000-4000-8000-00000000000a','H A','time_slot','C A','{}','completion_rate','2026-09-07','2026-09-21'),
  ('b2000000-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','b0000000-0000-4000-8000-00000000000b','H B','time_slot','C B','{}','completion_rate','2026-09-07','2026-09-21');

insert into public.experiment_results (experiment_id, profile_id, metric, metric_class, baseline_value, observed_value, decision) values
  ('a2000000-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','completion_rate','behavior',0.5,0.7,'keep'),
  ('b2000000-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','completion_rate','behavior',0.5,0.7,'keep');

insert into public.weekly_notes (profile_id, week_start, observation, suggestion, evidence, source) values
  ('aaaaaaaa-0000-4000-8000-000000000001','2026-09-07','Beobachtung A','Vorschlag A','["item.a"]','test'),
  ('bbbbbbbb-0000-4000-8000-000000000002','2026-09-07','Beobachtung B','Vorschlag B','["item.b"]','test');

create temp table ergebnis (nr int, pruefung text, ausgang text, erwartet text);
grant all on ergebnis to authenticated, anon;

-- ------------------------------------------------------ A liest, alle 13 --
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

insert into ergebnis values
  (1,'Impersonierung greift', (auth.uid() = 'aaaaaaaa-0000-4000-8000-000000000001')::text, 'true'),
  (2,'A sieht eigenes Profil', (select count(*) from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001')::text, '1'),
  (3,'A sieht Profil B', (select count(*) from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (4,'A sieht Ziele B', (select count(*) from public.goals where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (5,'A sieht Plaene B', (select count(*) from public.plans where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (6,'A sieht Aktionen B', (select count(*) from public.plan_items where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (7,'A sieht Metriken B', (select count(*) from public.goal_metrics where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (8,'A sieht Constraints B', (select count(*) from public.constraints where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (9,'A sieht Schedule B', (select count(*) from public.schedules where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (10,'A sieht Check-ins B', (select count(*) from public.check_ins where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (11,'A sieht Messungen B', (select count(*) from public.measurements where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (12,'A sieht Regeln B', (select count(*) from public.personal_rules where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (13,'A sieht Insights B', (select count(*) from public.insights where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (14,'A sieht Experimente B', (select count(*) from public.experiments where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (15,'A sieht Ergebnisse B', (select count(*) from public.experiment_results where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (16,'A sieht Bs Notiztext', (select coalesce(string_agg(note,','),'nichts') from public.check_ins where note = 'B privat'), 'nichts'),
  (37,'A sieht Wochenimpuls B', (select count(*) from public.weekly_notes where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002')::text, '0'),
  (38,'Gegenprobe: A sieht eigenen Wochenimpuls', (select count(*) from public.weekly_notes where profile_id = 'aaaaaaaa-0000-4000-8000-000000000001')::text, '1');

-- ------------------------------------------------------------ A schreibt --
do $$
declare n int;
begin
  begin
    insert into public.goals (profile_id, raw_text)
      values ('bbbbbbbb-0000-4000-8000-000000000002','von A untergeschoben');
    insert into ergebnis values (17,'INSERT auf fremde profile_id','durchgelassen','abgewiesen');
  exception when others then
    insert into ergebnis values (17,'INSERT auf fremde profile_id','abgewiesen','abgewiesen');
  end;

  update public.goals set raw_text = 'gekapert' where id = 'b0000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  insert into ergebnis values (18,'UPDATE fremdes Ziel', n::text, '0');

  delete from public.check_ins where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  insert into ergebnis values (19,'DELETE fremder Check-in', n::text, '0');

  -- Der subtile Fall: eigene Zeile behalten, aber jemand anderem zuschieben.
  -- Eine UPDATE-Policy ohne WITH CHECK laesst genau das durch.
  begin
    update public.goals set profile_id = 'bbbbbbbb-0000-4000-8000-000000000002'
      where id = 'a0000000-0000-4000-8000-00000000000a';
    get diagnostics n = row_count;
    insert into ergebnis values (20,'UPDATE eigene Zeile auf fremden Besitzer',
      case when n = 0 then 'abgewiesen' else 'durchgelassen' end, 'abgewiesen');
  exception when others then
    insert into ergebnis values (20,'UPDATE eigene Zeile auf fremden Besitzer','abgewiesen','abgewiesen');
  end;

  -- Gegenproben: RLS, die alles blockt, besteht jeden Isolationstest — und
  -- waere eine App, die ihre eigenen Zeilen nicht lesen kann.
  update public.goals set raw_text = 'A aendert eigenes Ziel'
    where id = 'a0000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  insert into ergebnis values (21,'Gegenprobe: UPDATE eigenes Ziel', n::text, '1');

  begin
    insert into public.goals (profile_id, raw_text, status)
      values ('aaaaaaaa-0000-4000-8000-000000000001','A legt zweites Ziel an','paused');
    insert into ergebnis values (22,'Gegenprobe: INSERT eigenes Ziel','erlaubt','erlaubt');
  exception when others then
    insert into ergebnis values (22,'Gegenprobe: INSERT eigenes Ziel','blockiert','erlaubt');
  end;

  -- Produktregel, nicht RLS: ein aktives Ziel pro Profil. Steht hier, weil ein
  -- frueherer Lauf den 23505 dieses Index faelschlich fuer einen RLS-Fehler
  -- hielt — die Fehlerklasse ist Teil des Ergebnisses, nicht nur das Scheitern.
  begin
    insert into public.goals (profile_id, raw_text, status)
      values ('aaaaaaaa-0000-4000-8000-000000000001','zweites aktives Ziel','active');
    insert into ergebnis values (23,'Zweites AKTIVES Ziel','durchgelassen','abgewiesen');
  exception when unique_violation then
    insert into ergebnis values (23,'Zweites AKTIVES Ziel','abgewiesen','abgewiesen');
  end;

  -- Einwilligung. Sie entscheidet, ob Gesundheitsdaten das Haus verlassen, also
  -- ist "kann A sie fuer B setzen" keine gewoehnliche Spaltenpruefung: ein
  -- Durchkommen hier hiesse, dass jemand fremdes Einverstaendnis erklaeren
  -- kann. Der Code prueft ausserdem selbst auf user.id — das hier prueft, dass
  -- die Datenbank es auch ohne den Code haelt.
  update public.profiles
     set ai_consent_at = now(), ai_consent_version = 1
   where id = 'bbbbbbbb-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  insert into ergebnis values (32,'A erteilt Einwilligung fuer B', n::text, '0');

  update public.profiles
     set ai_consent_at = now(), ai_consent_version = 1
   where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  insert into ergebnis values (33,'Gegenprobe: A erteilt eigene Einwilligung', n::text, '1');

  -- Zuruecknehmen muss so leicht sein wie Erteilen (Art. 7 Abs. 3). Wenn der
  -- Widerruf an RLS scheitert, waere die Einwilligung unwiderruflich.
  update public.profiles
     set ai_consent_at = null, ai_consent_version = null
   where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  insert into ergebnis values (34,'Gegenprobe: A widerruft eigene Einwilligung', n::text, '1');

  -- Haelt der Check-Constraint? Ein Zeitstempel ohne Version liesse sich nicht
  -- gegen CONSENT_VERSION pruefen und wuerde stillschweigend als gueltig gelten.
  begin
    update public.profiles set ai_consent_at = now(), ai_consent_version = null
     where id = 'aaaaaaaa-0000-4000-8000-000000000001';
    insert into ergebnis values (35,'Halbe Einwilligung','durchgelassen','abgewiesen');
  exception when check_violation then
    insert into ergebnis values (35,'Halbe Einwilligung','abgewiesen','abgewiesen');
  end;
end $$;

-- ------------------------------------------------- Symmetrie: B schaut zu --
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
insert into ergebnis
  select 24,'B sieht eigene Check-ins', count(*)::text, '1' from public.check_ins
   where profile_id = 'bbbbbbbb-0000-4000-8000-000000000002';
insert into ergebnis
  select 25,'B sieht As Check-ins', count(*)::text, '0' from public.check_ins
   where profile_id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into ergebnis
  select 26,'B sieht As Notiztext', coalesce(string_agg(note,','),'nichts'), 'nichts'
    from public.check_ins where note = 'A privat';

-- --------------------------------------------------- Gar nicht angemeldet --
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into ergebnis select 27,'Anonym sieht Profile', count(*)::text, '0' from public.profiles;
insert into ergebnis select 28,'Anonym sieht Ziele', count(*)::text, '0' from public.goals;
insert into ergebnis select 29,'Anonym sieht Check-ins', count(*)::text, '0' from public.check_ins;
insert into ergebnis select 30,'Anonym sieht Aktionen', count(*)::text, '0' from public.plan_items;
insert into ergebnis select 31,'Anonym sieht Messungen', count(*)::text, '0' from public.measurements;
insert into ergebnis select 36,'Anonym sieht Wochenimpulse', count(*)::text, '0' from public.weekly_notes;

reset role;
select nr, pruefung, ausgang, erwartet,
       case when ausgang = erwartet then 'OK' else 'FEHLER' end as urteil
  from ergebnis order by nr;

select count(*) filter (where ausgang <> erwartet) as fehler,
       count(*) as pruefungen
  from ergebnis;

rollback;
