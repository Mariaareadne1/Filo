/**
 * scripts/seed-mock-data.ts
 *
 * Seeds the Filo database with ten fake Columbia students, ~24 real
 * Morningside Heights places, ~85 pins, mutual follows that include
 * the real user, ~22 boards (2–3 per user, drawn from their favorite
 * categories), and rankings across the discover-screen categories.
 * The goal is to make the feed, friends map, discover screens, and
 * board surfaces feel alive in demos.
 *
 * Idempotent — re-running clears prior seed rows (identified by the
 * seed.filo.local email domain, NOT by username — usernames can
 * collide with real accounts) before recreating. Deletion cascades
 * to pins, follows, board_pins, boards via FK constraints in
 * schema.sql. Rankings are deleted explicitly first since that table
 * is not in schema.sql and may not have ON DELETE CASCADE wired up.
 *
 * Requires the SERVICE-ROLE key — RLS blocks INSERT into `users` for
 * any other identity (the policy is `auth.uid() = id`, which fake
 * users can never satisfy).
 *
 * Usage:
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   npx tsx scripts/seed-mock-data.ts
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ─── Config ──────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  SUPABASE_URL=https://<project>.supabase.co \\\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \\\n' +
      '  npx tsx scripts/seed-mock-data.ts',
  );
  process.exit(1);
}

if (SERVICE_KEY.length < 100) {
  console.warn(
    '! SUPABASE_SERVICE_ROLE_KEY looks short — make sure this is the ' +
      'service-role key, not the anon key. RLS will block this script ' +
      'with anon.',
  );
}

const REAL_USER_ID = '7bed6dfd-8dad-44a1-b993-72bd3153c5af';

/** Cleanup filter — every seed user gets an email at this domain so we
 *  can wipe prior seed rows without touching real accounts that happen
 *  to share a username. */
const SEED_EMAIL_DOMAIN = '@seed.filo.local';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── User personas ───────────────────────────────────────────────────

type RankingCat = 'cafes' | 'food' | 'bars' | 'shops' | 'experiences';

interface SeedUser {
  username: string;
  display_name: string;
  email: string;
  favorites: RankingCat[];
}

const FAKE_USERS: SeedUser[] = [
  { username: 'mayar',   display_name: 'Maya Rodriguez', email: 'mayar@seed.filo.local',   favorites: ['cafes', 'food'] },
  { username: 'amirt',   display_name: 'Amir Tahir',     email: 'amirt@seed.filo.local',   favorites: ['food', 'bars'] },
  { username: 'julesh',  display_name: 'Jules Hartwell', email: 'julesh@seed.filo.local',  favorites: ['cafes', 'shops', 'experiences'] },
  { username: 'sashak',  display_name: 'Sasha Kim',      email: 'sashak@seed.filo.local',  favorites: ['bars', 'food'] },
  { username: 'kaio',    display_name: 'Kai Okonkwo',    email: 'kaio@seed.filo.local',    favorites: ['experiences', 'cafes'] },
  { username: 'raew',    display_name: 'Rae Williams',   email: 'raew@seed.filo.local',    favorites: ['cafes', 'shops'] },
  { username: 'tomask',  display_name: 'Tomas Kovac',    email: 'tomask@seed.filo.local',  favorites: ['bars', 'food'] },
  { username: 'priyap',  display_name: 'Priya Patel',    email: 'priyap@seed.filo.local',  favorites: ['experiences', 'food'] },
  { username: 'noahf',   display_name: 'Noah Fischer',   email: 'noahf@seed.filo.local',   favorites: ['cafes', 'bars'] },
  { username: 'linamar', display_name: 'Lina Martin',    email: 'linamar@seed.filo.local', favorites: ['shops', 'experiences'] },
];

// ─── Real Morningside places ─────────────────────────────────────────

type PlaceCat = 'food' | 'bar' | 'beauty' | 'experience' | 'retail';

interface SeedPlace {
  google_place_id: string;
  name: string;
  address: string;
  category: PlaceCat;
  rankingCategory: RankingCat;
  lat: number;
  lng: number;
}

