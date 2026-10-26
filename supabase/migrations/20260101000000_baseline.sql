-- ============================================================
-- BASELINE — the v1.0 schema (formerly only in /schema.sql, applied by hand
-- in the Supabase dashboard). Converted to an idempotent migration so a fresh
-- database (local `supabase start`, CI, a new project) can replay the full
-- migration chain. On the existing production project every statement is a
-- no-op or is superseded by the later hardening migrations.
-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text UNIQUE NOT NULL,
  username         text UNIQUE NOT NULL,
  display_name     text NOT NULL,
  avatar_url       text,
  campus           text DEFAULT 'columbia',
  is_verified      boolean DEFAULT false,
  is_private           boolean DEFAULT false,
  expo_push_token      text,
  onboarding_complete  boolean DEFAULT false,
  created_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id text UNIQUE NOT NULL,
  name            text NOT NULL,
  address         text NOT NULL,
  category        text NOT NULL,  -- food|bar|beauty|experience|retail
  lat             float NOT NULL,
  lng             float NOT NULL,
  photo_url       text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  place_id    uuid REFERENCES places(id) ON DELETE CASCADE,
  status      text NOT NULL,  -- visited|want_to_go
  impression  text,           -- max 150 chars, nullable
  is_public   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, place_id)
);

CREATE TABLE IF NOT EXISTS boards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  visibility  text DEFAULT 'public',  -- private|friends|public
  share_token text UNIQUE,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_pins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   uuid REFERENCES boards(id) ON DELETE CASCADE,
  pin_id     uuid REFERENCES pins(id) ON DELETE CASCADE,
  position   integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(board_id, pin_id)
);

CREATE TABLE IF NOT EXISTS follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid REFERENCES users(id) ON DELETE CASCADE,
  following_id uuid REFERENCES users(id) ON DELETE CASCADE,
  status       text DEFAULT 'active',  -- active|pending (pending for private accounts)
  created_at   timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS pins_user_id_idx ON pins(user_id);
