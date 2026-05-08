import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useState, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
 * DISCOVER — five typographic cards in a 2-column grid. No images, no
 * glyphs, no halos. Just kicker / Fraunces title / count pill on a clean
 * sticker card. Category chips at the top scope all five queries.
 *
 * The five queries (always in this order):
 *   1. {cat} near you            — most-pinned, all of campus
 *   2. {cat} by your circle      — pins from people you follow
 *   3. by your {cat}-twins       — FOR YOU (the killer query, red border)
 *   4. by {cat} experts          — friends with 20+ ranks in this cat
 *   5. wishlist overlap          — on your circle's want-list
 *
 * Data wiring lives in hooks/useDiscover.ts (TODO step 4.5). For now this
 * renders structurally with placeholder counts so the layout is real and
 * the wiring drops in cleanly.
 */

type CatKey = 'cafes' | 'food' | 'bars' | 'shops' | 'experiences';

const CATEGORIES: { key: CatKey; label: string }[] = [
  { key: 'cafes',       label: 'cafes'       },
  { key: 'food',        label: 'food'        },
  { key: 'bars',        label: 'bars'        },
  { key: 'shops',       label: 'shops'       },
  { key: 'experiences', label: 'experiences' },
];

interface QueryDef {
  id: string;
  /** template uses {cat} for the active category label */
  title: (cat: string) => { plain: string; italic: string };
  /** kicker line above the title */
  kicker: string;
  /** is this the highlighted "for you" query? */
  highlight?: boolean;
  /** mock count for the chip */
  count: number;
}

const QUERIES: QueryDef[] = [
  {
    id: 'near-you',
    kicker: '01 · MOST PINNED',
    title: (cat) => ({ plain: cat, italic: 'near you' }),
    count: 24,
  },
  {
    id: 'circle',
    kicker: '02 · FRIENDS',
    title: (cat) => ({ plain: cat + ' by', italic: 'your circle' }),
    count: 12,
  },
  {
    id: 'twins',
    kicker: '03 · FOR YOU',
    title: (cat) => ({ plain: 'by your', italic: cat + '-twins' }),
    count: 8,
    highlight: true,
  },
  {
    id: 'experts',
    kicker: '04 · POWER RANKERS',
    title: (cat) => ({ plain: 'by ' + cat, italic: 'experts' }),
    count: 5,
  },
  {
    id: 'wishlist',
    kicker: '05 · SAVED BY FRIENDS',
    title: () => ({ plain: 'wishlist', italic: 'overlap' }),
    count: 17,
  },
];

// Two columns, alternating: left col gets indices 0/2/4, right col gets 1/3.
// 5 queries → 3 left + 2 right, top-loaded — keeps the highlight (idx 2)
// in the visually balanced middle position.
const COL_A = [QUERIES[0], QUERIES[2], QUERIES[4]];
const COL_B = [QUERIES[1], QUERIES[3]];

export default function DiscoverScreen() {
  const [activeCat, setActiveCat] = useState<CatKey>('cafes');
  const router = useRouter();

  const activeLabel = useMemo(
    () => CATEGORIES.find((c) => c.key === activeCat)!.label,
    [activeCat],
  );

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
  onPress,
}: {
  query: QueryDef;
  catLabel: string;
  onPress: () => void;
}) {
  const { plain, italic } = query.title(catLabel);
  const highlight = !!query.highlight;

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
            {query.count}
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
