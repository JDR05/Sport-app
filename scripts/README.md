Entwicklungs-, Seed- und Testskripte.

| Datei | Zweck |
| --- | --- |
| `verify-local.sh` | Startet ein Wegwerf-Postgres, wendet alle Migrations an und führt die Schemaprüfung aus. Berührt kein gehostetes Supabase-Projekt. |
| `local_supabase_stub.sql` | Bildet lokal nach, was die Migrations von Supabase erwarten: `auth.users`, `auth.uid()`, die Rollen `anon`/`authenticated` und die Default-Grants. |
| `verify_schema.sql` | Die eigentlichen Prüfungen — 13 Assertions zu RLS, Policies, Constraints und Kaskaden. Läuft lokal wie auch gegen ein gehostetes Projekt. |

```bash
bash scripts/verify-local.sh
```
