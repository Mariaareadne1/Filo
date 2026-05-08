import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useState, useMemo, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  TAB_CLEARANCE,
  SCREEN_PAD,
} from '../../constants/theme';

/**
 * DISCOVER — five typographic cards in a 2-column grid. Counts are live
 * Supabase queries scoped to the active category. Category chips swap
 * the active category and trigger a refetch of all five counts in
 * parallel.
 *
 * Rows:
 *   01 most pinned       — distinct places near Columbia (~5km box)
 *                          with at least one pin in this category
 *   02 by your circle    — pin count from users you follow, this cat
 *   03 by your twins     — distinct places ranked by users whose
 *                          rankings overlap with yours in this cat
 *   04 by experts        — distinct places ranked by users with 10+
 *                          rankings in this cat
 *   05 wishlist overlap  — places where 2+ people in your circle have
 *                          status='want_to_go' in this cat
 *
 * Vocabulary note: rankings.category uses the discover vocab directly
 * (cafes/food/bars/shops/experiences). pins join through places, whose
 * `category` column uses the MapPin vocab (food/bar/beauty/experience/
 * retail). The DISCOVER_TO_PLACE_CATEGORIES map translates between the
 * two — this is the same mismatch flagged earlier and is worth a
 * unification pass when convenient.
 */

type CatKey = 'cafes' | 'food' | 'bars' | 'shops' | 'experiences';

const CATEGORIES: { key: CatKey; label: string }[] = [
  { key: 'cafes',       label: 'cafes'       },
  { key: 'food',        label: 'food'        },
  { key: 'bars',        label: 'bars'        },
  { key: 'shops',       label: 'shops'       },
  { key: 'experiences', label: 'experiences' },
];

/** Maps the discover-vocab category to the corresponding places.category
 *  values. cafes/food both currently map to the same places.category
 *  ('food') so their pin-based counts will match — this reflects the
 *  current schema, not a bug here. */
const DISCOVER_TO_PLACE_CATEGORIES: Record<CatKey, string[]> = {
  cafes:       ['food'],
  food:        ['food'],
  bars:        ['bar'],
  shops:       ['retail'],
  experiences: ['experience'],
};

interface QueryDef {
  id: string;
  /** template uses {cat} for the active category label */
  title: (cat: string) => { plain: string; italic: string };
  /** kicker line above the title */
  kicker: string;
  /** is this the highlighted "for you" query? */
  highlight?: boolean;
}

const QUERIES: QueryDef[] = [
  {
    id: 'near-you',
    kicker: '01 · MOST PINNED',
    title: (cat) => ({ plain: cat, italic: 'near you' }),
  },
  {
    id: 'circle',
    kicker: '02 · FRIENDS',
    title: (cat) => ({ plain: cat + ' by', italic: 'your circle' }),
  },
  {
    id: 'twins',
    kicker: '03 · FOR YOU',
    title: (cat) => ({ plain: 'by your', italic: cat + '-twins' }),
    highlight: true,
  },
  {
    id: 'experts',
    kicker: '04 · POWER RANKERS',
    title: (cat) => ({ plain: 'by ' + cat, italic: 'experts' }),
  },
  {
    id: 'wishlist',
    kicker: '05 · SAVED BY FRIENDS',
    title: () => ({ plain: 'wishlist', italic: 'overlap' }),
  },
];

const COL_A = [QUERIES[0], QUERIES[2], QUERIES[4]];
const COL_B = [QUERIES[1], QUERIES[3]];

// Columbia centroid + ~5 km bounding box (lat/lng deltas).
const COL_LAT = 40.8075;
const COL_LNG = -73.9626;
const LAT_DELTA = 0.045;          // ~5km in latitude
const LNG_DELTA = 0.060;          // ~5km longitude at this latitude

type Counts = Record<string, number | null>;
const EMPTY_COUNTS: Counts = {
  'near-you': null, 'circle': null, 'twins': null, 'experts': null, 'wishlist': null,
};

