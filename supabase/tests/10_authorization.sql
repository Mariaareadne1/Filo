-- ============================================================
-- Authorization & integrity suite (positive + NEGATIVE cases).
-- Runs as supabase_admin; impersonates users by switching to the
-- `authenticated` / `anon` role with request.jwt.claims, exactly how
-- PostgREST evaluates RLS for a real request.
-- Every failure raises, so psql ON_ERROR_STOP aborts the run.
-- ============================================================
\set QUIET on
BEGIN;

CREATE SCHEMA IF NOT EXISTS t;
GRANT USAGE ON SCHEMA t TO authenticated, anon;

CREATE OR REPLACE FUNCTION t.act_as(p_uid uuid, p_email text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  -- The bare image's auth.uid()/auth.email() read the legacy per-claim
  -- settings; hosted Supabase reads the JSON above. Set both.
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claim.email', p_email, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION t.act_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.email', '', true);
  PERFORM set_config('role', 'anon', true);
END $$;

-- Runs p_sql and asserts it raises (any error). p_label names the case.
CREATE OR REPLACE FUNCTION t.must_fail(p_label text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ok   (denied) %', p_label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL expected denial: %', p_label;
END $$;

CREATE OR REPLACE FUNCTION t.check(p_label text, p_cond boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
  RAISE NOTICE 'ok   %', p_label;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO authenticated, anon;

-- ─── Fixtures (as admin) ───────────────────────────────────────────
-- A: public, B: private, C: public, G: signed in with a gmail account
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ada@columbia.edu'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bea@barnard.edu'),
  ('cccccccc-0000-0000-0000-000000000003', 'cal@columbia.edu'),
  ('dddddddd-0000-0000-0000-000000000004', 'gus@gmail.com');

-- ─── users: profile creation is bound to the authenticated email ───
SELECT t.act_as('dddddddd-0000-0000-0000-000000000004', 'gus@gmail.com');
SELECT t.must_fail('gmail user claims a campus email on their profile',
  $$INSERT INTO users (id, email, username, display_name)
    VALUES ('dddddddd-0000-0000-0000-000000000004', 'fake@columbia.edu', 'gus', 'Gus')$$);
SELECT t.must_fail('gmail user creates a gmail profile',
  $$INSERT INTO users (id, email, username, display_name)
    VALUES ('dddddddd-0000-0000-0000-000000000004', 'gus@gmail.com', 'gus', 'Gus')$$);
RESET role;

SELECT t.act_as('aaaaaaaa-0000-0000-0000-000000000001', 'ada@columbia.edu');
SELECT t.must_fail('create a profile for someone else',
  $$INSERT INTO users (id, email, username, display_name)
    VALUES ('cccccccc-0000-0000-0000-000000000003', 'ada@columbia.edu', 'notada', 'X')$$);
INSERT INTO users (id, email, username, display_name)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Ada@Columbia.edu', 'ada', 'Ada L');
RESET role;
SELECT t.act_as('bbbbbbbb-0000-0000-0000-000000000002', 'bea@barnard.edu');
INSERT INTO users (id, email, username, display_name, is_private)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'bea@barnard.edu', 'bea', 'Bea', true);
RESET role;
SELECT t.act_as('cccccccc-0000-0000-0000-000000000003', 'cal@columbia.edu');
INSERT INTO users (id, email, username, display_name)
  VALUES ('cccccccc-0000-0000-0000-000000000003', 'cal@columbia.edu', 'cal', 'Cal');

-- Column privacy: email/push token not readable by other users.
SELECT t.must_fail('read another user''s email', $$SELECT email FROM users$$);
SELECT t.must_fail('read push tokens', $$SELECT expo_push_token FROM users$$);
SELECT t.check('public profile columns readable',
  (SELECT count(*) FROM users WHERE username IN ('ada','bea','cal')) = 3);
SELECT t.must_fail('self-verify / change campus',
  $$UPDATE users SET campus = 'nyu' WHERE id = 'cccccccc-0000-0000-0000-000000000003'$$);
SELECT t.must_fail('change own email after signup',
  $$UPDATE users SET email = 'x@columbia.edu' WHERE id = 'cccccccc-0000-0000-0000-000000000003'$$);
RESET role;
SELECT t.check('emails normalised + verified on insert',
  (SELECT email = 'ada@columbia.edu' AND is_verified FROM users WHERE username = 'ada'));

