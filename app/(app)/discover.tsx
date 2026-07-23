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

// Vocabulary note: the discover→places category bridge (cafes/food→food,
// bars→bar, shops→retail, experiences→experience) now lives server-side in
// the get_discover_counts RPC.

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

/**
 * All five lens counts in one round trip via the get_discover_counts RPC,
 * which computes them as SQL aggregates server-side (was ~9 client requests
 * per tap, several shipping whole tables to count in JS). The RPC reads the
 * caller from auth.uid(); `userId` here only tells us whether to bother.
 */
async function fetchDiscoverCounts(
  userId: string | null,
  discoverCat: CatKey,
): Promise<Counts> {
  const { data, error } = await supabase
    .rpc('get_discover_counts', { p_discover_cat: discoverCat })
    .maybeSingle<{
      near_you: number;
      circle: number;
      twins: number;
      experts: number;
      wishlist: number;
    }>();

  if (error || !data) return { ...EMPTY_COUNTS, ...zeroCounts() };

  return {
    'near-you': data.near_you ?? 0,
    'circle':   userId ? data.circle ?? 0 : 0,
    'twins':    userId ? data.twins ?? 0 : 0,
    'experts':  data.experts ?? 0,
    'wishlist': userId ? data.wishlist ?? 0 : 0,
  };
}

function zeroCounts(): Counts {
  return { 'near-you': 0, 'circle': 0, 'twins': 0, 'experts': 0, 'wishlist': 0 };
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
