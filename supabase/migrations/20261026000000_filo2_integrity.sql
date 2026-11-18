-- ============================================================
-- FILO 2.0 — INTEGRITY + PRIVACY FIXES — 2026-10-26
-- ============================================================
-- Fixes verified in the Filo 2.0 audit (see AUDIT.md for evidence):
--
--  1. users: every authenticated user could read every row INCLUDING
--     email and expo_push_token → column-level SELECT grants.
--  2. users: campus gate checked the email the CLIENT wrote, not the
--     authenticated email → bound to auth.email(); privileged columns
--     (email, campus, is_verified) no longer client-updatable.
--  3. follows: the follower could UPDATE their own pending request to
--     'active' (WITH CHECK allowed follower_id = uid) → only the followed
--     party may approve. Explicit accept/reject RPCs.
--  4. rankings: readable by everyone, ignoring is_private → mirrors pins.
--  5. places: no UPDATE policy, so the client's upsert ON CONFLICT DO
--     UPDATE failed for the second user to pin a venue → save_pin() RPC
--     does place-dedupe + pin upsert atomically.
--  6. Category vocabulary split (places: food|bar|… vs rankings:
--     cafes|bars|shops|…) meant rankings saved from the map never showed
--     on the Rankings screen → one vocabulary: cafe|food|bar|beauty|
--     experience|retail, enforced by CHECKs on both tables.
--  7. Google Places API key was persisted inside places.photo_url →
--     stripped; constraint prevents re-insertion.
--  8. Shared board links (/b/<token>) used the anon key against
--     authenticated-only RLS, so every share link 404'd → narrow
--     SECURITY DEFINER get_shared_board() for anon, public-only data.
--  9. share_token generated client-side with Math.random → server-side
--     CSPRNG default.
-- 10. Rankings/board ordering mutations made atomic (remove_ranking,
--     reorder_board); deleting a pin cleans its rankings.
-- 11. notify_new_follow could push to any user regardless of a follow
--     existing → requires the edge to exist.
-- 12. get_friends_feed raised "column reference status is ambiguous" on
--     EVERY call since 20260723000000 (friends map + feed broken) → fixed,
--     plus a keyset cursor and bounded page size.
--
-- Backward compatible: no table is dropped, no user rows deleted.
-- Idempotent: safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ─── 6. Unified category vocabulary ────────────────────────────────
-- Normalise existing ranking rows from the old discover vocabulary.
-- The map's "rank it" path already wrote some rows in the place vocabulary
-- ('bar', 'retail', 'experience'), so a user can hold BOTH a 'bars' and a
-- 'bar' list. Merge them: drop an old-vocab row when the same place is
-- already in the new-vocab list, defer the position constraint while the
-- lists combine, and renumber contiguously below (older position wins ties).
SET CONSTRAINTS rankings_user_id_category_position_key DEFERRED;

DELETE FROM rankings old
USING rankings cur
WHERE old.user_id = cur.user_id
  AND old.place_id = cur.place_id
  AND (old.category, cur.category) IN (('cafes','cafe'),('bars','bar'),('shops','retail'),('experiences','experience'));

UPDATE rankings SET category = 'cafe'       WHERE category = 'cafes';
UPDATE rankings SET category = 'bar'        WHERE category = 'bars';
UPDATE rankings SET category = 'retail'     WHERE category = 'shops';
UPDATE rankings SET category = 'experience' WHERE category = 'experiences';

-- Places that someone explicitly ranked as a cafe were stored as 'food'
-- (Google's cafe type mapped to food). Promote them so the map, filters
-- and rankings agree.
ALTER TABLE places DROP CONSTRAINT IF EXISTS places_category_chk;
UPDATE places SET category = 'cafe'
WHERE category = 'food'
  AND id IN (SELECT place_id FROM rankings WHERE category = 'cafe');
ALTER TABLE places ADD CONSTRAINT places_category_chk
  CHECK (category IN ('cafe','food','bar','beauty','experience','retail'));

ALTER TABLE rankings DROP CONSTRAINT IF EXISTS rankings_category_chk;
ALTER TABLE rankings ADD CONSTRAINT rankings_category_chk
  CHECK (category IN ('cafe','food','bar','beauty','experience','retail'));

-- Renumber every (user, category) list contiguously after the rename.
-- (constraint already deferred above)
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, category ORDER BY position, created_at) AS rn
  FROM rankings
)
UPDATE rankings r SET position = o.rn FROM ordered o WHERE r.id = o.id AND r.position <> o.rn;


