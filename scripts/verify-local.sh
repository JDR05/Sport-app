#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres and runs the schema
# verification. Nothing here touches a hosted Supabase project.
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
PGDATA=${PGDATA:-/tmp/plis-verify-pgdata}
PGPORT=${PGPORT:-55432}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -m immediate stop" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$PGDATA"
mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"

su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k /tmp' -l $PGDATA/server.log -w start" >/dev/null

export PGHOST=/tmp PGPORT PGUSER=postgres PGDATABASE=postgres

psql -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local_supabase_stub.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -f "$f"
done

psql -v ON_ERROR_STOP=1 -f "$ROOT/scripts/verify_schema.sql"