-- ─── save_pin: venue dedupe (second pinner used to fail on RLS) ────
SELECT t.act_as('aaaaaaaa-0000-0000-0000-000000000001', 'ada@columbia.edu');
SELECT t.must_fail('insert a place directly (must go through save_pin)',
  $$INSERT INTO places (google_place_id, name, address, category, lat, lng)
    VALUES ('ChIJdirectinsert01', 'X', 'Y', 'food', 40.8, -73.9)$$);
CREATE TEMP TABLE ada_pin AS
  SELECT * FROM save_pin('ChIJcafe0000000001', 'Hungarian Pastry Shop', '1030 Amsterdam Ave',
                         'cafe', 40.8036, -73.9633,
                         'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=abc',
                         'visited', 'cozy, cash only');
SELECT t.check('first save creates pin', (SELECT created FROM ada_pin));
SELECT t.must_fail('impression longer than 150 chars',
  $$SELECT save_pin('ChIJcafe0000000001','n','a','cafe',40.8,-73.9,null,'visited', repeat('x',151))$$);
SELECT t.must_fail('invalid status',
  $$SELECT save_pin('ChIJcafe0000000001','n','a','cafe',40.8,-73.9,null,'loved', null)$$);
SELECT t.must_fail('invalid category',
  $$SELECT save_pin('ChIJcafe0000000099','n','a','gym',40.8,-73.9,null,'visited', null)$$);
SELECT rerank_place((SELECT place_id FROM ada_pin), 'cafe', 1);
SELECT save_pin('ChIJcafe0000000002', 'Joe Coffee', '550 W 120th St', 'cafe', 40.8079, -73.9610, null, 'visited', null);
SELECT rerank_place((SELECT id FROM places WHERE google_place_id = 'ChIJcafe0000000002'), 'cafe', 1);
SELECT save_pin('ChIJcafe0000000003', 'Max Caffe', '1262 Amsterdam Ave', 'cafe', 40.8090, -73.9590, null, 'visited', null);
SELECT rerank_place((SELECT id FROM places WHERE google_place_id = 'ChIJcafe0000000003'), 'cafe', 2);
SELECT t.check('ranking order after insertions is Joe, Max, Hungarian',
  (SELECT array_agg(pl.name ORDER BY r.position) FROM rankings r JOIN places pl ON pl.id = r.place_id
   WHERE r.user_id = auth.uid() AND r.category = 'cafe')
  = ARRAY['Joe Coffee','Max Caffe','Hungarian Pastry Shop']);
SELECT t.must_fail('rank a place you never pinned',
  $$SELECT rerank_place(gen_random_uuid(), 'cafe', 1)$$);
SELECT t.must_fail('rank in an unknown category',
  $$SELECT rerank_place((SELECT place_id FROM ada_pin), 'cafes', 1)$$);
RESET role;

SELECT t.act_as('cccccccc-0000-0000-0000-000000000003', 'cal@columbia.edu');
CREATE TEMP TABLE cal_pin AS
  SELECT * FROM save_pin('ChIJcafe0000000001', 'Renamed By Cal', 'elsewhere', 'bar', 0, 0, null, 'want_to_go', null);
SELECT t.check('second pinner reuses the same venue row',
  (SELECT place_id FROM cal_pin) = (SELECT place_id FROM ada_pin));
SELECT t.check('second pinner cannot rename/move the shared venue',
  (SELECT name = 'Hungarian Pastry Shop' AND lat > 40 AND category = 'cafe'
   FROM places WHERE google_place_id = 'ChIJcafe0000000001'));
