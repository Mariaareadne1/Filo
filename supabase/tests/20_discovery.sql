-- Discovery: search relevance, filters, privacy, lens evidence & thresholds.
\set QUIET on
BEGIN;
CREATE SCHEMA IF NOT EXISTS t;
CREATE OR REPLACE FUNCTION t.as_user(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;
CREATE OR REPLACE FUNCTION t.ok(p_label text, p_cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF; RAISE NOTICE 'ok   %', p_label; END $$;
GRANT USAGE ON SCHEMA t TO authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO authenticated;

INSERT INTO users (id, email, username, display_name, is_private) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'me@columbia.edu', 'mee', 'Me', false),
  ('a0000000-0000-0000-0000-000000000002', 'f1@columbia.edu', 'fone', 'F One', false),
  ('a0000000-0000-0000-0000-000000000003', 'f2@columbia.edu', 'ftwo', 'F Two', false),
  ('a0000000-0000-0000-0000-000000000004', 'pv@columbia.edu', 'secret', 'Private', true);
INSERT INTO follows (follower_id, following_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003');
-- the private account is NOT followed

INSERT INTO places (id, google_place_id, source, name, address, category, lat, lng, tags, neighborhood) VALUES
  ('b0000000-0000-0000-0000-000000000001','mbx_quietcafe_000001','mapbox','Hungarian Pastry Shop','1030 Amsterdam Ave','cafe',40.8036,-73.9633,'{café,coffee,bakery}','Morningside Heights'),
  ('b0000000-0000-0000-0000-000000000002','mbx_cocktail_0000001','mapbox','Dear Irving','55 Irving Pl','bar',40.7370,-73.9870,'{cocktail bar,bar}','Gramercy'),
  ('b0000000-0000-0000-0000-000000000003','mbx_vintage_00000001','mapbox','Procell','5 Delancey St','retail',40.7200,-73.9930,'{vintage store,clothing store}','Lower East Side'),
  ('b0000000-0000-0000-0000-000000000004','mbx_joecoffee_000001','mapbox','Joe Coffee','550 W 120th St','cafe',40.8079,-73.9610,'{café,coffee,coffee shop}','Morningside Heights'),
  ('b0000000-0000-0000-0000-000000000005','mbx_farcafe_00000001','mapbox','Far Away Cafe','1 Bay St','cafe',40.6400,-74.0200,'{café,coffee}','Bay Ridge');
-- f1 & f2 pinned Joe Coffee; f1 ranks it #1 of 3; f2 ranks it #3 of 3 → disagreement.
INSERT INTO pins (user_id, place_id, status, created_at) VALUES
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000004','visited', now() - interval '2 days'),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000004','visited', now() - interval '3 days'),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','visited', now() - interval '40 days'),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000005','visited', now() - interval '1 day'),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','visited', now() - interval '1 day'),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000005','visited', now() - interval '1 day'),
  ('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002','visited', now() - interval '1 day');
INSERT INTO rankings (user_id, place_id, category, position) VALUES
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000004','cafe',1),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','cafe',2),
  ('a0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000005','cafe',3),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','cafe',1),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000005','cafe',2),
  ('a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000004','cafe',3);

SELECT t.as_user('a0000000-0000-0000-0000-000000000001');
SELECT t.ok('name search finds the venue (typo-tolerant)',
  (SELECT name FROM search_places('hungarian pastri') LIMIT 1) = 'Hungarian Pastry Shop');
SELECT t.ok('tag search: "vintage" finds the vintage store',
  (SELECT name FROM search_places('vintage') LIMIT 1) = 'Procell');
SELECT t.ok('category filter excludes other categories',
  NOT EXISTS (SELECT 1 FROM search_places('', '{coffee}', 'bar')));
SELECT t.ok('attribute terms match real tags only',
  (SELECT count(*) FROM search_places('', '{coffee}', 'cafe')) = 3);
SELECT t.ok('radius filter drops the far cafe',
  NOT EXISTS (SELECT 1 FROM search_places('', '{coffee}', 'cafe', 40.8075, -73.9626, 2000) WHERE name = 'Far Away Cafe'));
SELECT t.ok('friends-only returns places friends pinned',
  (SELECT array_agg(name ORDER BY name) FROM search_places('', '{coffee}', 'cafe', NULL, NULL, NULL, true))
   = ARRAY['Far Away Cafe','Hungarian Pastry Shop','Joe Coffee']);
SELECT t.ok('social evidence: two friends on Joe Coffee',
  (SELECT friend_count FROM search_places('joe coffee') WHERE name = 'Joe Coffee') = 2);
SELECT t.ok('private account pins never leak into social counts',
  (SELECT friend_count FROM search_places('dear irving') WHERE name = 'Dear Irving') = 0);
SELECT t.ok('irrelevant query returns nothing (no padding)',
  NOT EXISTS (SELECT 1 FROM search_places('zzqxv nonsense')));
SELECT t.ok('lens new_to_network: recent friend pins I have not saved',
  (SELECT count(*) FROM discover_lens('new_to_network')) = 3);
SELECT t.ok('lens new_to_network excludes old (>30d) friend activity',
  (SELECT (evidence->>'friend_count')::int FROM discover_lens('new_to_network') WHERE name = 'Hungarian Pastry Shop') = 1);
SELECT t.ok('lens disagree: Joe Coffee (#1 vs #3) with names',
  (SELECT evidence->>'loves' || '/' || (evidence->>'meh') FROM discover_lens('disagree') WHERE name = 'Joe Coffee') = 'fone/ftwo');
SELECT t.ok('lens trending requires >=2 recent pinners near campus',
  (SELECT array_agg(name ORDER BY name) FROM discover_lens('trending')) = ARRAY['Joe Coffee']);
SELECT t.ok('lens most_pinned counts distinct people',
  (SELECT (evidence->>'pinners')::int FROM discover_lens('most_pinned') WHERE name = 'Joe Coffee') = 2);
SELECT t.ok('lens hidden_gems: friend top-third and few pinners',
  EXISTS (SELECT 1 FROM discover_lens('hidden_gems') WHERE name IN ('Joe Coffee','Hungarian Pastry Shop')));
DO $$ BEGIN
  PERFORM discover_lens('made_up');
  RAISE EXCEPTION 'FAIL unknown lens accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok   unknown lens rejected';
END $$;
RESET role;
ROLLBACK;
\echo '20_discovery: passed'