-- ─── 7. Strip the Google API key from stored photo URLs ────────────
UPDATE places
SET photo_url = regexp_replace(photo_url, '([?&])key=[^&]*&?', '\1', 'g')
WHERE photo_url ~ '[?&]key=';
UPDATE places SET photo_url = rtrim(photo_url, '&?') WHERE photo_url ~ '[&?]$';

ALTER TABLE places DROP CONSTRAINT IF EXISTS places_photo_no_key_chk;
ALTER TABLE places ADD CONSTRAINT places_photo_no_key_chk
  CHECK (photo_url IS NULL OR photo_url !~ '[?&]key=');

ALTER TABLE places DROP CONSTRAINT IF EXISTS places_text_len_chk;
ALTER TABLE places ADD CONSTRAINT places_text_len_chk
  CHECK (char_length(name) BETWEEN 1 AND 200 AND char_length(address) <= 300) NOT VALID;

ALTER TABLE pins DROP CONSTRAINT IF EXISTS pins_impression_len_chk;
ALTER TABLE pins ADD CONSTRAINT pins_impression_len_chk
  CHECK (impression IS NULL OR char_length(impression) <= 150) NOT VALID;


-- ─── 1 & 2. users: column privileges + campus gate on auth email ───
REVOKE SELECT, UPDATE, INSERT ON users FROM authenticated, anon;
GRANT SELECT (id, username, display_name, avatar_url, campus, is_private,
              is_verified, onboarding_complete, created_at)
  ON users TO authenticated;
GRANT INSERT (id, email, username, display_name, avatar_url, is_private)
  ON users TO authenticated;
GRANT UPDATE (username, display_name, avatar_url, is_private,
              expo_push_token, onboarding_complete)
  ON users TO authenticated;

CREATE OR REPLACE FUNCTION enforce_campus_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email text := lower(coalesce(auth.email(), ''));
  v_domain text;
BEGIN
  -- service_role / SQL-editor inserts (no JWT) keep the supplied email.
  IF auth.uid() IS NOT NULL THEN
    IF v_auth_email = '' OR lower(NEW.email) IS DISTINCT FROM v_auth_email THEN
      RAISE EXCEPTION 'Profile email must match the signed-in account.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.email := lower(NEW.email);
  v_domain := split_part(NEW.email, '@', 2);
  IF NOT EXISTS (SELECT 1 FROM auth_allowed_domains WHERE domain = v_domain) THEN
    RAISE EXCEPTION 'Email domain % is not permitted. A campus email is required.', v_domain
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.is_verified := true;  -- the OTP sign-in proved ownership of this inbox
  RETURN NEW;
END;
$$;

-- Usernames: lowercase handle, 3–20 chars. NOT VALID so legacy rows stay.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_fmt_chk;
ALTER TABLE users ADD CONSTRAINT users_username_fmt_chk
  CHECK (username ~ '^[a-z0-9_.]{3,20}$') NOT VALID;


-- ─── 4. rankings privacy mirrors pins ──────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read rankings" ON rankings;
CREATE POLICY "Authenticated users can read rankings"
  ON rankings FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = rankings.user_id AND u.is_private)
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = (select auth.uid())
        AND f.following_id = rankings.user_id
        AND f.status = 'active'
    )
  );


-- ─── 3. follows: only the followed party approves ──────────────────
CREATE OR REPLACE FUNCTION guard_follow_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.follower_id  IS DISTINCT FROM OLD.follower_id
     OR NEW.following_id IS DISTINCT FROM OLD.following_id THEN
    RAISE EXCEPTION 'follower_id / following_id are immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM OLD.following_id THEN
    RAISE EXCEPTION 'only the followed account can change a follow status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_follow_ids ON follows;