-- RLS turns a cross-user UPDATE/DELETE into a 0-row no-op rather than an error.
UPDATE pins SET impression = 'hacked' WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM pins WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
RESET role;
SELECT t.check('another user''s pin survives a cross-user delete',
  (SELECT count(*) FROM pins WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 3);
SELECT t.act_as('cccccccc-0000-0000-0000-000000000003', 'cal@columbia.edu');
SELECT t.check('another user''s pin unchanged',
  (SELECT count(*) FROM pins WHERE impression = 'hacked') = 0);
RESET role;

-- ─── Private account: pins & rankings hidden until approved ───────
SELECT t.act_as('bbbbbbbb-0000-0000-0000-000000000002', 'bea@barnard.edu');
CREATE TEMP TABLE bea_pin AS
  SELECT * FROM save_pin('ChIJbar00000000001', 'The Abbey', '237 W 105th St', 'bar', 40.8003, -73.9671, null, 'visited', 'secret spot');
SELECT rerank_place((SELECT place_id FROM bea_pin), 'bar', 1);
RESET role;

SELECT t.act_as('cccccccc-0000-0000-0000-000000000003', 'cal@columbia.edu');
SELECT t.check('stranger cannot see private user''s pins',
  (SELECT count(*) FROM pins WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0);
SELECT t.check('stranger cannot see private user''s rankings',
  (SELECT count(*) FROM rankings WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0);
SELECT t.check('stranger CAN see public user''s rankings',
  (SELECT count(*) FROM rankings WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 3);
-- Request to follow Bea → forced pending even if client says active.
INSERT INTO follows (follower_id, following_id, status)
  VALUES ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002', 'active');
SELECT t.check('follow to private account lands pending',
  (SELECT status FROM follows WHERE follower_id = auth.uid()) = 'pending');
SELECT t.must_fail('requester self-approves pending follow',
  $q$DO $x$ BEGIN
      UPDATE follows SET status = 'active'
       WHERE follower_id = 'cccccccc-0000-0000-0000-000000000003';
      IF NOT EXISTS (SELECT 1 FROM follows WHERE follower_id = 'cccccccc-0000-0000-0000-000000000003' AND status = 'active')
      THEN RAISE EXCEPTION 'not approved'; END IF;
    END $x$ $q$);
SELECT t.check('still pending after self-approve attempt',
  (SELECT status FROM follows WHERE follower_id = auth.uid()) = 'pending');
SELECT t.must_fail('requester calls respond_follow_request for themselves',
  $$SELECT respond_follow_request('cccccccc-0000-0000-0000-000000000003', true)$$);
SELECT t.must_fail('forge a follow edge on someone else''s behalf',
  $$INSERT INTO follows (follower_id, following_id)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003')$$);
SELECT t.must_fail('follow yourself',
  $$INSERT INTO follows (follower_id, following_id)
    VALUES ('cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003')$$);
SELECT t.must_fail('spoof notify_new_follow as another follower',
  $$SELECT notify_new_follow('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')$$);
SELECT t.must_fail('read someone else''s friends feed',
  $$SELECT * FROM get_friends_feed('aaaaaaaa-0000-0000-0000-000000000001')$$);
RESET role;

SELECT t.act_as('bbbbbbbb-0000-0000-0000-000000000002', 'bea@barnard.edu');
SELECT t.check('private user accepts the request',
  respond_follow_request('cccccccc-0000-0000-0000-000000000003', true) = 'active');
RESET role;

SELECT t.act_as('cccccccc-0000-0000-0000-000000000003', 'cal@columbia.edu');
SELECT t.check('approved follower now sees private pins',
  (SELECT count(*) FROM pins WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1);
SELECT t.check('approved follower now sees private rankings',
  (SELECT count(*) FROM rankings WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1);
SELECT t.check('friends feed includes approved private friend',
  (SELECT count(*) FROM get_friends_feed(auth.uid())) = 1);
SELECT t.check('feed cursor excludes newer items',
  (SELECT count(*) FROM get_friends_feed(auth.uid(), now() - interval '1 day')) = 0);
RESET role;

-- ─── Boards: ownership, atomic ops, sharing ────────────────────────
SELECT t.act_as('aaaaaaaa-0000-0000-0000-000000000001', 'ada@columbia.edu');
INSERT INTO boards (user_id, name, visibility)
  VALUES (auth.uid(), 'Morningside Essentials', 'public');
CREATE TEMP TABLE ada_board AS
  SELECT id, share_token FROM boards WHERE name = 'Morningside Essentials';
GRANT SELECT ON ada_board TO anon;  -- fixture lookup only
SELECT t.check('server generated an unguessable share token',
  (SELECT share_token ~ '^[A-Za-z0-9_-]{16}$' FROM ada_board));
SELECT add_pin_to_board((SELECT id FROM ada_board), (SELECT pin_id FROM ada_pin));
SELECT add_pin_to_board((SELECT id FROM ada_board),
  (SELECT id FROM pins WHERE user_id = auth.uid() AND place_id = (SELECT id FROM places WHERE google_place_id = 'ChIJcafe0000000002')));
SELECT add_pin_to_board((SELECT id FROM ada_board), (SELECT pin_id FROM ada_pin));
SELECT t.check('re-adding a pin is idempotent',
  (SELECT count(*) FROM board_pins WHERE board_id = (SELECT id FROM ada_board)) = 2);
SELECT t.must_fail('add a private stranger''s pin to my board',
  $$SELECT add_pin_to_board((SELECT id FROM boards WHERE name = 'Morningside Essentials'),
                            (SELECT pin_id FROM bea_pin))$$);
SELECT reorder_board((SELECT id FROM ada_board),
  ARRAY(SELECT id FROM board_pins WHERE board_id = (SELECT id FROM ada_board) ORDER BY position DESC));
SELECT t.check('reorder persisted',
  (SELECT array_agg(pl.name ORDER BY bp.position) FROM board_pins bp
     JOIN pins p ON p.id = bp.pin_id JOIN places pl ON pl.id = p.place_id
    WHERE bp.board_id = (SELECT id FROM ada_board)) = ARRAY['Joe Coffee','Hungarian Pastry Shop']);
SELECT t.must_fail('reorder with a stale / foreign id list',
  $$SELECT reorder_board((SELECT id FROM boards WHERE name = 'Morningside Essentials'), ARRAY[gen_random_uuid()])$$);
INSERT INTO boards (user_id, name, visibility) VALUES (auth.uid(), 'Secret list', 'private');
RESET role;

SELECT t.act_as('cccccccc-0000-0000-0000-000000000003', 'cal@columbia.edu');
SELECT t.must_fail('rename someone else''s board',
  $q$DO $x$ BEGIN
      UPDATE boards SET name = 'pwned' WHERE name = 'Morningside Essentials';
      IF NOT EXISTS (SELECT 1 FROM boards WHERE name = 'pwned') THEN RAISE EXCEPTION 'denied'; END IF;
    END $x$ $q$);
SELECT t.must_fail('reorder someone else''s board',
  $$SELECT reorder_board((SELECT id FROM boards WHERE name = 'Morningside Essentials'), ARRAY[]::uuid[])$$);
SELECT t.check('private board invisible to others',
  (SELECT count(*) FROM boards WHERE name = 'Secret list') = 0);
RESET role;

-- Anonymous web viewer: public board via token only.
SELECT t.act_anon();
SELECT t.must_fail('anon reads boards table directly', $$SELECT 1/(SELECT count(*) FROM boards)::int$$);
SELECT t.check('anon resolves a public board by token',
  (get_shared_board((SELECT share_token FROM ada_board)) ->> 'name') = 'Morningside Essentials');
SELECT t.check('shared board lists its pins in board order',
  jsonb_array_length(get_shared_board((SELECT share_token FROM ada_board)) -> 'pins') = 2);
SELECT t.check('shared board never exposes emails',
  get_shared_board((SELECT share_token FROM ada_board))::text NOT LIKE '%@%');
SELECT t.check('garbage token returns nothing', get_shared_board('../../etc') IS NULL);
SELECT t.must_fail('anon calls save_pin',
  $$SELECT save_pin('ChIJcafe0000000005','n','a','cafe',40.8,-73.9,null,'visited',null)$$);
RESET role;

SELECT t.check('private board not resolvable even with its token',
  get_shared_board((SELECT share_token FROM boards WHERE name = 'Secret list')) IS NULL);

-- ─── Deleting a pin removes its rankings and closes the gap ────────
SELECT t.act_as('aaaaaaaa-0000-0000-0000-000000000001', 'ada@columbia.edu');
DELETE FROM pins WHERE user_id = auth.uid()
  AND place_id = (SELECT id FROM places WHERE google_place_id = 'ChIJcafe0000000003');
SELECT t.check('rankings renumbered contiguously after pin delete',
  (SELECT array_agg(position ORDER BY position) FROM rankings
    WHERE user_id = auth.uid() AND category = 'cafe') = ARRAY[1,2]);
SELECT remove_ranking((SELECT place_id FROM ada_pin), 'cafe');
SELECT t.check('remove_ranking leaves a contiguous list',
  (SELECT array_agg(position) FROM rankings WHERE user_id = auth.uid() AND category = 'cafe') = ARRAY[1]);
RESET role;

-- ─── Stored photo URLs never carry an API key ──────────────────────
SELECT t.must_fail('persist a Google key inside photo_url',
  $$UPDATE places SET photo_url = 'https://maps.googleapis.com/maps/api/place/photo?photo_reference=a&key=AIzaSECRET'
    WHERE google_place_id = 'ChIJcafe0000000002'$$);

ROLLBACK;
\echo '10_authorization: passed'
