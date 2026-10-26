-- ============================================================
-- FILO 2.0 — GROUNDED DISCOVERY — 2026-10-26
-- ============================================================
-- Search and discovery that only ever return REAL `places` rows with the
-- evidence behind them. No synthetic venues, no invented social proof.
--
--  1. Lexical index: tsvector over name + tags + neighborhood + address,
--     plus trigram similarity for typos / partial names.
--  2. search_places(): hybrid retrieval with structured filters (category,
--     distance, "friends saved it") and social reranking. Returns score
--     components so the client can explain results honestly.
--  3. discover_lens(): the six discovery lenses as real queries with
--     evidence, empty when data is insufficient.
--
-- All functions are SECURITY INVOKER: pins/rankings RLS (privacy) applies.
-- Idempotent.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ─── 1. Search document ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION place_search_doc(p_name text, p_tags text[], p_neighborhood text, p_address text, p_category text)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT setweight(to_tsvector('english', coalesce(p_name, '')), 'A')
      || setweight(to_tsvector('english', array_to_string(coalesce(p_tags, '{}'), ' ')), 'B')
      || setweight(to_tsvector('english', coalesce(p_category, '')), 'B')
      || setweight(to_tsvector('english', coalesce(p_neighborhood, '')), 'C')
      || setweight(to_tsvector('english', coalesce(p_address, '')), 'D');
$$;

ALTER TABLE places ADD COLUMN IF NOT EXISTS search_doc tsvector
  GENERATED ALWAYS AS (place_search_doc(name, tags, neighborhood, address, category)) STORED;

CREATE INDEX IF NOT EXISTS places_search_doc_idx ON places USING gin (search_doc);
CREATE INDEX IF NOT EXISTS places_name_trgm_idx ON places USING gin (name extensions.gin_trgm_ops);

-- Great-circle distance in metres (no PostGIS dependency).
CREATE OR REPLACE FUNCTION geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;