DROP TRIGGER IF EXISTS trg_guard_follow_update ON follows;
CREATE TRIGGER trg_guard_follow_update
  BEFORE UPDATE ON follows
  FOR EACH ROW EXECUTE FUNCTION guard_follow_update();

DROP POLICY IF EXISTS "Users can update own follows" ON follows;
DROP POLICY IF EXISTS "Followed user can update follow status" ON follows;
CREATE POLICY "Followed user can update follow status"
  ON follows FOR UPDATE TO authenticated
  USING (following_id = (select auth.uid()))
  WITH CHECK (following_id = (select auth.uid()));

-- Either party may delete the edge: follower = unfollow,
-- followed = reject a request / remove a follower.
DROP POLICY IF EXISTS "Users can delete own follows" ON follows;
CREATE POLICY "Users can delete own follows"
  ON follows FOR DELETE TO authenticated
  USING (follower_id = (select auth.uid()) OR following_id = (select auth.uid()));

ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_no_self_chk;
ALTER TABLE follows ADD CONSTRAINT follows_no_self_chk
  CHECK (follower_id <> following_id) NOT VALID;

CREATE OR REPLACE FUNCTION respond_follow_request(p_follower_id uuid, p_accept boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_accept THEN
    UPDATE follows SET status = 'active'
      WHERE follower_id = p_follower_id AND following_id = v_me AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'no pending request from this user'; END IF;
    RETURN 'active';
  ELSE
    DELETE FROM follows
      WHERE follower_id = p_follower_id AND following_id = v_me AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'no pending request from this user'; END IF;
    RETURN 'rejected';
  END IF;
END;
$$;

-- 11. Push only for an edge that really exists.
CREATE OR REPLACE FUNCTION notify_new_follow(p_follower_id uuid, p_following_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_follower_username text;
  v_push_token        text;
  v_status            text;
BEGIN
  IF p_follower_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT status INTO v_status FROM follows
    WHERE follower_id = p_follower_id AND following_id = p_following_id;
  IF v_status IS NULL THEN RETURN; END IF;

  SELECT username        INTO v_follower_username FROM users WHERE id = p_follower_id;
  SELECT expo_push_token INTO v_push_token        FROM users WHERE id = p_following_id;

  IF v_push_token IS NOT NULL AND to_regnamespace('net') IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'to',    v_push_token,
        'title', 'Filo',
        'body',  CASE WHEN v_status = 'pending'
                   THEN v_follower_username || ' requested to follow you.'
                   ELSE v_follower_username || ' started following you.' END
      )
    );
  END IF;
END;
$$;


-- ─── 5a. Provider-agnostic venues ──────────────────────────────────
-- Google Places is unavailable when its project has no billing; Mapbox
-- Search Box (same token family as the map) is the primary provider in
-- Filo 2.0. `google_place_id` keeps its name for compatibility with the
-- business dashboard but now holds the provider's stable id; `source`
-- says which. Tags/neighborhood are the provider's real attributes and feed
-- grounded search filters (never invented text).
ALTER TABLE places ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'google';
ALTER TABLE places DROP CONSTRAINT IF EXISTS places_source_chk;
ALTER TABLE places ADD CONSTRAINT places_source_chk CHECK (source IN ('google','mapbox'));
ALTER TABLE places ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE places ADD COLUMN IF NOT EXISTS neighborhood text;

