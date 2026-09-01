Entwicklungs-, Seed- und Testskripte.

| Datei | Zweck |
| --- | --- |
| `verify-local.sh` | Startet ein Wegwerf-Postgres, wendet alle Migrations an und führt die Schemaprüfung aus. Berührt kein gehostetes Supabase-Projekt. |
| `local_supabase_stub.sql` | Bildet lokal nach, was die Migrations von Supabase erwarten: `auth.users`, `auth.uid()`, die Rollen `anon`/`authenticated` und die Default-Grants. |
| `verify_schema.sql` | Die eigentlichen Prüfungen — 13 Assertions zu RLS, Policies, Constraints und Kaskaden. Läuft lokal wie auch gegen ein gehostetes Projekt. |

```bash
bash scripts/verify-local.sh
```

## verify_rls_isolation.sql

Mandantentrennung an einer echten Datenbank: zwei Nutzer, alle 13 Tabellen, lesend **und**
schreibend. `verify_schema.sql` beweist, dass die Policies da sind — dieses Skript beweist,
dass sie halten.

```bash
psql "$LOCAL_URL" -f scripts/verify_rls_isolation.sql
```

Gegen das gehostete Projekt: in den Supabase-SQL-Editor einfügen. Läuft komplett in einer
Transaktion mit `rollback` und ist damit auch gegen eine Datenbank mit echten Daten sicher.

Nach jeder Migration, die eine Policy berührt, erneut laufen lassen. Die letzte Zeile nennt
die Zahl der Fehler; alles außer `0` ist ein Befund.