const PLACES: SeedPlace[] = [
  // ─── Cafes ─────────────────────────────────────────
  { google_place_id: 'seed_joe_columbia', name: 'Joe Coffee Company',          address: '550 W 120th St, New York, NY',                          category: 'food',       rankingCategory: 'cafes',       lat: 40.8094, lng: -73.9620 },
  { google_place_id: 'seed_hex',          name: 'Hex & Co.',                   address: '1247 Amsterdam Ave, New York, NY',                       category: 'food',       rankingCategory: 'cafes',       lat: 40.8082, lng: -73.9610 },
  { google_place_id: 'seed_orens',        name: "Oren's Daily Roast",          address: '2882 Broadway, New York, NY',                            category: 'food',       rankingCategory: 'cafes',       lat: 40.8061, lng: -73.9646 },
  { google_place_id: 'seed_kayser',       name: 'Maison Kayser',               address: '2873 Broadway, New York, NY',                            category: 'food',       rankingCategory: 'cafes',       lat: 40.8049, lng: -73.9650 },
  { google_place_id: 'seed_hungarian',    name: 'The Hungarian Pastry Shop',   address: '1030 Amsterdam Ave, New York, NY',                       category: 'food',       rankingCategory: 'cafes',       lat: 40.8049, lng: -73.9621 },
  { google_place_id: 'seed_brownies',     name: "Brownie's Cafe",              address: 'Avery Hall, Columbia University, New York, NY',          category: 'food',       rankingCategory: 'cafes',       lat: 40.8088, lng: -73.9614 },

  // ─── Restaurants ───────────────────────────────────
  { google_place_id: 'seed_toms',         name: "Tom's Restaurant",            address: '2880 Broadway, New York, NY',                            category: 'food',       rankingCategory: 'food',        lat: 40.8055, lng: -73.9649 },
  { google_place_id: 'seed_pisticci',     name: 'Pisticci',                    address: '125 La Salle St, New York, NY',                          category: 'food',       rankingCategory: 'food',        lat: 40.8121, lng: -73.9608 },
  { google_place_id: 'seed_community',    name: 'Community Food & Juice',      address: '2893 Broadway, New York, NY',                            category: 'food',       rankingCategory: 'food',        lat: 40.8089, lng: -73.9655 },
  { google_place_id: 'seed_lemonde',      name: 'Le Monde',                    address: '2885 Broadway, New York, NY',                            category: 'food',       rankingCategory: 'food',        lat: 40.8054, lng: -73.9653 },
  { google_place_id: 'seed_mels',         name: "Mel's Burger Bar",            address: '2850 Broadway, New York, NY',                            category: 'food',       rankingCategory: 'food',        lat: 40.8023, lng: -73.9685 },
  { google_place_id: 'seed_symposium',    name: 'Symposium Greek',             address: '544 W 113th St, New York, NY',                           category: 'food',       rankingCategory: 'food',        lat: 40.8054, lng: -73.9647 },
  { google_place_id: 'seed_massawa',      name: 'Massawa',                     address: '1239 Amsterdam Ave, New York, NY',                       category: 'food',       rankingCategory: 'food',        lat: 40.8076, lng: -73.9608 },
  { google_place_id: 'seed_vine',         name: 'Vine Sushi',                  address: '1062 Amsterdam Ave, New York, NY',                       category: 'food',       rankingCategory: 'food',        lat: 40.8077, lng: -73.9617 },

  // ─── Bars ──────────────────────────────────────────
  { google_place_id: 'seed_1020',         name: '1020 Bar',                    address: '1020 Amsterdam Ave, New York, NY',                       category: 'bar',        rankingCategory: 'bars',        lat: 40.8043, lng: -73.9619 },
  { google_place_id: 'seed_heights_bar',  name: 'The Heights Bar & Grill',     address: '2867 Broadway, New York, NY',                            category: 'bar',        rankingCategory: 'bars',        lat: 40.8051, lng: -73.9649 },
  { google_place_id: 'seed_amity',        name: 'Amity Hall Uptown',           address: '1090 Amsterdam Ave, New York, NY',                       category: 'bar',        rankingCategory: 'bars',        lat: 40.8084, lng: -73.9628 },
  { google_place_id: 'seed_dingdong',     name: 'Ding Dong Lounge',            address: '929 Columbus Ave, New York, NY',                         category: 'bar',        rankingCategory: 'bars',        lat: 40.7976, lng: -73.9663 },

  // ─── Shops ─────────────────────────────────────────
  { google_place_id: 'seed_bookculture',  name: 'Book Culture',                address: '536 W 112th St, New York, NY',                           category: 'retail',     rankingCategory: 'shops',       lat: 40.8050, lng: -73.9643 },
  { google_place_id: 'seed_westsider',    name: 'Westsider Rare & Used Books', address: '2246 Broadway, New York, NY',                            category: 'retail',     rankingCategory: 'shops',       lat: 40.7837, lng: -73.9787 },

  // ─── Experiences ───────────────────────────────────
  { google_place_id: 'seed_stjohns',      name: 'Cathedral of St. John the Divine', address: '1047 Amsterdam Ave, New York, NY',                  category: 'experience', rankingCategory: 'experiences', lat: 40.8045, lng: -73.9620 },
  { google_place_id: 'seed_morningside',  name: 'Morningside Park',            address: 'Morningside Dr, New York, NY',                           category: 'experience', rankingCategory: 'experiences', lat: 40.8077, lng: -73.9580 },
  { google_place_id: 'seed_riverside',    name: 'Riverside Park',              address: 'Riverside Dr & W 110th St, New York, NY',                category: 'experience', rankingCategory: 'experiences', lat: 40.8047, lng: -73.9728 },
  { google_place_id: 'seed_miller',       name: 'Miller Theatre',              address: '2960 Broadway, New York, NY',                            category: 'experience', rankingCategory: 'experiences', lat: 40.8089, lng: -73.9633 },
];