-- ─── 5. save_pin(): dedupe venue + upsert pin atomically ───────────
DROP FUNCTION IF EXISTS save_pin(text,text,text,text,double precision,double precision,text,text,text);
CREATE OR REPLACE FUNCTION save_pin(
  p_google_place_id text,
  p_name            text,
  p_address         text,
  p_category        text,
  p_lat             double precision,
  p_lng             double precision,
  p_photo_url       text,
  p_status          text,
  p_impression      text,
  p_source          text DEFAULT 'google',
  p_tags            text[] DEFAULT '{}',
  p_neighborhood    text DEFAULT NULL
)
RETURNS TABLE (pin_id uuid, place_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user  uuid := auth.uid();
  v_place uuid;
  v_pin   uuid;
  v_new   boolean;
  v_imp   text := nullif(btrim(p_impression), '');
  v_photo text := nullif(btrim(p_photo_url), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user) THEN
    RAISE EXCEPTION 'profile not set up';
  END IF;
  IF p_google_place_id IS NULL OR p_google_place_id !~ '^[A-Za-z0-9_-]+$' OR char_length(p_google_place_id) NOT BETWEEN 10 AND 300 THEN
    RAISE EXCEPTION 'invalid place id' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(p_source, '') NOT IN ('google','mapbox') THEN
    RAISE EXCEPTION 'invalid source' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status NOT IN ('visited','want_to_go') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = 'check_violation';
  END IF;
  IF v_imp IS NOT NULL AND char_length(v_imp) > 150 THEN
    RAISE EXCEPTION 'impression too long' USING ERRCODE = 'check_violation';
  END IF;
  IF v_photo IS NOT NULL AND v_photo !~ '^https://' THEN
    v_photo := NULL;
  END IF;

  -- First writer creates the venue; later writers reuse it unchanged so
  -- one user can't rename/move a venue everyone else has pinned.
  INSERT INTO places (google_place_id, name, address, category, lat, lng, photo_url,
                      source, tags, neighborhood)
  VALUES (p_google_place_id, btrim(p_name), btrim(coalesce(p_address, '')), p_category,
          p_lat, p_lng, v_photo, p_source,
          (SELECT coalesce(array_agg(DISTINCT lower(btrim(t))), '{}')
             FROM unnest(coalesce(p_tags, '{}')) t
            WHERE char_length(btrim(t)) BETWEEN 1 AND 40),
          nullif(left(btrim(p_neighborhood), 80), ''))
  ON CONFLICT (google_place_id) DO NOTHING
  RETURNING id INTO v_place;

  IF v_place IS NULL THEN
    SELECT id INTO v_place FROM places WHERE google_place_id = p_google_place_id;
    -- Backfill a photo the first writer didn't have.
    UPDATE places SET photo_url = v_photo
      WHERE id = v_place AND photo_url IS NULL AND v_photo IS NOT NULL;
  END IF;

  INSERT INTO pins (user_id, place_id, status, impression, is_public)
  VALUES (v_user, v_place, p_status, v_imp, true)
  ON CONFLICT (user_id, place_id) DO UPDATE
    SET status = EXCLUDED.status, impression = EXCLUDED.impression
  RETURNING id, (xmax = 0) INTO v_pin, v_new;

  RETURN QUERY SELECT v_pin, v_place, v_new;
END;
$$;

-- Keep the client from creating venues directly; save_pin is the path.
DROP POLICY IF EXISTS "Anyone can insert places" ON places;

-- Downgrading a visited pin to want-to-go, or deleting it, removes its
-- rankings (you can't rank a place you haven't been) and closes the gap.
CREATE OR REPLACE FUNCTION cleanup_rankings_for_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'visited' AND NEW.status <> 'visited') THEN
    RETURN NEW;
  END IF;
  SET CONSTRAINTS rankings_user_id_category_position_key DEFERRED;
  FOR r IN
    DELETE FROM rankings WHERE user_id = OLD.user_id AND place_id = OLD.place_id
    RETURNING category
  LOOP
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY position) AS rn
      FROM rankings WHERE user_id = OLD.user_id AND category = r.category
    )
    UPDATE rankings x SET position = o.rn FROM ordered o WHERE x.id = o.id;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_rankings_for_pin ON pins;
CREATE TRIGGER trg_cleanup_rankings_for_pin
  AFTER DELETE OR UPDATE OF status ON pins
  FOR EACH ROW EXECUTE FUNCTION cleanup_rankings_for_pin();


