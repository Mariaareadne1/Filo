-- Asserts the outcome of fixtures/before_20261026000000.sql after migrating.
DO $$
DECLARE v text[];
BEGIN
  SELECT array_agg(category || ':' || position ORDER BY category, position) INTO v
    FROM rankings WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000005';
  IF v IS DISTINCT FROM ARRAY['bar:1','bar:2','cafe:1'] THEN
    RAISE EXCEPTION 'FAIL legacy rankings not merged/renumbered: %', v;
  END IF;
  IF (SELECT category FROM places WHERE id = '11111111-0000-0000-0000-000000000001') <> 'cafe' THEN
    RAISE EXCEPTION 'FAIL ranked-as-cafe place not promoted to cafe';
  END IF;
  IF EXISTS (SELECT 1 FROM places WHERE photo_url LIKE '%key=%') THEN
    RAISE EXCEPTION 'FAIL API key still stored in photo_url';
  END IF;
  IF (SELECT photo_url FROM places WHERE id = '11111111-0000-0000-0000-000000000001')
     <> 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=REF1' THEN
    RAISE EXCEPTION 'FAIL photo reference damaged while stripping key';
  END IF;
  IF (SELECT count(*) FROM pins WHERE user_id = 'eeeeeeee-0000-0000-0000-000000000005') <> 3 THEN
    RAISE EXCEPTION 'FAIL user pins lost during upgrade';
  END IF;
  RAISE NOTICE 'ok   legacy data upgraded without loss';
END $$;
\echo '30_legacy_upgrade: passed'
