#!/usr/bin/env bash
# Replays every migration on a throwaway Postgres (Supabase image) and runs
# the SQL test suites in supabase/tests. No network or Supabase project needed.
#   npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
IMAGE="${FILO_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.143}"
NAME=filo-db-test
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 3
psql_run() { docker exec -i "$NAME" psql -q -1 -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }
psql_run < supabase/tests/00_bootstrap.sql
for f in supabase/migrations/*.sql; do
  ts="$(basename "$f" | cut -d_ -f1)"
  fixture="supabase/tests/fixtures/before_${ts}.sql"
  if [ -f "$fixture" ]; then echo "fixture  $(basename "$fixture")"; psql_run < "$fixture"; fi
  echo "migrate  $(basename "$f")"
  psql_run < "$f"
done
echo "re-apply (idempotency check)"
for f in supabase/migrations/*.sql; do psql_run < "$f" >/dev/null; done
for t in supabase/tests/[1-9]*.sql; do
  echo "test     $(basename "$t")"
  psql_run < "$t"
done
echo "ALL DB TESTS PASSED"