-- ─── 10. Rankings: validated rerank + atomic remove ────────────────
CREATE OR REPLACE FUNCTION rerank_place(
  p_place_id uuid,
  p_category text,
  p_position integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer;
  v_pos integer := p_position;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_category NOT IN ('cafe','food','bar','beauty','experience','retail') THEN
    RAISE EXCEPTION 'invalid category' USING ERRCODE = 'check_violation';
  END IF;
  -- Ranking a place means you've been: require a pin, promote to visited.
  UPDATE pins SET status = 'visited'
    WHERE user_id = v_user AND place_id = p_place_id AND status <> 'visited';
  IF NOT EXISTS (SELECT 1 FROM pins WHERE user_id = v_user AND place_id = p_place_id) THEN
    RAISE EXCEPTION 'pin this place before ranking it' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user::text), hashtext(p_category));
  SET CONSTRAINTS rankings_user_id_category_position_key DEFERRED;

  DELETE FROM rankings
    WHERE user_id = v_user AND place_id = p_place_id AND category = p_category;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position) AS rn
    FROM rankings
    WHERE user_id = v_user AND category = p_category
  )
  UPDATE rankings r SET position = o.rn FROM ordered o WHERE r.id = o.id;

  SELECT count(*) INTO v_count
    FROM rankings WHERE user_id = v_user AND category = p_category;

  v_pos := greatest(1, least(coalesce(v_pos, v_count + 1), v_count + 1));

  UPDATE rankings
    SET position = position + 1
    WHERE user_id = v_user AND category = p_category AND position >= v_pos;

  INSERT INTO rankings (user_id, place_id, category, position)
    VALUES (v_user, p_place_id, p_category, v_pos);

  RETURN v_pos;
END;
$$;

CREATE OR REPLACE FUNCTION remove_ranking(p_place_id uuid, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text), hashtext(p_category));
  SET CONSTRAINTS rankings_user_id_category_position_key DEFERRED;
  DELETE FROM rankings
    WHERE user_id = v_user AND place_id = p_place_id AND category = p_category;
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position) AS rn
    FROM rankings WHERE user_id = v_user AND category = p_category
  )
  UPDATE rankings r SET position = o.rn FROM ordered o WHERE r.id = o.id;
END;
$$;


-- ─── 9 & 10. Boards: server-side share token, atomic reorder ───────
CREATE OR REPLACE FUNCTION new_share_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=', '-_');
$$;

ALTER TABLE boards ALTER COLUMN share_token SET DEFAULT new_share_token();
UPDATE boards SET share_token = new_share_token() WHERE share_token IS NULL;

ALTER TABLE boards DROP CONSTRAINT IF EXISTS boards_name_len_chk;
ALTER TABLE boards ADD CONSTRAINT boards_name_len_chk
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 60) NOT VALID;

ALTER TABLE boards ADD COLUMN IF NOT EXISTS cover_pin_id uuid REFERENCES pins(id) ON DELETE SET NULL;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
DROP TRIGGER IF EXISTS trg_boards_updated_at ON boards;
CREATE TRIGGER trg_boards_updated_at
  BEFORE UPDATE ON boards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- board_pins may only reference a pin the caller can actually see.
DROP POLICY IF EXISTS "Users can insert board_pins into own boards" ON board_pins;
CREATE POLICY "Users can insert board_pins into own boards"
  ON board_pins FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND boards.user_id = (select auth.uid())
    )
    AND EXISTS (SELECT 1 FROM pins WHERE pins.id = board_pins.pin_id)
  );

