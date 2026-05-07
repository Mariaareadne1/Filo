import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FONTS,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  TAB_CLEARANCE,
  SCREEN_PAD,
} from '../../constants/theme';

/**
 * TASTE TWINS — five category rows, one top match per category, with
 * a per-category match %. Same friend can be top in one category and
 * absent from another.
 *
 * Data wiring: hooks/useTwins.ts (TODO step 4.5) — for now this renders
 * placeholder data. Tap a row → opens that friend's profile scoped to
 * the category (we'll honor `?category=` in user/[id].tsx in step 5+).
 */

type CatKey = 'cafes' | 'food' | 'bars' | 'shops' | 'experiences';

interface CategoryDef {
  key: CatKey;
  label: string;
  /** glyph used in the left swatch */
  glyph: string;
  /** mock total ranked count for the user */
  yourCount: number;
}

const CATS: CategoryDef[] = [
  { key: 'cafes',       label: 'cafes',       glyph: '◉', yourCount: 14 },
  { key: 'food',        label: 'food',        glyph: '◆', yourCount: 22 },
  { key: 'bars',        label: 'bars',        glyph: '○', yourCount: 9  },
  { key: 'shops',       label: 'shops',       glyph: '◇', yourCount: 6  },
  { key: 'experiences', label: 'experiences', glyph: '✦', yourCount: 11 },
];

interface Twin {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  /** 0–100 */
  match: number;
  /** their ranked count in this category */
  rankedCount: number;
}

interface CategoryTwins {
  top: Twin | null;
  also: Twin | null;
}

const PLACEHOLDER: Record<CatKey, CategoryTwins> = {
  cafes: {
    top:  mockTwin('maya',  'Maya R.',     92, 12),
    also: mockTwin('jules', 'Jules H.',    81, 18),
  },
  food: {
    top:  mockTwin('amir',  'Amir T.',     88, 30),
    also: mockTwin('rae',   'Rae N.',      74, 16),
  },
  bars: {
    top:  mockTwin('sasha', 'Sasha K.',    79, 14),
    also: mockTwin('amir',  'Amir T.',     71, 12),
  },
  shops: {
    top:  mockTwin('jules', 'Jules H.',    84, 9),
    also: null,
  },
  experiences: {
    top:  mockTwin('kai',   'Kai O.',      90, 17),
    also: mockTwin('maya',  'Maya R.',     76, 8),
  },
};

function mockTwin(
  username: string,
  display_name: string,
  match: number,
  rankedCount: number,
): Twin {
  return {
    user_id: `mock-${username}`,
    username,
    display_name,
    avatar_url: null,
    match,
    rankedCount,
  };
}

const FRIEND_COLOR: Record<string, string> = {
  maya:  '#ff6b4a',
  amir:  '#5b8def',
  jules: '#f4c542',
  sasha: '#7d5fff',
  kai:   '#2ec27e',
  rae:   '#e6739f',
};

