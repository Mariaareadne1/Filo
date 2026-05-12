-- ============================================================
-- Photo upload to Supabase Storage
-- ============================================================
-- Adds pin-level photo support:
--   1. pins.photo_url column (nullable) — each pin can carry the
--      uploader's own photo. The shared places.photo_url stays as a
--      fallback for pins that don't upload anything.
--   2. pin-photos storage bucket (public read, owner-scoped write).
--   3. RLS policies on storage.objects gated by the path's first
--      folder matching auth.uid().
--   4. get_friends_feed updated to COALESCE the pin photo over the
--      place photo so feed cards prefer the user's own shot.
--
-- This migration was applied via the Supabase dashboard before being
-- committed; it is preserved here for version control. Re-running is
-- safe: every statement uses IF NOT EXISTS / ON CONFLICT / OR REPLACE.
-- ============================================================


-- ─── 1. pins.photo_url ─────────────────────────────────────────────
-- Nullable, no default. Existing rows remain NULL; new pins without
-- an uploaded photo also stay NULL.
ALTER TABLE pins
  ADD COLUMN IF NOT EXISTS photo_url text;


-- ─── 2. Storage bucket ─────────────────────────────────────────────
-- Public so objects are reachable via getPublicUrl() without a signed
-- token. Authenticated write is gated by the policies below.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pin-photos', 'pin-photos', true)
ON CONFLICT (id) DO NOTHING;


-- ─── 3. Storage RLS ────────────────────────────────────────────────
-- Path convention: pin-photos/{user_id}/{pin_id}.jpg
--
-- storage.foldername(name) returns the path split by '/' as text[];
-- [1] is the top folder, which we require to equal the caller's uid.
-- The explicit SELECT policy makes the public-read intent durable
-- against future bucket-flag changes.

-- Public read
DROP POLICY IF EXISTS "pin-photos public read" ON storage.objects;
CREATE POLICY "pin-photos public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'pin-photos');

-- Authenticated insert into own folder
DROP POLICY IF EXISTS "pin-photos own folder insert" ON storage.objects;
CREATE POLICY "pin-photos own folder insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pin-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated update (retry uploads via upsert: true hit UPDATE on
-- path collision)
DROP POLICY IF EXISTS "pin-photos own folder update" ON storage.objects;
CREATE POLICY "pin-photos own folder update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'pin-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated delete in own folder
DROP POLICY IF EXISTS "pin-photos own folder delete" ON storage.objects;
CREATE POLICY "pin-photos own folder delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pin-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ─── 4. get_friends_feed — prefer pin photo over place photo ───────
-- COALESCE so the user's own shot wins; falls back to the venue's
-- shared photo when the pin row has no uploaded photo.
CREATE OR REPLACE FUNCTION get_friends_feed(p_user_id uuid)
RETURNS TABLE (
  pin_id       uuid,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  place_id     uuid,
  place_name   text,
  category     text,
  address      text,
  lat          float,
  lng          float,
  photo_url    text,
  status       text,
  impression   text,
  created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.id          AS pin_id,
    u.id          AS user_id,
    u.username,
    u.display_name,
    u.avatar_url,
    pl.id         AS place_id,
    pl.name       AS place_name,
    pl.category,
    pl.address,
    pl.lat,
    pl.lng,
    COALESCE(p.photo_url, pl.photo_url) AS photo_url,
    p.status,
    p.impression,
    p.created_at
  FROM pins p
  JOIN users  u  ON u.id  = p.user_id
  JOIN places pl ON pl.id = p.place_id
  WHERE
    p.is_public = true
    AND p.user_id IN (
      SELECT following_id
      FROM follows
      WHERE follower_id = p_user_id
        AND status = 'active'
    )
  ORDER BY p.created_at DESC
  LIMIT 50;
$$;
