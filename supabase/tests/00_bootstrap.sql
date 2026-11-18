-- Test-harness bootstrap for the bare supabase/postgres image (no storage-api
-- container). Creates the minimal storage objects the migrations reference.
-- NOT a migration — only used by scripts/db-test.sh.
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id), name text
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
