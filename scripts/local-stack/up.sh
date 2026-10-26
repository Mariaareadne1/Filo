#!/usr/bin/env bash
# Local Supabase-compatible stack built only from images already on disk
# (for machines where `supabase start` can't pull). Dev-only credentials.
#   bash scripts/local-stack/up.sh     → API on http://127.0.0.1:55321
#   Mailpit (OTP emails) UI/API on http://127.0.0.1:55025
set -euo pipefail
cd "$(dirname "$0")/../.."
SECRET="${FILO_LOCAL_JWT_SECRET:-filo-local-dev-jwt-secret-not-for-production-use}"
ANON="$1"; SERVICE="$2"
NET=filo-net
PG=public.ecr.aws/supabase/postgres:17.6.1.143
docker network create $NET >/dev/null 2>&1 || true
for c in filo-db filo-auth filo-rest filo-storage filo-mail; do docker rm -f $c >/dev/null 2>&1 || true; done

docker run -d --name filo-db --network $NET -p 55432:5432 -e POSTGRES_PASSWORD=postgres $PG >/dev/null
until docker exec filo-db pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 3
docker exec -i filo-db psql -q -U supabase_admin -d postgres <<SQL
ALTER ROLE authenticator WITH PASSWORD 'postgres';
ALTER ROLE supabase_auth_admin WITH PASSWORD 'postgres';
ALTER ROLE supabase_storage_admin WITH PASSWORD 'postgres';
SQL

docker run -d --name filo-mail --network $NET -p 55025:8025 public.ecr.aws/supabase/mailpit:v1.30.2 >/dev/null

docker run -d --name filo-storage --network $NET -p 55500:5000 \
  -e ANON_KEY="$ANON" -e SERVICE_KEY="$SERVICE" -e AUTH_JWT_SECRET="$SECRET" -e AUTH_JWT_ALGORITHM=HS256 \
  -e PGRST_JWT_SECRET="$SECRET" \
  -e DATABASE_URL=postgres://supabase_storage_admin:postgres@filo-db:5432/postgres \
  -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage -e FILE_SIZE_LIMIT=52428800 \
  -e TENANT_ID=stub -e STORAGE_S3_REGION=stub -e REGION=stub -e GLOBAL_S3_BUCKET=stub \
  -e ENABLE_IMAGE_TRANSFORMATION=false \
  public.ecr.aws/supabase/storage-api:v1.66.4 >/dev/null

docker run -d --name filo-auth --network $NET -p 55999:9999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:55321/auth/v1 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:postgres@filo-db:5432/postgres \
  -e GOTRUE_SITE_URL=filo:// -e GOTRUE_URI_ALLOW_LIST='filo://**' \
  -e GOTRUE_JWT_SECRET="$SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=false \
  -e GOTRUE_MAILER_OTP_EXP=3600 -e GOTRUE_MAILER_OTP_LENGTH=6 \
  -e GOTRUE_SMTP_HOST=filo-mail -e GOTRUE_SMTP_PORT=1025 -e GOTRUE_SMTP_ADMIN_EMAIL=admin@filo.local \
  -e GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://host.docker.internal:55321/templates/otp.html \
  -e GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://host.docker.internal:55321/templates/otp.html \
  -e GOTRUE_MAILER_SUBJECTS_CONFIRMATION='Your Filo code' -e GOTRUE_MAILER_SUBJECTS_MAGIC_LINK='Your Filo code' \
  -e GOTRUE_SMTP_SENDER_NAME=Filo -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 -e GOTRUE_SMTP_MAX_FREQUENCY=1s \
  public.ecr.aws/supabase/gotrue:v2.193.0 >/dev/null

# Wait for GoTrue + Storage to run their own migrations, then apply ours.
until curl -sf http://127.0.0.1:55999/health >/dev/null; do sleep 1; done
until docker exec filo-db psql -U supabase_admin -d postgres -Atc "select to_regclass('storage.buckets')" | grep -q buckets; do sleep 1; done
for f in supabase/migrations/*.sql; do docker exec -i filo-db psql -q -1 -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < "$f" >/dev/null; done
# Local dev stack also allows the test inbox domain used by scripts/local-stack/seed.
docker exec filo-db psql -q -U supabase_admin -d postgres -c "insert into auth_allowed_domains(domain) values ('filo.test') on conflict do nothing;"

docker run -d --name filo-rest --network $NET -p 55300:3000 \
  -e PGRST_DB_URI=postgres://authenticator:postgres@filo-db:5432/postgres -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" -e PGRST_DB_USE_LEGACY_GUCS=false \
  public.ecr.aws/supabase/postgrest:v14.15 >/dev/null
until curl -sf http://127.0.0.1:55300/ >/dev/null; do sleep 1; done
echo "local stack up: api http://127.0.0.1:55321 (run gateway.mjs), mail http://127.0.0.1:55025"