-- ─── 2. Hybrid search ──────────────────────────────────────────────
-- p_text        free text after the client parser removed filter phrases
-- p_terms       optional OR-terms (attribute synonyms the parser mapped,
--               e.g. "quiet" → {coffee, cafe, bookstore}); matched against
--               the real tags only
-- p_category    canonical category filter (nullable)
-- p_near_*      center for distance ranking / radius filter (nullable)
-- p_friends_only  only places someone you follow has pinned
CREATE OR REPLACE FUNCTION search_places(
  p_text          text,
  p_terms         text[] DEFAULT '{}',
  p_category      text DEFAULT NULL,
  p_near_lat      double precision DEFAULT NULL,
  p_near_lng      double precision DEFAULT NULL,
  p_radius_m      integer DEFAULT NULL,
  p_friends_only  boolean DEFAULT false,
  p_limit         integer DEFAULT 20
)
RETURNS TABLE (
  place_id       uuid,
  name           text,
  category       text,
  neighborhood   text,
  address        text,
  lat            double precision,
  lng            double precision,
  tags           text[],
  text_score     real,
  friend_count   integer,
  friend_names   text[],
  friend_top_rank integer,
  my_status      text,
  distance_m     double precision,
  score          double precision
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
#variable_conflict use_column
DECLARE
  v_me uuid := auth.uid();
  v_q tsquery;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
  v_terms text[] := coalesce(p_terms, '{}');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_text IS NOT NULL AND char_length(v_text) > 200 THEN v_text := left(v_text, 200); END IF;
  v_q := CASE WHEN v_text IS NULL THEN NULL ELSE websearch_to_tsquery('english', v_text) END;
  IF array_length(v_terms, 1) > 0 THEN
    v_q := CASE WHEN v_q IS NULL THEN to_tsquery('english', array_to_string(
                  ARRAY(SELECT quote_literal(t) || ':*' FROM unnest(v_terms) t WHERE t ~ '^[a-z]+$'), ' | '))
                ELSE v_q END;
  END IF;

  RETURN QUERY
  WITH friends AS (
    SELECT f.following_id AS uid FROM follows f WHERE f.follower_id = v_me AND f.status = 'active'
  ),
  cand AS (
    SELECT pl.*,
      CASE
        WHEN v_q IS NULL AND v_text IS NULL THEN 0::real
        ELSE greatest(
          coalesce(ts_rank_cd(pl.search_doc, v_q, 32), 0),
          CASE WHEN v_text IS NULL THEN 0 ELSE similarity(pl.name, v_text) END,
          CASE WHEN array_length(v_terms, 1) > 0 AND pl.tags && v_terms THEN 0.3 ELSE 0 END
        )::real
      END AS ts,
      CASE WHEN p_near_lat IS NULL OR p_near_lng IS NULL THEN NULL
           ELSE geo_distance_m(p_near_lat, p_near_lng, pl.lat, pl.lng) END AS dist
    FROM places pl
    WHERE (p_category IS NULL OR pl.category = p_category)
      AND (
        (v_q IS NULL AND v_text IS NULL)
        OR pl.search_doc @@ v_q
        OR (v_text IS NOT NULL AND pl.name % v_text)
        OR (array_length(v_terms, 1) > 0 AND pl.tags && v_terms)
      )
  ),
  social AS (
    -- RLS on pins/rankings: only friends whose content is visible count.
    SELECT p.place_id,
           count(DISTINCT p.user_id)::int AS n,
           (array_agg(DISTINCT u.username))[1:3] AS names
    FROM pins p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id IN (SELECT uid FROM friends)
    GROUP BY p.place_id
  ),
  fr_rank AS (
    SELECT r.place_id, min(r.position)::int AS best
    FROM rankings r WHERE r.user_id IN (SELECT uid FROM friends)
    GROUP BY r.place_id
  ),
  mine AS (SELECT p.place_id, p.status FROM pins p WHERE p.user_id = v_me)
  SELECT c.id, c.name, c.category, c.neighborhood, c.address, c.lat, c.lng, c.tags,
         c.ts,
         coalesce(s.n, 0),
         coalesce(s.names, '{}'),
         fr.best,
         m.status,
         c.dist,
         -- Blend: relevance first; social evidence and proximity break ties.
         (c.ts * 1.0)
           + least(coalesce(s.n, 0), 5) * 0.08
           + CASE WHEN fr.best IS NULL THEN 0 ELSE 0.12 / fr.best END
           + CASE WHEN c.dist IS NULL THEN 0 ELSE greatest(0, 0.1 - c.dist / 30000.0) END
    FROM cand c
    LEFT JOIN social s ON s.place_id = c.id
    LEFT JOIN fr_rank fr ON fr.place_id = c.id
    LEFT JOIN mine m ON m.place_id = c.id
    WHERE (NOT p_friends_only OR coalesce(s.n, 0) > 0)
      AND (p_radius_m IS NULL OR c.dist IS NULL OR c.dist <= p_radius_m)
    ORDER BY 15 DESC, c.name
    LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
END;
$$;


-- ─── 3. Discovery lenses ───────────────────────────────────────────
-- Each lens returns places + a jsonb `evidence` object built only from
-- rows the caller can see. Thresholds are deliberately conservative so a
-- lens shows nothing rather than over-claim from one or two data points.
CREATE OR REPLACE FUNCTION discover_lens(p_lens text, p_category text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (place_id uuid, name text, category text, neighborhood text, lat double precision, lng double precision, evidence jsonb)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me uuid := auth.uid();
  v_lim integer := greatest(1, least(coalesce(p_limit, 20), 50));
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF p_lens = 'trending' THEN
    -- Distinct people pinning near campus in the last 14 days (≥ 2 people).
    RETURN QUERY
    SELECT pl.id, pl.name, pl.category, pl.neighborhood, pl.lat, pl.lng,
           jsonb_build_object('recent_pinners', count(DISTINCT p.user_id), 'window_days', 14)
    FROM pins p JOIN places pl ON pl.id = p.place_id
    WHERE p.created_at > now() - interval '14 days'
      AND (p_category IS NULL OR pl.category = p_category)
      AND geo_distance_m(40.8075, -73.9626, pl.lat, pl.lng) < 2500
    GROUP BY pl.id
    HAVING count(DISTINCT p.user_id) >= 2
    ORDER BY count(DISTINCT p.user_id) DESC, max(p.created_at) DESC
    LIMIT v_lim;

  ELSIF p_lens = 'new_to_network' THEN
    -- Friends pinned it in the last 30 days; you haven't.
    RETURN QUERY
    SELECT pl.id, pl.name, pl.category, pl.neighborhood, pl.lat, pl.lng,
           jsonb_build_object('friends', (array_agg(DISTINCT u.username))[1:3], 'friend_count', count(DISTINCT p.user_id))
    FROM pins p
    JOIN places pl ON pl.id = p.place_id
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = v_me AND status = 'active')
      AND p.created_at > now() - interval '30 days'
      AND (p_category IS NULL OR pl.category = p_category)
      AND NOT EXISTS (SELECT 1 FROM pins mp WHERE mp.user_id = v_me AND mp.place_id = pl.id)
    GROUP BY pl.id
    ORDER BY count(DISTINCT p.user_id) DESC, max(p.created_at) DESC
    LIMIT v_lim;

  ELSIF p_lens = 'disagree' THEN
    -- Ranked by ≥ 2 friends whose percentile positions differ by ≥ 0.5.
    RETURN QUERY
    WITH fr AS (
      SELECT r.place_id, r.user_id, u.username,
             (r.position - 1)::float / greatest(1, (SELECT count(*) FROM rankings x WHERE x.user_id = r.user_id AND x.category = r.category) - 1) AS pct
      FROM rankings r JOIN users u ON u.id = r.user_id
      WHERE r.user_id IN (SELECT following_id FROM follows WHERE follower_id = v_me AND status = 'active')
        AND (p_category IS NULL OR r.category = p_category)
    )
    SELECT pl.id, pl.name, pl.category, pl.neighborhood, pl.lat, pl.lng,
           jsonb_build_object(
             'loves', (SELECT username FROM fr f2 WHERE f2.place_id = pl.id ORDER BY pct ASC LIMIT 1),
             'meh',   (SELECT username FROM fr f3 WHERE f3.place_id = pl.id ORDER BY pct DESC LIMIT 1),
             'spread', round((max(fr.pct) - min(fr.pct))::numeric, 2))
    FROM fr JOIN places pl ON pl.id = fr.place_id
    GROUP BY pl.id
    HAVING count(*) >= 2 AND max(fr.pct) - min(fr.pct) >= 0.5
    ORDER BY max(fr.pct) - min(fr.pct) DESC
    LIMIT v_lim;

  ELSIF p_lens = 'hidden_gems' THEN
    -- A friend ranks it in their top third, and ≤ 3 people (visible) pinned it.
    RETURN QUERY
    WITH fr AS (
      SELECT r.place_id, u.username, r.position,
             (SELECT count(*) FROM rankings x WHERE x.user_id = r.user_id AND x.category = r.category) AS total
      FROM rankings r JOIN users u ON u.id = r.user_id
      WHERE r.user_id IN (SELECT following_id FROM follows WHERE follower_id = v_me AND status = 'active')
        AND (p_category IS NULL OR r.category = p_category)
    )
    SELECT pl.id, pl.name, pl.category, pl.neighborhood, pl.lat, pl.lng,
           jsonb_build_object('ranked_by', min(fr.username), 'position', min(fr.position), 'of', max(fr.total),
                              'pinners', (SELECT count(DISTINCT p.user_id) FROM pins p WHERE p.place_id = pl.id))
    FROM fr JOIN places pl ON pl.id = fr.place_id
    WHERE fr.total >= 3 AND fr.position <= greatest(1, ceil(fr.total / 3.0))
      AND (SELECT count(DISTINCT p.user_id) FROM pins p WHERE p.place_id = pl.id) <= 3
      AND NOT EXISTS (SELECT 1 FROM pins mp WHERE mp.user_id = v_me AND mp.place_id = pl.id)
    GROUP BY pl.id
    ORDER BY min(fr.position::float / fr.total)
    LIMIT v_lim;

  ELSIF p_lens = 'most_pinned' THEN
    RETURN QUERY
    SELECT pl.id, pl.name, pl.category, pl.neighborhood, pl.lat, pl.lng,
           jsonb_build_object('pinners', count(DISTINCT p.user_id),
                              'been', count(DISTINCT p.user_id) FILTER (WHERE p.status = 'visited'))
    FROM pins p JOIN places pl ON pl.id = p.place_id
    WHERE (p_category IS NULL OR pl.category = p_category)
    GROUP BY pl.id
    HAVING count(DISTINCT p.user_id) >= 2
    ORDER BY count(DISTINCT p.user_id) DESC, pl.name
    LIMIT v_lim;

  ELSE
    RAISE EXCEPTION 'unknown lens %', p_lens USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION search_places(text, text[], text, double precision, double precision, integer, boolean, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION search_places(text, text[], text, double precision, double precision, integer, boolean, integer) TO authenticated;
REVOKE ALL ON FUNCTION discover_lens(text, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION discover_lens(text, text, integer) TO authenticated;