export default function DiscoverScreen() {
  const [activeCat, setActiveCat] = useState<CatKey>('cafes');
  const [userId, setUserId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const router = useRouter();

  const activeLabel = useMemo(
    () => CATEGORIES.find((c) => c.key === activeCat)!.label,
    [activeCat],
  );

  // Resolve auth user once.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Refetch counts whenever active category or auth user changes.
  useEffect(() => {
    let cancelled = false;
    setCounts(EMPTY_COUNTS);
    fetchDiscoverCounts(userId, activeCat).then((next) => {
      if (!cancelled) setCounts(next);
    });
    return () => { cancelled = true; };
  }, [userId, activeCat]);

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.metaLabel}>DISCOVER · MORNINGSIDE</Text>
          <Text style={styles.title}>
            different <Text style={styles.titleItalic}>tastes,</Text>{'\n'}same map.
          </Text>
        </View>

        {/* Category chip row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {CATEGORIES.map((c) => {
            const active = c.key === activeCat;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setActiveCat(c.key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 2-column card grid */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            <View style={styles.column}>
              {COL_A.map((q) => (
                <DiscoverCard
                  key={q.id}
                  query={q}
                  catLabel={activeLabel}
                  count={counts[q.id]}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)' as never,
                      params: { discover: q.id, cat: activeCat },
                    } as never)
                  }
                />
              ))}
            </View>
            <View style={styles.column}>
              {COL_B.map((q) => (
                <DiscoverCard
                  key={q.id}
                  query={q}
                  catLabel={activeLabel}
                  count={counts[q.id]}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)' as never,
                      params: { discover: q.id, cat: activeCat },
                    } as never)
                  }
                />
              ))}
            </View>
          </View>

          {/* Twins teaser footer — leads to /twins */}
          <TouchableOpacity
            style={styles.twinsFooter}
            onPress={() => router.push('/(app)/twins' as never)}
            activeOpacity={0.85}
          >
            <View style={styles.twinsFooterIcon}>
              <Text style={styles.twinsFooterGlyph}>✦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.twinsFooterKicker}>YOUR TWINS</Text>
              <Text style={styles.twinsFooterTitle}>
                see who matches your <Text style={styles.twinsFooterItalic}>taste</Text>
              </Text>
            </View>
            <Text style={styles.twinsFooterArrow}>→</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────

