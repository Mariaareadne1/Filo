// Seeds the LOCAL dev stack (never production) with:
//   • REAL venues — fetched from Mapbox Search Box (category search) with the
//     public map token in .env.local, stored exactly as the app stores them;
//   • clearly-labelled TEST people (@filo.test) with pins, rankings, follows
//     and boards, generated deterministically so screenshots are repeatable.
// Usage: node scripts/local-stack/seed.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const TOKEN = /^EXPO_PUBLIC_MAPBOX_TOKEN=(.+)$/m.exec(envText)?.[1]?.trim();
if (!TOKEN) throw new Error('EXPO_PUBLIC_MAPBOX_TOKEN missing from .env.local');

// [Filo category, Mapbox category id, proximity "lng,lat"]
const COLUMBIA = '-73.9626,40.8075';
const UWS = '-73.9754,40.7870';
const LES = '-73.9880,40.7190';
const QUERIES = [
  ['cafe', 'coffee', COLUMBIA], ['cafe', 'cafe', UWS],
  ['food', 'restaurant', COLUMBIA], ['food', 'pizza_restaurant', UWS], ['food', 'restaurant', LES],
  ['bar', 'cocktail_bar', UWS], ['bar', 'bar', COLUMBIA], ['bar', 'bar', LES],
  ['retail', 'clothing_store', LES], ['retail', 'bookstore', UWS],
  ['beauty', 'nail_salon', UWS],
  ['experience', 'museum', UWS], ['experience', 'climbing_gym', COLUMBIA],
];

async function categorySearch(cat, near) {
  const u = new URL(`https://api.mapbox.com/search/searchbox/v1/category/${cat}`);
  u.searchParams.set('proximity', near);
  u.searchParams.set('limit', '6');
  u.searchParams.set('access_token', TOKEN);
  const r = await fetch(u);
  const j = await r.json();
  if (!Array.isArray(j.features)) throw new Error(`Mapbox search failed for ${cat}: ${j.message ?? r.status}`);
  return j.features;
}

// Deterministic PRNG (mulberry32).
let seed = 20261026;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

const venues = new Map();
for (const [category, mbCat, near] of QUERIES) {
  for (const f of await categorySearch(mbCat, near)) {
    const p = f.properties;
    if (venues.has(p.mapbox_id)) continue;
    venues.set(p.mapbox_id, {
      gid: p.mapbox_id,
      name: p.name,
      address: p.full_address ?? p.address ?? '',
      category,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      tags: (p.poi_category ?? []).filter((t) => !['food', 'food and drink'].includes(t)),
      neighborhood: p.context?.neighborhood?.name ?? null,
    });
  }
}
const V = [...venues.values()];
console.log(`fetched ${V.length} real venues`);

// Test people. `you@filo.test` is the account used in the simulator.
const PEOPLE = [
  { u: 'you', name: 'You (test)', priv: false },
  { u: 'ada', name: 'Ada (test)', priv: false },
  { u: 'bea', name: 'Bea (test)', priv: true },
  { u: 'cal', name: 'Cal (test)', priv: false },
  { u: 'dee', name: 'Dee (test)', priv: false },
  { u: 'eli', name: 'Eli (test)', priv: false },
];

const sql = ['BEGIN;', "DELETE FROM auth.users WHERE email LIKE '%@filo.test';",
  "DELETE FROM users WHERE email LIKE '%@filo.test';",
  "SET CONSTRAINTS ALL DEFERRED;"];
const ids = {};
for (const p of PEOPLE) {
  ids[p.u] = crypto.randomUUID();
  sql.push(`INSERT INTO auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES ('00000000-0000-0000-0000-000000000000', '${ids[p.u]}', 'authenticated', 'authenticated', '${p.u}@filo.test', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');`);
  sql.push(`INSERT INTO users (id, email, username, display_name, is_private, onboarding_complete)
    VALUES ('${ids[p.u]}', '${p.u}@filo.test', '${p.u}', ${q(p.name)}, ${p.priv}, ${p.u !== 'you'});`);
}
for (const v of V) {
  const tags = `ARRAY[${v.tags.map(q).join(',')}]::text[]`;
  sql.push(`INSERT INTO places (google_place_id, name, address, category, lat, lng, source, tags, neighborhood)
    VALUES (${q(v.gid)}, ${q(v.name)}, ${q(v.address)}, '${v.category}', ${v.lat}, ${v.lng}, 'mapbox', ${tags}, ${q(v.neighborhood)})
    ON CONFLICT (google_place_id) DO NOTHING;`);
}

