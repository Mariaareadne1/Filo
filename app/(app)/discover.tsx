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
 * DISCOVER — surfaces the six discovery lenses as a masonry of cards.
 * Category chips at the top scope all six queries.
 *
 * The six queries (always in this order):
 *   1. {cat} near you            — most-liked, all of campus
 *   2. {cat} by your circle      — pins from people you follow
 *   3. by your {cat}-twins       — FOR YOU (the killer query)
 *   4. by {cat} experts          — friends with 20+ ranks in this cat
 *   5. wishlist overlap          — on your circle's want-list
 *   6. undiscovered              — no one in circle has been
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
  /** card height variant — masonry rhythm */
  variant: 'sm' | 'md' | 'lg';
}

const QUERIES: QueryDef[] = [
  {
    id: 'near-you',
    kicker: '01 · most pinned',
    title: (cat) => ({ plain: cat, italic: 'near you' }),
    count: 24,
    variant: 'md',
  },
  {
    id: 'circle',
    kicker: '02 · friends',
    title: (cat) => ({ plain: cat + ' by', italic: 'your circle' }),
    count: 12,
    variant: 'sm',
  },
  {
    id: 'twins',
    kicker: '03 · for you',
    title: (cat) => ({ plain: 'by your', italic: cat + '-twins' }),
    count: 8,
    variant: 'lg',
    highlight: true,
  },
  {
    id: 'experts',
    kicker: '04 · power rankers',
    title: (cat) => ({ plain: 'by ' + cat, italic: 'experts' }),
    count: 5,
    variant: 'md',
  },
  {
    id: 'wishlist',
    kicker: '05 · saved by friends',
    title: (cat) => ({ plain: 'wishlist', italic: 'overlap' }),
    count: 17,
    variant: 'sm',
  },
  {
    id: 'undiscovered',
    kicker: '06 · no one yet',
    title: () => ({ plain: '', italic: 'undiscovered' }),
    count: 31,
    variant: 'md',
  },
];

/** Visual icon for each query — uses unicode glyphs not emoji. */
const QUERY_GLYPH: Record<string, string> = {
  'near-you':     '◉',
  'circle':       '○',
  'twins':        '✦',
  'experts':      '◆',
  'wishlist':     '♡',
  'undiscovered': '◌',
};

const CARD_HEIGHTS = {
  sm: 132,
  md: 158,
  lg: 196,
} as const;

export default function DiscoverScreen() {
  const [activeCat, setActiveCat] = useState<CatKey>('cafes');
  const router = useRouter();

  const activeLabel = useMemo(
    () => CATEGORIES.find((c) => c.key === activeCat)!.label,
    [activeCat],
  );

  // Split queries into two columns for the masonry. Distribute by height
  // greedy-balanced so columns stay roughly even regardless of variant mix.
  const [colA, colB] = useMemo(() => {
    const a: QueryDef[] = [];
    const b: QueryDef[] = [];
    let aH = 0;
    let bH = 0;
    for (const q of QUERIES) {
      if (aH <= bH) {
        a.push(q);
        aH += CARD_HEIGHTS[q.variant];
      } else {
        b.push(q);
        bH += CARD_HEIGHTS[q.variant];
      }
    }
    return [a, b];
  }, []);

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

        {/* Masonry */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.masonry}>
            <View style={styles.column}>
              {colA.map((q) => (
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
              {colB.map((q) => (
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
  const height = CARD_HEIGHTS[query.variant];
  const highlight = !!query.highlight;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [
      styles.card,
      { height, opacity: pressed ? 0.85 : 1 },
      highlight && styles.cardHighlight,
    ]}>
      {/* Glyph 'image area' — gradient-ish radial effect via two stacked tints */}
      <View style={[styles.cardImage, highlight && styles.cardImageHighlight]}>
        <View style={[styles.cardImageHalo, highlight && styles.cardImageHaloHighlight]} />
        <Text style={[styles.cardGlyph, highlight && styles.cardGlyphHighlight]}>
          {QUERY_GLYPH[query.id]}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardKicker}>{query.kicker}</Text>
        <Text style={styles.cardTitle}>
          {plain ? <>{plain}{' '}</> : null}
          <Text style={styles.cardTitleItalic}>{italic}</Text>
        </Text>
        <View style={styles.cardMetaRow}>
          <View style={[styles.countChip, highlight && styles.countChipHighlight]}>
            <Text style={[styles.countChipText, highlight && styles.countChipTextHighlight]}>
              {query.count} places
            </Text>
          </View>
          {highlight && (
            <View style={styles.forYouBadge}>
              <Text style={styles.forYouBadgeText}>FOR YOU</Text>
            </View>
          )}
        </View>
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

  // Masonry
  scroll: {
    paddingHorizontal: SCREEN_PAD - 4,
    paddingBottom: TAB_CLEARANCE + 16,
  },
  masonry: {
    flexDirection: 'row',
    gap: 8,
  },
  column: {
    flex: 1,
    gap: 8,
  },

  // Card
  card: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    borderRadius: RADII.none,
    overflow: 'hidden',
    ...STICKER_SHADOW_LG,
  },
  cardHighlight: {
    borderColor: ACCENT.red,
  },
  cardImage: {
    flex: 1,
    backgroundColor: PALETTE.zone1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.ink,
  },
  cardImageHighlight: {
    backgroundColor: '#fff1ef',
  },
  cardImageHalo: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: PALETTE.zone3,
    opacity: 0.6,
  },
  cardImageHaloHighlight: {
    backgroundColor: ACCENT.red,
    opacity: 0.18,
  },
  cardGlyph: {
    fontSize: 30,
    color: PALETTE.ink,
  },
  cardGlyphHighlight: {
    color: ACCENT.red,
  },
  cardBody: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  cardKicker: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontFamily: FONTS.display,
    fontSize: 17,
    lineHeight: 19,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  cardTitleItalic: {
    fontStyle: 'italic',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  countChip: {
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 6,
    paddingVertical: 2,
    ...STICKER_SHADOW,
    backgroundColor: PALETTE.surface,
  },
  countChipHighlight: {
    borderColor: ACCENT.red,
  },
  countChipText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    color: PALETTE.ink,
    letterSpacing: 0.5,
  },
  countChipTextHighlight: {
    color: ACCENT.red,
  },
  forYouBadge: {
    backgroundColor: ACCENT.red,
    paddingHorizontal: 5,
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
    marginTop: 16,
    marginHorizontal: 4,
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