CREATE OR REPLACE FUNCTION add_pin_to_board(p_board_id uuid, p_pin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM boards WHERE id = p_board_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'board not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_board_id::text));
  INSERT INTO board_pins (board_id, pin_id, position)
  VALUES (p_board_id, p_pin_id,
          coalesce((SELECT max(position) + 1 FROM board_pins WHERE board_id = p_board_id), 0))
  ON CONFLICT (board_id, pin_id) DO UPDATE SET position = board_pins.position
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION reorder_board(p_board_id uuid, p_board_pin_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM boards WHERE id = p_board_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'board not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (SELECT count(*) FROM board_pins WHERE board_id = p_board_id)
     <> coalesce(array_length(p_board_pin_ids, 1), 0)
     OR EXISTS (
       SELECT 1 FROM unnest(p_board_pin_ids) AS t(id)
       WHERE NOT EXISTS (SELECT 1 FROM board_pins b WHERE b.id = t.id AND b.board_id = p_board_id)
     ) THEN
    RAISE EXCEPTION 'board changed — refresh and try again' USING ERRCODE = 'serialization_failure';
  END IF;
  UPDATE board_pins b
    SET position = t.ord - 1
    FROM unnest(p_board_pin_ids) WITH ORDINALITY AS t(id, ord)
    WHERE b.id = t.id AND b.board_id = p_board_id;
END;
$$;


-- ─── 8. Shared board for anonymous web viewers ─────────────────────
-- Returns ONLY a public board's name/owner and the pins on it whose
-- authors are public (or the board owner themself). No ids of other
-- users, no emails, no private-account content.
CREATE OR REPLACE FUNCTION get_shared_board(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board boards%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{8,40}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_board FROM boards
    WHERE share_token = p_token AND visibility = 'public';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'id', v_board.id,
    'name', v_board.name,
    'description', v_board.description,
    'owner', (SELECT jsonb_build_object('username', u.username,
                                        'display_name', u.display_name,
                                        'avatar_url', u.avatar_url)
              FROM users u WHERE u.id = v_board.user_id),
    'pins', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'place_name', pl.name,
               'category', pl.category,
               'address', pl.address,
               'lat', pl.lat,
               'lng', pl.lng,
               'status', p.status,
               'impression', p.impression,
               'photo_url', coalesce(p.photo_url, pl.photo_url)
             ) ORDER BY bp.position)
      FROM board_pins bp
      JOIN pins p   ON p.id = bp.pin_id
      JOIN places pl ON pl.id = p.place_id
      JOIN users au ON au.id = p.user_id
      WHERE bp.board_id = v_board.id
        AND (p.user_id = v_board.user_id OR (p.is_public AND NOT au.is_private))
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_shared_board(text) FROM public;
GRANT EXECUTE ON FUNCTION get_shared_board(text) TO anon, authenticated;


-- ─── 12. Friends feed: keyset pagination, bounded page ─────────────
DROP FUNCTION IF EXISTS get_friends_feed(uuid);
CREATE OR REPLACE FUNCTION get_friends_feed(
  p_user_id uuid,
  p_before  timestamptz DEFAULT NULL,
  p_limit   integer DEFAULT 50
)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT
      p.id, u.id, u.username, u.display_name, u.avatar_url,
      pl.id, pl.name, pl.category, pl.address, pl.lat, pl.lng,
      COALESCE(p.photo_url, pl.photo_url),
      p.status, p.impression, p.created_at
    FROM pins p
    JOIN users  u  ON u.id  = p.user_id
    JOIN places pl ON pl.id = p.place_id
    WHERE p.is_public = true
      AND p.user_id IN (
        -- Qualified: the RETURNS TABLE columns (status, user_id, …) are
        -- plpgsql variables, so a bare `status` here is ambiguous. The July
        -- 2026 version had exactly this bug and raised on every call, which
        -- broke the friends map and the activity feed.
        SELECT f.following_id FROM follows f
        WHERE f.follower_id = p_user_id AND f.status = 'active'
      )
      AND (p_before IS NULL OR p.created_at < p_before)
    ORDER BY p.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100));
END;
$$;


-- ─── RPC grants (functions default to PUBLIC execute; be explicit) ─
REVOKE ALL ON FUNCTION save_pin(text,text,text,text,double precision,double precision,text,text,text,text,text[],text) FROM public, anon;
GRANT EXECUTE ON FUNCTION save_pin(text,text,text,text,double precision,double precision,text,text,text,text,text[],text) TO authenticated;
REVOKE ALL ON FUNCTION respond_follow_request(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION respond_follow_request(uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION remove_ranking(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION remove_ranking(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION rerank_place(uuid, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION rerank_place(uuid, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION add_pin_to_board(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION add_pin_to_board(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION reorder_board(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION reorder_board(uuid, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION get_friends_feed(uuid, timestamptz, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_friends_feed(uuid, timestamptz, integer) TO authenticated;
REVOKE ALL ON FUNCTION notify_new_follow(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION notify_new_follow(uuid, uuid) TO authenticated;
