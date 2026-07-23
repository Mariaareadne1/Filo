-- ============================================================
-- DATA-LAYER HARDENING — 2026-07-23
-- ============================================================
-- Performance + correctness from the database/performance audit:
--   1.  Missing indexes for the dominant query shapes
--   2.  pins.updated_at kept fresh by a trigger (not by each write path)
--   3.  rankings unique constraint made DEFERRABLE so re-rank can renumber
--       atomically without row-by-row ordering games
--   4.  rerank_place(): the entire delete/renumber/insert done server-side in
--       ONE transaction under an advisory lock (was N sequential REST calls,
--       non-atomic, collision-prone under concurrency)
--   5.  get_discover_counts(): the five discovery lenses computed as SQL
--       aggregates in ONE round trip (was ~9 requests/tap shipping whole
--       tables to the client to count in JS)
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ─── 1. Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS boards_user_id_idx            ON boards(user_id);
CREATE INDEX IF NOT EXISTS board_pins_pin_id_idx         ON board_pins(pin_id);
CREATE INDEX IF NOT EXISTS follows_follower_status_idx   ON follows(follower_id, status);
CREATE INDEX IF NOT EXISTS follows_following_status_idx  ON follows(following_id, status);
CREATE INDEX IF NOT EXISTS pins_user_created_idx         ON pins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pins_public_created_idx       ON pins(created_at DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS pins_status_idx               ON pins(status);
CREATE INDEX IF NOT EXISTS places_cat_lat_lng_idx        ON places(category, lat, lng);
CREATE INDEX IF NOT EXISTS rankings_cat_user_idx         ON rankings(category, user_id);
CREATE INDEX IF NOT EXISTS rankings_user_cat_idx         ON rankings(user_id, category);
CREATE INDEX IF NOT EXISTS rankings_place_cat_idx        ON rankings(place_id, category);


-- ─── 2. pins.updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pins_updated_at ON pins;
CREATE TRIGGER trg_pins_updated_at
  BEFORE UPDATE ON pins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─── 3. Deferrable rankings position constraint ────────────────────
-- Lets rerank_place() renumber a whole category in one transaction with
-- transient duplicate positions that resolve at COMMIT.
ALTER TABLE rankings
  DROP CONSTRAINT IF EXISTS rankings_user_id_category_position_key;
ALTER TABLE rankings
  ADD CONSTRAINT rankings_user_id_category_position_key
  UNIQUE (user_id, category, position) DEFERRABLE INITIALLY IMMEDIATE;


-- ─── 4. Atomic re-rank ─────────────────────────────────────────────
-- Places the caller's pin for p_place_id at p_position within p_category,
-- renumbering the list contiguously. Idempotent for an already-ranked
-- place. Serialized per (user, category) by a transaction advisory lock.
-- Returns the final (clamped) position.
CREATE OR REPLACE FUNCTION rerank_place(
  p_place_id uuid,
  p_category text,
  p_position integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer;
  v_pos integer := p_position;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user::text), hashtext(p_category));
  SET CONSTRAINTS rankings_user_id_category_position_key DEFERRED;

  -- Remove any existing ranking for this place (re-rank case).
  DELETE FROM rankings
    WHERE user_id = v_user AND place_id = p_place_id AND category = p_category;

  -- Renumber the remaining rows contiguously 1..M (closes any gap).
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position) AS rn
    FROM rankings
    WHERE user_id = v_user AND category = p_category
  )
  UPDATE rankings r
    SET position = o.rn
    FROM ordered o
    WHERE r.id = o.id;

  SELECT count(*) INTO v_count
    FROM rankings WHERE user_id = v_user AND category = p_category;

  -- Clamp to [1, M+1].
  v_pos := greatest(1, least(v_pos, v_count + 1));

  -- Open a slot at v_pos.
  UPDATE rankings
    SET position = position + 1
    WHERE user_id = v_user AND category = p_category AND position >= v_pos;

  INSERT INTO rankings (user_id, place_id, category, position)
    VALUES (v_user, p_place_id, p_category, v_pos);

  RETURN v_pos;
END;
$$;


-- ─── 5. Discovery counts in one round trip ─────────────────────────
-- Computes all five discovery-lens counts as SQL aggregates. SECURITY
-- INVOKER so pins RLS (now privacy-aware) applies to the visible counts.
--
-- Vocabulary bridge: rankings.category uses the discover vocab directly
-- (cafes/food/bars/shops/experiences); pins join through places whose
-- category uses the MapPin vocab (food/bar/beauty/experience/retail).
CREATE OR REPLACE FUNCTION get_discover_counts(p_discover_cat text)
RETURNS TABLE (
  near_you integer,
  circle   integer,
  twins    integer,
  experts  integer,
  wishlist integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_place_cat text := CASE p_discover_cat
    WHEN 'cafes'       THEN 'food'
    WHEN 'food'        THEN 'food'
    WHEN 'bars'        THEN 'bar'
    WHEN 'shops'       THEN 'retail'
    WHEN 'experiences' THEN 'experience'
    ELSE p_discover_cat
  END;
  -- Columbia centroid ± ~5km box (matches the former client constants).
  v_min_lat float := 40.8075 - 0.045;
  v_max_lat float := 40.8075 + 0.045;
  v_min_lng float := -73.9626 - 0.060;
  v_max_lng float := -73.9626 + 0.060;
BEGIN
  RETURN QUERY
  WITH circle AS (
    SELECT following_id FROM follows
    WHERE follower_id = v_user AND status = 'active'
  ),
  near AS (
    SELECT count(DISTINCT p.place_id) AS n
    FROM pins p JOIN places pl ON pl.id = p.place_id
    WHERE pl.category = v_place_cat
      AND pl.lat BETWEEN v_min_lat AND v_max_lat
      AND pl.lng BETWEEN v_min_lng AND v_max_lng
  ),
  circ AS (
    SELECT count(*) AS n
    FROM pins p JOIN places pl ON pl.id = p.place_id
    WHERE pl.category = v_place_cat
      AND p.user_id IN (SELECT following_id FROM circle)
  ),
  my_places AS (
    SELECT place_id FROM rankings
    WHERE user_id = v_user AND category = p_discover_cat
  ),
  overlap_users AS (
    SELECT DISTINCT r.user_id FROM rankings r
    WHERE r.category = p_discover_cat
      AND r.user_id <> v_user
      AND r.place_id IN (SELECT place_id FROM my_places)
  ),
  tw AS (
    SELECT count(DISTINCT r.place_id) AS n
    FROM rankings r
    WHERE r.category = p_discover_cat
      AND r.user_id IN (SELECT user_id FROM overlap_users)
  ),
  expert_users AS (
    SELECT user_id FROM rankings
    WHERE category = p_discover_cat
    GROUP BY user_id HAVING count(*) >= 10
  ),
  ex AS (
    SELECT count(DISTINCT place_id) AS n
    FROM rankings
    WHERE category = p_discover_cat
      AND user_id IN (SELECT user_id FROM expert_users)
  ),
  wish AS (
    SELECT count(*) AS n FROM (
      SELECT p.place_id
      FROM pins p JOIN places pl ON pl.id = p.place_id
      WHERE pl.category = v_place_cat
        AND p.status = 'want_to_go'
        AND p.user_id IN (SELECT following_id FROM circle)
      GROUP BY p.place_id
      HAVING count(*) > 1
    ) w
  )
  SELECT
    (SELECT n FROM near)::integer,
    (SELECT n FROM circ)::integer,
    (SELECT n FROM tw)::integer,
    (SELECT n FROM ex)::integer,
    (SELECT n FROM wish)::integer;
END;
$$;
