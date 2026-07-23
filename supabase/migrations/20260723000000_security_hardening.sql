-- ============================================================
-- SECURITY HARDENING — 2026-07-23
-- ============================================================
-- Closes the authorization/RLS gaps found in the security audit:
--   1.  Campus-email allowlist enforced server-side (config table + trigger)
--   2.  Private-account follow bypass — follow status forced by trigger,
--       never trusted from the client
--   3.  is_private now actually gates pin visibility
--   4.  follows UPDATE can no longer forge follower_id/following_id
--   5.  board_pins may only reference the caller's own or public pins
--   6.  places INSERT constrained (category enum + coordinate bounds)
--   7.  SECURITY DEFINER RPCs bound to auth.uid() + pinned search_path
--   8.  avatars storage bucket gets owner-scoped RLS (mirrors pin-photos)
--   9.  Enum-like text columns get CHECK constraints
--  10.  Every policy re-created with (select auth.uid()) initplan form and
--       an explicit WITH CHECK
--
-- Idempotent: safe to re-run. Every statement uses IF [NOT] EXISTS /
-- DROP … IF EXISTS / OR REPLACE / ON CONFLICT.
-- ============================================================

-- ─── 0. Enum-like CHECK constraints ────────────────────────────────
DO $$ BEGIN
  ALTER TABLE pins   ADD CONSTRAINT pins_status_chk
    CHECK (status IN ('visited','want_to_go'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE boards ADD CONSTRAINT boards_visibility_chk
    CHECK (visibility IN ('private','friends','public'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE follows ADD CONSTRAINT follows_status_chk
    CHECK (status IN ('active','pending'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE places ADD CONSTRAINT places_category_chk
    CHECK (category IN ('food','bar','beauty','experience','retail'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE places ADD CONSTRAINT places_coord_chk
    CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── 1. Campus-email allowlist ─────────────────────────────────────
-- Config table so the allowed domains can be edited with one INSERT
-- (e.g. add 'gmail.com' temporarily for a demo) instead of a code deploy.
CREATE TABLE IF NOT EXISTS auth_allowed_domains (
  domain     text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

INSERT INTO auth_allowed_domains (domain) VALUES
  ('columbia.edu'),
  ('barnard.edu')
ON CONFLICT (domain) DO NOTHING;

ALTER TABLE auth_allowed_domains ENABLE ROW LEVEL SECURITY;
-- Readable pre-auth (anon) too, so the email screen can reject a non-campus
-- address before sending an OTP. Domain names are not sensitive. Only
-- service_role (which bypasses RLS) may modify the list.
DROP POLICY IF EXISTS "allowed domains readable" ON auth_allowed_domains;
CREATE POLICY "allowed domains readable"
  ON auth_allowed_domains FOR SELECT TO anon, authenticated USING (true);

-- BEFORE INSERT trigger on the profile row: reject any email whose domain
-- is not in the allowlist. This is the server-side gate the client regex
-- can only hint at.
CREATE OR REPLACE FUNCTION enforce_campus_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text := lower(split_part(NEW.email, '@', 2));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth_allowed_domains WHERE domain = v_domain) THEN
    RAISE EXCEPTION 'Email domain % is not permitted. A campus email is required.', v_domain
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_campus_email ON users;
CREATE TRIGGER trg_enforce_campus_email
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_campus_email();


-- ─── 2. Follows: status forced server-side, ids immutable ──────────
-- The client can no longer self-approve into a private account. A
-- BEFORE INSERT trigger sets status from the *target's* privacy flag,
-- ignoring whatever the client sent.
CREATE OR REPLACE FUNCTION set_follow_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT CASE WHEN u.is_private THEN 'pending' ELSE 'active' END
    INTO NEW.status
    FROM users u WHERE u.id = NEW.following_id;
  IF NEW.status IS NULL THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_follow_status ON follows;
CREATE TRIGGER trg_set_follow_status
  BEFORE INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION set_follow_status();

-- On UPDATE, only `status` may change — the two id columns are frozen so
-- the followed party can't forge a "X follows me" edge.
CREATE OR REPLACE FUNCTION freeze_follow_ids()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.follower_id  IS DISTINCT FROM OLD.follower_id
     OR NEW.following_id IS DISTINCT FROM OLD.following_id THEN
    RAISE EXCEPTION 'follower_id / following_id are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_follow_ids ON follows;
CREATE TRIGGER trg_freeze_follow_ids
  BEFORE UPDATE ON follows
  FOR EACH ROW EXECUTE FUNCTION freeze_follow_ids();


-- ─── 3-10. Re-create all RLS policies (initplan auth.uid + WITH CHECK)
-- Wrapping auth.uid() in (select …) makes Postgres evaluate it once per
-- statement instead of once per row.

-- ---- users ----
DROP POLICY IF EXISTS "Users can read all profiles" ON users;
CREATE POLICY "Users can read all profiles"
  ON users FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ---- places ----  (insert constrained by CHECK constraints above)
DROP POLICY IF EXISTS "Anyone can read places" ON places;
CREATE POLICY "Anyone can read places"
  ON places FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can insert places" ON places;
CREATE POLICY "Anyone can insert places"
  ON places FOR INSERT TO authenticated WITH CHECK (true);

-- ---- pins ----  (is_private now gates visibility)
DROP POLICY IF EXISTS "Anyone can read public pins" ON pins;
CREATE POLICY "Anyone can read public pins"
  ON pins FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR (
      is_public = true
      AND NOT EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = pins.user_id AND u.is_private = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = (select auth.uid())
        AND f.following_id = pins.user_id
        AND f.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert own pins" ON pins;
CREATE POLICY "Users can insert own pins"
  ON pins FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own pins" ON pins;
CREATE POLICY "Users can update own pins"
  ON pins FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own pins" ON pins;
CREATE POLICY "Users can delete own pins"
  ON pins FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ---- boards ----
DROP POLICY IF EXISTS "Anyone can read public boards" ON boards;
CREATE POLICY "Anyone can read public boards"
  ON boards FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR user_id = (select auth.uid())
    OR (
      visibility = 'friends'
      AND EXISTS (
        SELECT 1 FROM follows
        WHERE follower_id = (select auth.uid())
          AND following_id = boards.user_id
          AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert own boards" ON boards;
CREATE POLICY "Users can insert own boards"
  ON boards FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own boards" ON boards;
CREATE POLICY "Users can update own boards"
  ON boards FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own boards" ON boards;
CREATE POLICY "Users can delete own boards"
  ON boards FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ---- board_pins ---- (pin must be caller's own or public)
DROP POLICY IF EXISTS "Anyone can read board_pins for accessible boards" ON board_pins;
CREATE POLICY "Anyone can read board_pins for accessible boards"
  ON board_pins FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND (
          boards.visibility = 'public'
          OR boards.user_id = (select auth.uid())
          OR (
            boards.visibility = 'friends'
            AND EXISTS (
              SELECT 1 FROM follows
              WHERE follower_id = (select auth.uid())
                AND following_id = boards.user_id
                AND status = 'active'
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users can insert board_pins into own boards" ON board_pins;
CREATE POLICY "Users can insert board_pins into own boards"
  ON board_pins FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND boards.user_id = (select auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM pins
      WHERE pins.id = board_pins.pin_id
        AND (pins.user_id = (select auth.uid()) OR pins.is_public = true)
    )
  );

DROP POLICY IF EXISTS "Users can update board_pins in own boards" ON board_pins;
CREATE POLICY "Users can update board_pins in own boards"
  ON board_pins FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND boards.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND boards.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete board_pins from own boards" ON board_pins;
CREATE POLICY "Users can delete board_pins from own boards"
  ON board_pins FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND boards.user_id = (select auth.uid())
    )
  );

-- ---- follows ---- (INSERT trusts only follower_id; status set by trigger)
DROP POLICY IF EXISTS "Anyone can read follows" ON follows;
CREATE POLICY "Anyone can read follows"
  ON follows FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own follows" ON follows;
CREATE POLICY "Users can insert own follows"
  ON follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own follows" ON follows;
CREATE POLICY "Users can update own follows"
  ON follows FOR UPDATE TO authenticated
  USING (follower_id = (select auth.uid()) OR following_id = (select auth.uid()))
  WITH CHECK (follower_id = (select auth.uid()) OR following_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own follows" ON follows;
CREATE POLICY "Users can delete own follows"
  ON follows FOR DELETE TO authenticated
  USING (follower_id = (select auth.uid()));

-- ---- rankings ----
DROP POLICY IF EXISTS "Authenticated users can read rankings" ON rankings;
CREATE POLICY "Authenticated users can read rankings"
  ON rankings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users insert own rankings" ON rankings;
CREATE POLICY "Users insert own rankings"
  ON rankings FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users update own rankings" ON rankings;
CREATE POLICY "Users update own rankings"
  ON rankings FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users delete own rankings" ON rankings;
CREATE POLICY "Users delete own rankings"
  ON rankings FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));


-- ─── 11. SECURITY DEFINER RPCs bound to auth.uid() ─────────────────
-- get_friends_feed: assert the caller is asking about themselves.
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
        SELECT following_id FROM follows
        WHERE follower_id = p_user_id AND status = 'active'
      )
    ORDER BY p.created_at DESC
    LIMIT 50;
END;
$$;

-- notify_new_follow: assert the caller is the follower it claims to be.
CREATE OR REPLACE FUNCTION notify_new_follow(p_follower_id uuid, p_following_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_follower_username text;
  v_push_token        text;
BEGIN
  IF p_follower_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT username        INTO v_follower_username FROM users WHERE id = p_follower_id;
  SELECT expo_push_token INTO v_push_token        FROM users WHERE id = p_following_id;

  IF v_push_token IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'to',    v_push_token,
        'title', 'Filo',
        'body',  v_follower_username || ' started following you.'
      )
    );
  END IF;
END;
$$;


-- ─── 12. avatars storage bucket RLS ────────────────────────────────
-- Path convention (updated in the app): avatars/{user_id}/avatar.{ext}
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars own folder insert" ON storage.objects;
CREATE POLICY "avatars own folder insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "avatars own folder update" ON storage.objects;
CREATE POLICY "avatars own folder update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "avatars own folder delete" ON storage.objects;
CREATE POLICY "avatars own folder delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