CREATE INDEX IF NOT EXISTS pins_place_id_idx ON pins(place_id);
CREATE INDEX IF NOT EXISTS follows_follower_id_idx ON follows(follower_id);
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON follows(following_id);
CREATE INDEX IF NOT EXISTS board_pins_board_id_idx ON board_pins(board_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE places     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows    ENABLE ROW LEVEL SECURITY;

-- ---- users ----

-- Anyone authenticated can read public profiles
DROP POLICY IF EXISTS "Users can read all profiles" ON users;
CREATE POLICY "Users can read all profiles"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own row (called once during profile setup)
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can only update their own row
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ---- places ----

-- Places are public reference data — anyone authenticated can read
DROP POLICY IF EXISTS "Anyone can read places" ON places;
CREATE POLICY "Anyone can read places"
  ON places FOR SELECT
  TO authenticated
  USING (true);

-- Anyone authenticated can insert a new place (created when pinning)
DROP POLICY IF EXISTS "Anyone can insert places" ON places;
CREATE POLICY "Anyone can insert places"
  ON places FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ---- pins ----

-- Users can read public pins from anyone
DROP POLICY IF EXISTS "Anyone can read public pins" ON pins;
CREATE POLICY "Anyone can read public pins"
  ON pins FOR SELECT
  TO authenticated
  USING (is_public = true OR user_id = auth.uid());

-- Users can only insert their own pins
DROP POLICY IF EXISTS "Users can insert own pins" ON pins;
CREATE POLICY "Users can insert own pins"
  ON pins FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can only update their own pins
DROP POLICY IF EXISTS "Users can update own pins" ON pins;
CREATE POLICY "Users can update own pins"
  ON pins FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Users can only delete their own pins
DROP POLICY IF EXISTS "Users can delete own pins" ON pins;
CREATE POLICY "Users can delete own pins"
  ON pins FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---- boards ----

-- Public boards visible to all; friends boards visible to followers; private boards only to owner
DROP POLICY IF EXISTS "Anyone can read public boards" ON boards;
CREATE POLICY "Anyone can read public boards"
  ON boards FOR SELECT
  TO authenticated
  USING (
    visibility = 'public'
    OR user_id = auth.uid()
    OR (
      visibility = 'friends'
      AND EXISTS (
        SELECT 1 FROM follows
        WHERE follower_id = auth.uid()
          AND following_id = boards.user_id
          AND status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert own boards" ON boards;
CREATE POLICY "Users can insert own boards"
  ON boards FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own boards" ON boards;
CREATE POLICY "Users can update own boards"
  ON boards FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own boards" ON boards;
CREATE POLICY "Users can delete own boards"
  ON boards FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---- board_pins ----

-- Readable if the parent board is readable (handled by board policy above for joins;
-- for direct access, allow if user owns the board)
DROP POLICY IF EXISTS "Anyone can read board_pins for accessible boards" ON board_pins;
CREATE POLICY "Anyone can read board_pins for accessible boards"
  ON board_pins FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND (
          boards.visibility = 'public'
          OR boards.user_id = auth.uid()
          OR (
            boards.visibility = 'friends'
            AND EXISTS (
              SELECT 1 FROM follows
              WHERE follower_id = auth.uid()
                AND following_id = boards.user_id
                AND status = 'active'
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users can insert board_pins into own boards" ON board_pins;
CREATE POLICY "Users can insert board_pins into own boards"
  ON board_pins FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND boards.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update board_pins in own boards" ON board_pins;
CREATE POLICY "Users can update board_pins in own boards"
  ON board_pins FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND boards.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete board_pins from own boards" ON board_pins;
CREATE POLICY "Users can delete board_pins from own boards"
  ON board_pins FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards
      WHERE boards.id = board_pins.board_id
        AND boards.user_id = auth.uid()
    )
  );

-- ---- follows ----

-- Anyone can read follows (needed to compute follower/following counts)
DROP POLICY IF EXISTS "Anyone can read follows" ON follows;
CREATE POLICY "Anyone can read follows"
  ON follows FOR SELECT
  TO authenticated
  USING (true);

-- Users can only create follows where they are the follower
DROP POLICY IF EXISTS "Users can insert own follows" ON follows;
CREATE POLICY "Users can insert own follows"
  ON follows FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

-- Users can update their own follow rows (e.g. changing pending → active)
DROP POLICY IF EXISTS "Users can update own follows" ON follows;
CREATE POLICY "Users can update own follows"
  ON follows FOR UPDATE
  TO authenticated
  USING (follower_id = auth.uid() OR following_id = auth.uid());

-- Users can unfollow (delete) only follows they created
DROP POLICY IF EXISTS "Users can delete own follows" ON follows;
CREATE POLICY "Users can delete own follows"
  ON follows FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

-- ============================================================
-- FOLLOW NOTIFICATION FUNCTION
-- Sends an Expo push notification to the followed user.
-- Uses pg_net (enabled by default on Supabase) for the HTTP call.
-- Run in Supabase SQL editor after enabling the pg_net extension.
-- ============================================================

CREATE OR REPLACE FUNCTION notify_new_follow(p_follower_id uuid, p_following_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_follower_username text;
  v_push_token        text;
BEGIN
  SELECT username         INTO v_follower_username FROM users WHERE id = p_follower_id;
  SELECT expo_push_token  INTO v_push_token        FROM users WHERE id = p_following_id;

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

-- ============================================================
-- FRIENDS FEED FUNCTION
-- Returns the 50 most recent public pins from users
-- that the given user follows (active follows only).
-- ============================================================

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
    pl.photo_url,
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

-- ============================================================
-- RANKINGS (discover “twins”, pin review, profile — apply if missing)
-- ============================================================

CREATE TABLE IF NOT EXISTS rankings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id   uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  category   text NOT NULL,
  position   integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, category, position),
  UNIQUE(user_id, place_id, category)
);

CREATE INDEX IF NOT EXISTS rankings_user_id_idx ON rankings(user_id);
CREATE INDEX IF NOT EXISTS rankings_place_id_idx ON rankings(place_id);

ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read rankings" ON rankings;
CREATE POLICY "Authenticated users can read rankings"
  ON rankings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users insert own rankings" ON rankings;
CREATE POLICY "Users insert own rankings"
  ON rankings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own rankings" ON rankings;
CREATE POLICY "Users update own rankings"
  ON rankings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own rankings" ON rankings;
CREATE POLICY "Users delete own rankings"
  ON rankings FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
