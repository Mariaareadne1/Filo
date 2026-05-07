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
 * DISCOVER — five typographic rows, no images. Category chips at the top
 * scope all five queries.
 *
 * The five queries (always in this order):
 *   1. {cat} near you            — most-pinned, all of campus
 *   2. {cat} by your circle      — pins from people you follow
 *   3. by your {cat}-twins       — FOR YOU (the killer query)
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

        {/* Stacked rows */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {QUERIES.map((q) => (
            <DiscoverRow
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

// ─── Row ────────────────────────────────────────────────────────────────

function DiscoverRow({
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
        styles.row,
        highlight && styles.rowHighlight,
        { opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={[styles.rowKicker, highlight && styles.rowKickerHighlight]}>
          {query.kicker}
        </Text>
        <Text style={styles.rowTitle}>
          {plain ? <>{plain}{' '}</> : null}
          <Text style={styles.rowTitleItalic}>{italic}</Text>
        </Text>
        {highlight && (
          <View style={styles.forYouBadge}>
            <Text style={styles.forYouBadgeText}>FOR YOU</Text>
          </View>
        )}
      </View>

      <View style={styles.rowRight}>
        <View style={[styles.countPill, highlight && styles.countPillHighlight]}>
          <Text style={[styles.countPillText, highlight && styles.countPillTextHighlight]}>
            {query.count}
          </Text>
        </View>
        <Text style={[styles.rowArrow, highlight && styles.rowArrowHighlight]}>→</Text>
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
    gap: 10,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...STICKER_SHADOW_LG,
  },
  rowHighlight: {
    borderColor: ACCENT.red,
    backgroundColor: '#fff7f6',
  },
  rowKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    textTransform: 'uppercase',
  },
  rowKickerHighlight: {
    color: ACCENT.red,
  },
  rowTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    lineHeight: 26,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  rowTitleItalic: {
    fontStyle: 'italic',
  },

  forYouBadge: {
    alignSelf: 'flex-start',
    backgroundColor: ACCENT.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  forYouBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: PALETTE.surface,
    fontWeight: '600',
  },

  // Right column
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countPill: {
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 38,
    alignItems: 'center',
    ...STICKER_SHADOW,
  },
  countPillHighlight: {
    borderColor: ACCENT.red,
  },
  countPillText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    color: PALETTE.ink,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  countPillTextHighlight: {
    color: ACCENT.red,
  },
  rowArrow: {
    fontFamily: FONTS.body,
    fontSize: 18,
    color: PALETTE.ink,
  },
  rowArrowHighlight: {
    color: ACCENT.red,
  },

  // Twins teaser footer
  twinsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
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