// ─── Impressions ──────────────────────────────────────────────────────

const IMPRESSIONS_BY_CAT: Record<RankingCat, string[]> = {
  cafes: [
    'best slow drip in morningside.',
    'the only place i can actually focus.',
    'cinnamon morning bun > everything.',
    'corner table by the window, always.',
    'flat white is exactly right.',
    "wifi's actually fast — take the back room during finals.",
    'matcha is overrated here, stick with the cortado.',
    'open till 11 during finals week, literally a lifesaver.',
    'small but they remember your order by week 2.',
    'their loose-leaf earl grey changed me.',
  ],
  food: [
    'go for the spaghetti carbonara.',
    'comfortingly old-school. red sauce done right.',
    'sunday brunch ritual.',
    'the burger lives up to the hype.',
    'late-night gyro hits.',
    'the soup dumplings are dangerous.',
    "go pre-7pm or it's a line out the door.",
    'split family-style — order the whole branzino.',
    'their weekday lunch special is unreal.',
    'best post-butler sandwich on broadway.',
  ],
  bars: [
    'cheap pitchers, columbia crowd.',
    'best dive on the upper west.',
    'the negroni hits different here.',
    'tuesday trivia is the move.',
    'happy hour till 8, $5 well drinks, do the math.',
    'this is where i ended up at 2am freshman year.',
    'their mezcal flight is sneaky strong.',
    'jukebox is unhinged in the best way.',
    "go on a tuesday or you'll wait an hour.",
  ],
  shops: [
    'a real bookstore. browse for hours.',
    'great rare-book section.',
    'staff picks always slap.',
    'their philosophy section is genuinely good.',
    'i found a first edition for $8. never recovered.',
    'small but the buyer has taste.',
    'staff will let you sit and read for hours, just buy something eventually.',
    'best $4 vintage tote in nyc.',
  ],
  experiences: [
    'gothic + organ recital = chills.',
    'sunset over the hudson, every time.',
    'underrated walk before dinner.',
    'the stained glass alone is worth it.',
    'free organ recital on sundays at 5, go.',
    "walk down to grant's tomb at golden hour.",
    'the labyrinth out back is meditative as hell.',
    'get the cheap seats — sightlines are still good.',
    'sit on the steps with a coffee, watch the dogs.',
  ],
};

// ─── Board templates by category ─────────────────────────────────────

const BOARD_TEMPLATES: Record<RankingCat, string[]> = {
  cafes:       ['morning rotation', 'study spots'],
  food:        ['late night eats', 'sunday brunch spots'],
  bars:        ['going out', 'dive bar tour'],
  shops:       ['morningside finds', 'bookshop crawl'],
  experiences: ['things to do', 'walks worth taking'],
};

function generateShareToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Helpers ──────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(...copy.splice(Math.floor(Math.random() * copy.length), 1));
  }
  return out;
}

// ─── Seed ─────────────────────────────────────────────────────────────