export default function TwinsScreen() {
  const [twins] = useState(PLACEHOLDER);
  const [_currentUserId, setCurrentUserId] = useState<string | null>(null);
  const router = useRouter();

  // Stub: load current user. Real twin computation lands in hooks/useTwins.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.backText}>← back</Text>
            </TouchableOpacity>
            <Text style={styles.metaLabel}>YOUR TWINS</Text>
            <Text style={styles.title}>
              who shares your <Text style={styles.titleItalic}>taste.</Text>
            </Text>
            <Text style={styles.subtitle}>
              top match per category. someone can be your cafe-twin{'\n'}
              and not your bar-twin — that's the point.
            </Text>
          </View>

          {/* Category rows */}
          <View style={styles.rows}>
            {CATS.map((c) => (
              <TwinRow
                key={c.key}
                cat={c}
                top={twins[c.key].top}
                also={twins[c.key].also}
                onPress={() => {
                  const t = twins[c.key].top;
                  if (!t) return;
                  router.push({
                    pathname: `/(app)/user/${t.user_id}`,
                    params: { category: c.key },
                  } as never);
                }}
              />
            ))}
          </View>

          {/* Footnote */}
          <View style={styles.footnote}>
            <Text style={styles.footnoteText}>
              match % = how closely your private rankings agree on places{'\n'}
              you've both been. computed per category. updates as you rank more.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────

function TwinRow({
  cat,
  top,
  also,
  onPress,
}: {
  cat: CategoryDef;
  top: Twin | null;
  also: Twin | null;
  onPress: () => void;
}) {
  if (!top) {
    return (
      <View style={[styles.row, styles.rowEmpty]}>
        <View style={[styles.swatch, { backgroundColor: PALETTE.zone2 }]}>
          <Text style={styles.swatchGlyph}>{cat.glyph}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.rowKicker}>{cat.label.toUpperCase()}</Text>
          <Text style={styles.rowEmptyText}>
            rank {Math.max(0, 5 - cat.yourCount)} more to find your twin.
          </Text>
        </View>
      </View>
    );
  }

  const friendColor = FRIEND_COLOR[top.username] ?? ACCENT.red;
  const initials = top.display_name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.row}
    >
      {/* Category swatch */}
      <View style={[styles.swatch, { backgroundColor: PALETTE.zone2 }]}>
        <View style={[styles.swatchHalo, { backgroundColor: friendColor }]} />
        <Text style={styles.swatchGlyph}>{cat.glyph}</Text>
      </View>

      {/* Body */}
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.rowHead}>
          <Text style={styles.rowKicker}>{cat.label.toUpperCase()}</Text>
          <View style={styles.countChip}>
            <Text style={styles.countChipText}>{cat.yourCount} ranked</Text>
          </View>
        </View>

        {/* Friend line */}
        <View style={styles.friendRow}>
          {top.avatar_url ? (
            <Image source={{ uri: top.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: friendColor }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.friendName}>
              {top.display_name.split(' ')[0]}{' '}
              <Text style={styles.friendItalic}>· your {cat.label.replace(/s$/, '')}-twin</Text>
            </Text>
            <Text style={styles.friendSub}>
              {top.rankedCount} ranked · #1/{top.rankedCount}
            </Text>
          </View>
          <View style={styles.matchPct}>
            <Text style={styles.matchPctNum}>{top.match}</Text>
            <Text style={styles.matchPctSym}>%</Text>
          </View>
        </View>

        {/* Match bar */}
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${top.match}%` }]} />
        </View>

        {/* Also line */}
        {also ? (
          <Text style={styles.alsoLine}>
            also: {also.display_name.split(' ')[0]}{' '}
            <Text style={styles.alsoLineSub}>· {also.match}%</Text>
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  scroll: {
    paddingBottom: TAB_CLEARANCE + 16,
  },

  // Header
  header: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 18,
    gap: 10,
  },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
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
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 12,
    lineHeight: 18,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },

  // Rows
  rows: {
    paddingHorizontal: SCREEN_PAD,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    padding: 12,
    ...STICKER_SHADOW_LG,
  },
  rowEmpty: {
    backgroundColor: PALETTE.bg,
  },
  swatch: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PALETTE.ink,
    overflow: 'hidden',
  },
  swatchHalo: {
    position: 'absolute',
    width: 64,
    height: 64,
    opacity: 0.18,
  },
  swatchGlyph: {
    fontSize: 26,
    color: PALETTE.ink,
  },

  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  countChip: {
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: PALETTE.surface,
    ...STICKER_SHADOW,
  },
  countChipText: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 0.5,
    color: PALETTE.ink,
  },

  // Friend
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.surface,
  },
  friendName: {
    fontFamily: FONTS.display,
    fontSize: 16,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  friendItalic: {
    fontStyle: 'italic',
    color: PALETTE.inkSoft,
    fontSize: 13,
  },
  friendSub: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },
  matchPct: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  matchPctNum: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: ACCENT.red,
    fontWeight: '400',
  },
  matchPctSym: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: ACCENT.red,
    marginLeft: 1,
  },

  // Bar
  bar: {
    height: 4,
    backgroundColor: PALETTE.zone2,
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
  },
  barFill: {
    height: 2,
    backgroundColor: ACCENT.red,
  },

  alsoLine: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },
  alsoLineSub: {
    fontFamily: FONTS.mono,
    fontSize: 10,
  },

  rowEmptyText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },

  // Footnote
  footnote: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 24,
  },
  footnoteText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    lineHeight: 16,
    color: PALETTE.inkMute,
    textAlign: 'left',
  },
});