// A shared "taste" ordering per category; each person's ranking is a noisy
// copy, so twins/correlation are meaningful but not identical.
const IMPRESSIONS = ['the corner table is the move', 'go before 10am', 'worth the line',
  'quiet on weekday afternoons', 'great for a first date', 'cash only', null, null, null];
const byCat = {};
for (const v of V) (byCat[v.category] ??= []).push(v);

for (const p of PEOPLE.filter((x) => x.u !== 'you')) {
  const mine = pick(V, 10 + Math.floor(rand() * 6));
  const visitedSet = new Set();
  for (const v of mine) {
    const status = rand() < 0.7 ? 'visited' : 'want_to_go';
    if (status === 'visited') visitedSet.add(v.gid);
    const days = Math.floor(rand() * 40);
    sql.push(`INSERT INTO pins (user_id, place_id, status, impression, created_at)
      SELECT '${ids[p.u]}', id, '${status}', ${q(IMPRESSIONS[Math.floor(rand() * IMPRESSIONS.length)])}, now() - interval '${days} days ${Math.floor(rand() * 20)} hours'
      FROM places WHERE google_place_id = ${q(v.gid)};`);
  }
  for (const [cat, list] of Object.entries(byCat)) {
    const visited = mine.filter((v) => v.category === cat && visitedSet.has(v.gid));
    const order = visited
      .map((v) => ({ v, score: list.indexOf(v) + (rand() - 0.5) * 3 }))
      .sort((a, b) => a.score - b.score);
    order.forEach(({ v }, i) => {
      sql.push(`INSERT INTO rankings (user_id, place_id, category, position)
        SELECT '${ids[p.u]}', id, '${cat}', ${i + 1} FROM places WHERE google_place_id = ${q(v.gid)};`);
    });
  }
}

// Social graph: you follow ada, cal, dee; bea (private) has a pending request
// from you; eli follows you (an incoming follower).
const follow = (a, b, s = 'active') =>
  sql.push(`INSERT INTO follows (follower_id, following_id, status) VALUES ('${ids[a]}', '${ids[b]}', '${s}');`);
follow('you', 'ada'); follow('you', 'cal'); follow('you', 'dee');
follow('you', 'bea'); // trigger forces pending (bea is private)
follow('eli', 'you'); follow('ada', 'cal'); follow('cal', 'ada'); follow('dee', 'ada');
// Fix the trigger-set status for the seed's intentional public follows.
sql.push(`UPDATE follows SET status = 'active' WHERE following_id <> '${ids.bea}';`);
// GoTrue scans these as non-null strings; rows inserted directly need ''.
sql.push(`UPDATE auth.users SET confirmation_token = '', recovery_token = '', email_change_token_new = '',
  email_change = '', phone_change = '', phone_change_token = '', email_change_token_current = '',
  reauthentication_token = '' WHERE email LIKE '%@filo.test';`);

sql.push(`INSERT INTO boards (user_id, name, description, visibility)
  VALUES ('${ids.ada}', 'Morningside essentials', 'Where I actually go between classes.', 'public');`);
sql.push(`INSERT INTO board_pins (board_id, pin_id, position)
  SELECT b.id, p.id, row_number() OVER (ORDER BY p.created_at) - 1
  FROM boards b JOIN pins p ON p.user_id = b.user_id
  WHERE b.name = 'Morningside essentials' LIMIT 6;`);
sql.push('COMMIT;');

execFileSync('docker', ['exec', '-i', 'filo-db', 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'], {
  input: sql.join('\n'),
  stdio: ['pipe', 'inherit', 'inherit'],
});
const count = execFileSync('docker', ['exec', 'filo-db', 'psql', '-At', '-U', 'supabase_admin', '-d', 'postgres', '-c',
  "select (select count(*) from places)||' places, '||(select count(*) from pins)||' pins, '||(select count(*) from rankings)||' rankings, '||(select count(*) from follows)||' follows'"]).toString();
console.log(`seeded: ${count.trim()}`);