async function main() {
  console.log('▸ Seeding mock data into', SUPABASE_URL);

  // 1. Verify the real user exists so we don't write dangling follows.
  const { data: realUserRow } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', REAL_USER_ID)
    .maybeSingle();

  if (!realUserRow) {
    console.warn(
      `! Real user ${REAL_USER_ID} not found in users table — follows ` +
        'involving them will be skipped. Sign in with that user once ' +
        'and re-run the seed if you want the bidirectional follows.',
    );
  } else {
    console.log(`  ✓ real user found: @${(realUserRow as any).username}`);
  }

  // 2. Wipe prior seed rows. Match by email domain — usernames can
  // collide with real accounts (and have), so filtering by the
  // seed.filo.local pattern is the only safe way to guarantee we
  // never delete a real user. Deletion cascades to pins, follows,
  // board_pins, boards via FK constraints.
  const { data: existing } = await supabase
    .from('users')
    .select('id, username, email')
    .like('email', `%${SEED_EMAIL_DOMAIN}`);

  if (existing && existing.length > 0) {
    const existingIds = (existing as any[]).map((u) => u.id);
    // rankings is not in schema.sql — clear explicitly first.
    await supabase.from('rankings').delete().in('user_id', existingIds);
    const { error: delErr } = await supabase.from('users').delete().in('id', existingIds);
    if (delErr) {
      console.error('Failed to clear prior seed users:', delErr);
      process.exit(1);
    }
    console.log(`  ↺ cleared ${existing.length} prior seed user(s)`);
  }

  // 3. Insert fake users
  const userRows = FAKE_USERS.map((u) => ({
    id: randomUUID(),
    username: u.username,
    display_name: u.display_name,
    email: u.email,
    avatar_url: null as string | null,
    campus: 'columbia',
    is_verified: false,
    is_private: false,
    onboarding_complete: true,
  }));

  const { error: userErr } = await supabase.from('users').insert(userRows);
  if (userErr) {
    console.error('users insert failed:', userErr);
    process.exit(1);
  }
  console.log(`  ✓ inserted ${userRows.length} users`);

  const userIdByUsername = Object.fromEntries(
    userRows.map((u, i) => [FAKE_USERS[i].username, u.id]),
  );

  // 4. Upsert places (idempotent via google_place_id)
  const { error: placesErr } = await supabase.from('places').upsert(
    PLACES.map((p) => ({
      google_place_id: p.google_place_id,
      name: p.name,
      address: p.address,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      photo_url: null,
    })),
    { onConflict: 'google_place_id' },
  );
  if (placesErr) {
    console.error('places upsert failed:', placesErr);
    process.exit(1);
  }

  const { data: dbPlaces, error: placesReadErr } = await supabase
    .from('places')
    .select('id, google_place_id')
    .in(
      'google_place_id',
      PLACES.map((p) => p.google_place_id),
    );
  if (placesReadErr || !dbPlaces) {
    console.error('places read failed:', placesReadErr);
    process.exit(1);
  }
  const placeIdByGid: Record<string, string> = Object.fromEntries(
    (dbPlaces as any[]).map((p) => [p.google_place_id, p.id]),
  );
  console.log(`  ✓ upserted ${PLACES.length} places`);

  // 5. Pins — each fake user pins 8–10 places. Pre-generate pin IDs
  // so we can associate boards to them without a follow-up SELECT.
  type PinDraft = {
    id: string;
    user_id: string;
    place_id: string;
    status: string;
    impression: string | null;
    is_public: boolean;
    created_at: string;
    updated_at: string;
  };
  const pinRows: PinDraft[] = [];
  const pinsByUser = new Map<string, string[]>();
  for (const u of FAKE_USERS) {
    const userId = userIdByUsername[u.username];
    pinsByUser.set(userId, []);
    const count = 8 + Math.floor(Math.random() * 3); // 8, 9, or 10
    const picked = pickN(PLACES, count);
    for (const place of picked) {
      const status = Math.random() > 0.35 ? 'visited' : 'want_to_go';
      const includeImpression = status === 'visited' && Math.random() > 0.4;
      const daysAgo = Math.floor(Math.random() * 30);
      const created_at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
      const pinId = randomUUID();
      pinRows.push({
        id: pinId,
        user_id: userId,
        place_id: placeIdByGid[place.google_place_id],
        status,
        impression: includeImpression
          ? pick(IMPRESSIONS_BY_CAT[place.rankingCategory])
          : null,
        is_public: true,
        created_at,
        updated_at: created_at,
      });
      pinsByUser.get(userId)!.push(pinId);
    }
  }

  const { error: pinsErr } = await supabase.from('pins').insert(pinRows);
  if (pinsErr) {
    console.error('pins insert failed:', pinsErr);
    process.exit(1);
  }
  console.log(`  ✓ inserted ${pinRows.length} pins`);

  // 6. Follows — fake↔fake (every pair, both directions) and fake↔real
  const fakeFakeFollows: any[] = [];
  for (const a of FAKE_USERS) {
    const aId = userIdByUsername[a.username];
    for (const b of FAKE_USERS) {
      if (a.username === b.username) continue;
      fakeFakeFollows.push({
        follower_id: aId,
        following_id: userIdByUsername[b.username],
        status: 'active',
      });
    }
  }
  const { error: ffErr } = await supabase
    .from('follows')
    .upsert(fakeFakeFollows, { onConflict: 'follower_id,following_id' });
  if (ffErr) {
    console.error('fake↔fake follows failed:', ffErr);
    process.exit(1);
  }
  console.log(`  ✓ inserted ${fakeFakeFollows.length} fake↔fake follows`);

  if (realUserRow) {
    const realFollows: any[] = [];
    for (const u of FAKE_USERS) {
      const fakeId = userIdByUsername[u.username];
      realFollows.push({ follower_id: fakeId, following_id: REAL_USER_ID, status: 'active' });
      realFollows.push({ follower_id: REAL_USER_ID, following_id: fakeId, status: 'active' });
    }
    const { error: rfErr } = await supabase
      .from('follows')
      .upsert(realFollows, { onConflict: 'follower_id,following_id' });
    if (rfErr) {
      console.warn('  ! real↔fake follows failed:', rfErr.message);
    } else {
      console.log(`  ✓ inserted ${realFollows.length} real↔fake follows`);
    }
  }

  // 7. Boards — each user gets 2–3 public boards drawn from their
  // favorite-category templates, populated with 3–5 of their pins.
  const boardRows: any[] = [];
  const boardPinRows: any[] = [];
  for (const u of FAKE_USERS) {
    const userId = userIdByUsername[u.username];
    const userPinIds = pinsByUser.get(userId) ?? [];
    if (userPinIds.length === 0) continue;

    const namePool: string[] = [];
    for (const cat of u.favorites) {
      namePool.push(...BOARD_TEMPLATES[cat]);
    }
    if (namePool.length === 0) continue;

    const nBoards = Math.min(namePool.length, 2 + Math.floor(Math.random() * 2)); // 2 or 3
    const names = pickN(namePool, nBoards);

    for (const name of names) {
      const boardId = randomUUID();
      boardRows.push({
        id: boardId,
        user_id: userId,
        name,
        description: null,
        visibility: 'public',
        share_token: generateShareToken(),
      });

      const nPins = Math.min(
        userPinIds.length,
        3 + Math.floor(Math.random() * 3), // 3, 4, or 5
      );
      const pinIdsForBoard = pickN(userPinIds, nPins);
      pinIdsForBoard.forEach((pinId, i) => {
        boardPinRows.push({
          board_id: boardId,
          pin_id: pinId,
          position: i,
        });
      });
    }
  }

  const { error: boardsErr } = await supabase.from('boards').insert(boardRows);
  if (boardsErr) {
    console.error('boards insert failed:', boardsErr);
    process.exit(1);
  }
  console.log(`  ✓ inserted ${boardRows.length} boards`);

  const { error: bpErr } = await supabase.from('board_pins').insert(boardPinRows);
  if (bpErr) {
    console.error('board_pins insert failed:', bpErr);
    process.exit(1);
  }
  console.log(`  ✓ inserted ${boardPinRows.length} board_pins`);

  // 8. Rankings — each user ranks 4–6 places per favorite category
  const rankingRows: any[] = [];
  for (const u of FAKE_USERS) {
    const userId = userIdByUsername[u.username];
    for (const cat of u.favorites) {
      const placesInCat = PLACES.filter((p) => p.rankingCategory === cat);
      const n = Math.min(placesInCat.length, 4 + Math.floor(Math.random() * 3)); // 4-6 capped
      const ranked = pickN(placesInCat, n);
      ranked.forEach((p, i) => {
        rankingRows.push({
          user_id: userId,
          place_id: placeIdByGid[p.google_place_id],
          category: cat,
          position: i + 1,
        });
      });
    }
  }

  const { error: rankErr } = await supabase.from('rankings').insert(rankingRows);
  if (rankErr) {
    console.warn(
      '  ! rankings insert failed — does the rankings table exist?',
      rankErr.message,
    );
    console.warn(
      '    expected schema:\n' +
        '      CREATE TABLE rankings (\n' +
        '        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n' +
        '        user_id    uuid REFERENCES users(id) ON DELETE CASCADE,\n' +
        '        place_id   uuid REFERENCES places(id) ON DELETE CASCADE,\n' +
        '        category   text NOT NULL,\n' +
        '        position   integer NOT NULL,\n' +
        '        created_at timestamptz DEFAULT now(),\n' +
        '        UNIQUE(user_id, category, position),\n' +
        '        UNIQUE(user_id, place_id, category)\n' +
        '      );',
    );
  } else {
    console.log(`  ✓ inserted ${rankingRows.length} rankings`);
  }

  console.log('▸ Done.');
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
