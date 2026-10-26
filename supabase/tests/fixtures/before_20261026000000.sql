-- Legacy production-shaped data, loaded right BEFORE the Filo 2.0 integrity
-- migration so the upgrade path (vocabulary merge, key stripping, renumber)
-- is tested against realistic pre-existing rows.
INSERT INTO users (id, email, username, display_name) VALUES
  ('eeeeeeee-0000-0000-0000-000000000005', 'eve@columbia.edu', 'eve', 'Eve');
INSERT INTO places (id, google_place_id, name, address, category, lat, lng, photo_url) VALUES
  ('11111111-0000-0000-0000-000000000001', 'ChIJlegacy00000001', 'Legacy Cafe', 'a', 'food', 40.80, -73.96,
   'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=REF1&key=AIzaLEAKED'),
  ('11111111-0000-0000-0000-000000000002', 'ChIJlegacy00000002', 'Legacy Bar A', 'a', 'bar', 40.80, -73.96, null),
  ('11111111-0000-0000-0000-000000000003', 'ChIJlegacy00000003', 'Legacy Bar B', 'a', 'bar', 40.80, -73.96, null);
INSERT INTO pins (user_id, place_id, status) VALUES
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'visited'),
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002', 'visited'),
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003', 'visited');
-- Old discover vocab + the map path's place vocab for the SAME list,
-- including the same place in both ('bars' and 'bar') → must merge.
INSERT INTO rankings (user_id, place_id, category, position) VALUES
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'cafes', 1),
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002', 'bars', 1),
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003', 'bars', 2),
  ('eeeeeeee-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002', 'bar', 1);