function DiscoverCard({
  query,
  catLabel,
  count,
  onPress,
}: {
  query: QueryDef;
  catLabel: string;
  count: number | null;
  onPress: () => void;
}) {
  const { plain, italic } = query.title(catLabel);
  const highlight = !!query.highlight;
  const display = count == null ? '—' : String(count);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        highlight && styles.cardHighlight,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.cardKicker, highlight && styles.cardKickerHighlight]}>
        {query.kicker}
      </Text>
      <Text style={styles.cardTitle}>
        {plain ? <>{plain}{' '}</> : null}
        <Text style={styles.cardTitleItalic}>{italic}</Text>
      </Text>
      <View style={styles.cardFooter}>
        <View style={[styles.countPill, highlight && styles.countPillHighlight]}>
          <Text style={[styles.countPillText, highlight && styles.countPillTextHighlight]}>
            {display}
          </Text>
        </View>
        {highlight && (
          <View style={styles.forYouBadge}>
            <Text style={styles.forYouBadgeText}>FOR YOU</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Queries ────────────────────────────────────────────────────────────

async function fetchDiscoverCounts(
  userId: string | null,
  discoverCat: CatKey,
): Promise<Counts> {
  const placesCats = DISCOVER_TO_PLACE_CATEGORIES[discoverCat] ?? [];
  const result: Counts = {
    'near-you': 0, 'circle': 0, 'twins': 0, 'experts': 0, 'wishlist': 0,
  };

  const minLat = COL_LAT - LAT_DELTA, maxLat = COL_LAT + LAT_DELTA;
  const minLng = COL_LNG - LNG_DELTA, maxLng = COL_LNG + LNG_DELTA;

  // Resolve circle once (rows 02 + 05 share it).
  let circleIds: string[] = [];
  if (userId) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .eq('status', 'active');
    circleIds = (follows ?? []).map((f: any) => f.following_id);
  }

  // Run independent queries in parallel.
  const [r1, r2, r3, r4, r5] = await Promise.all([
    countNearYou(placesCats, minLat, maxLat, minLng, maxLng),
    userId ? countCircle(circleIds, placesCats) : Promise.resolve(0),
    userId ? countTwins(userId, discoverCat) : Promise.resolve(0),
    countExperts(discoverCat),
    userId ? countWishlistOverlap(circleIds, placesCats) : Promise.resolve(0),
  ]);

  result['near-you'] = r1;
  result['circle']   = r2;
  result['twins']    = r3;
  result['experts']  = r4;
  result['wishlist'] = r5;

  return result;
}

/** Row 01 — distinct places near Columbia (5km box) with any pin in this category. */
async function countNearYou(
  placesCats: string[],
  minLat: number, maxLat: number, minLng: number, maxLng: number,
): Promise<number> {
  if (placesCats.length === 0) return 0;
  const { data, error } = await supabase
    .from('pins')
    .select('place_id, places!inner(category, lat, lng)')
    .in('places.category', placesCats)
    .gte('places.lat', minLat).lte('places.lat', maxLat)
    .gte('places.lng', minLng).lte('places.lng', maxLng);
  if (error || !data) return 0;
  return new Set((data as any[]).map((r) => r.place_id)).size;
}

/** Row 02 — pin count from users you follow in this category. */
async function countCircle(circleIds: string[], placesCats: string[]): Promise<number> {
  if (circleIds.length === 0 || placesCats.length === 0) return 0;
  const { count, error } = await supabase
    .from('pins')
    .select('id, places!inner(category)', { count: 'exact', head: true })
    .in('user_id', circleIds)
    .in('places.category', placesCats);
  if (error) return 0;
  return count ?? 0;
}

/** Row 03 — distinct places ranked by users whose rankings overlap with mine. */
async function countTwins(userId: string, cat: CatKey): Promise<number> {
  // 1. My ranked place_ids in this category
  const { data: mine } = await supabase
    .from('rankings')
    .select('place_id')
    .eq('user_id', userId)
    .eq('category', cat);
  const myPlaceIds = (mine ?? []).map((r: any) => r.place_id);
  if (myPlaceIds.length === 0) return 0;

  // 2. Other users who also rank any of those places (this category)
  const { data: overlap } = await supabase
    .from('rankings')
    .select('user_id')
    .in('place_id', myPlaceIds)
    .eq('category', cat)
    .neq('user_id', userId);
  const overlapUsers = Array.from(
    new Set((overlap ?? []).map((r: any) => r.user_id)),
  );
  if (overlapUsers.length === 0) return 0;

  // 3. Distinct places those users have ranked in this category
  const { data: theirs } = await supabase
    .from('rankings')
    .select('place_id')
    .in('user_id', overlapUsers)
    .eq('category', cat);
  return new Set((theirs ?? []).map((r: any) => r.place_id)).size;
}

/** Row 04 — distinct places ranked by users with 10+ rankings in this category. */
async function countExperts(cat: CatKey): Promise<number> {
  const { data: ranks } = await supabase
    .from('rankings')
    .select('user_id, place_id')
    .eq('category', cat);
  if (!ranks || ranks.length === 0) return 0;

  const perUser = new Map<string, Set<string>>();
  for (const r of ranks as any[]) {
    if (!perUser.has(r.user_id)) perUser.set(r.user_id, new Set());
    perUser.get(r.user_id)!.add(r.place_id);
  }
  const expertIds = new Set<string>();
  for (const [uid, places] of perUser) {
    if (places.size >= 10) expertIds.add(uid);
  }
  if (expertIds.size === 0) return 0;

  const expertPlaces = new Set<string>();
  for (const r of ranks as any[]) {
    if (expertIds.has(r.user_id)) expertPlaces.add(r.place_id);
  }
  return expertPlaces.size;
}

/** Row 05 — places where 2+ people in your circle have status='want_to_go'. */
async function countWishlistOverlap(
  circleIds: string[],
  placesCats: string[],
): Promise<number> {
  if (circleIds.length === 0 || placesCats.length === 0) return 0;
  const { data } = await supabase
    .from('pins')
    .select('place_id, places!inner(category)')
    .in('user_id', circleIds)
    .eq('status', 'want_to_go')
    .in('places.category', placesCats);
  if (!data) return 0;
  const placeCount = new Map<string, number>();
  for (const r of data as any[]) {
    placeCount.set(r.place_id, (placeCount.get(r.place_id) ?? 0) + 1);
  }
  let overlap = 0;
  for (const c of placeCount.values()) if (c > 1) overlap++;
  return overlap;
}

// ─── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },

  // Header
  header: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 12,
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginBottom: 8,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 32,
    lineHeight: 34,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  titleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },

  // Chips
  chipsRow: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: PALETTE.ink,
    borderColor: PALETTE.ink,
  },
  chipText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.ink,
  },
  chipTextActive: {
    color: PALETTE.bg,
  },

  // Scroll container
  scroll: {
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: TAB_CLEARANCE,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    gap: 10,
  },
  column: {
    flex: 1,
    gap: 10,
  },

  // Card
  card: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 140,
    ...STICKER_SHADOW_LG,
  },
  cardHighlight: {
    borderColor: ACCENT.red,
  },
  cardKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    textTransform: 'uppercase',
  },
  cardKickerHighlight: {
    color: ACCENT.red,
  },
  cardTitle: {
    fontFamily: FONTS.display,
    fontSize: 18,
    lineHeight: 22,
    color: PALETTE.ink,
    fontWeight: '400',
    marginTop: 8,
  },
  cardTitleItalic: {
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 'auto',
    paddingTop: 12,
  },
  countPill: {
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 32,
    alignItems: 'center',
    ...STICKER_SHADOW,
  },
  countPillHighlight: {
    borderColor: ACCENT.red,
  },
  countPillText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: PALETTE.ink,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  countPillTextHighlight: {
    color: ACCENT.red,
  },
  forYouBadge: {
    backgroundColor: ACCENT.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  forYouBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: PALETTE.surface,
    fontWeight: '600',
  },

  // Twins teaser footer
  twinsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  twinsFooterIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACCENT.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twinsFooterGlyph: {
    color: PALETTE.surface,
    fontSize: 18,
  },
  twinsFooterKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  twinsFooterTitle: {
    fontFamily: FONTS.display,
    fontSize: 18,
    color: PALETTE.ink,
    fontWeight: '400',
    marginTop: 2,
  },
  twinsFooterItalic: {
    fontStyle: 'italic',
  },
  twinsFooterArrow: {
    fontFamily: FONTS.body,
    fontSize: 18,
    color: PALETTE.ink,
  },
});
