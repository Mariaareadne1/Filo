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
  STICKER_SHADOW_LG,
  TAB_CLEARANCE,
  SCREEN_PAD,
} from '../../constants/theme';

/**
 * TASTE TWINS — five category rows, one top match per category, with a
 * per-category match %. Same friend can be top in one category and absent
 * from another.
 *
 * Each row keeps just three things: the category swatch, the friend
 * (name + "your X-twin" label), and the match %, plus a thin progress
 * bar that visualizes the %.
 *
 * Data wiring: hooks/useTwins.ts (TODO step 4.5) — for now this renders
 * placeholder data. Tap a row → opens that friend's profile scoped to
 * the category.
 */

type CatKey = 'cafes' | 'food' | 'bars' | 'shops' | 'experiences';

interface CategoryDef {
  key: CatKey;
  label: string;
  /** glyph used in the left swatch */
  glyph: string;
  /** mock total ranked count for the user (used only for empty-state copy) */
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
}

const PLACEHOLDER: Record<CatKey, Twin | null> = {
  cafes:       mockTwin('maya',  'Maya R.',  92),
  food:        mockTwin('amir',  'Amir T.',  88),
  bars:        mockTwin('sasha', 'Sasha K.', 79),
  shops:       mockTwin('jules', 'Jules H.', 84),
  experiences: mockTwin('kai',   'Kai O.',   90),
};

function mockTwin(username: string, display_name: string, match: number): Twin {
  return {
    user_id: `mock-${username}`,
    username,
    display_name,
    avatar_url: null,
    match,
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
                twin={twins[c.key]}
                onPress={() => {
                  const t = twins[c.key];
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
              you've both been. computed per category.
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
  twin,
  onPress,
}: {
  cat: CategoryDef;
  twin: Twin | null;
  onPress: () => void;
}) {
  if (!twin) {
    return (
      <View style={[styles.row, styles.rowEmpty]}>
        <View style={[styles.swatch, { backgroundColor: PALETTE.zone2 }]}>
          <Text style={styles.swatchGlyph}>{cat.glyph}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>your {cat.label.replace(/s$/, '')}-twin</Text>
          <Text style={styles.rowEmptyText}>
            rank {Math.max(0, 5 - cat.yourCount)} more to find them.
          </Text>
        </View>
      </View>
    );
  }

  const friendColor = FRIEND_COLOR[twin.username] ?? ACCENT.red;
  const initials = twin.display_name
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.row}>
      {/* Category swatch with friend-tinted halo */}
      <View style={[styles.swatch, { backgroundColor: PALETTE.zone2 }]}>
        <View style={[styles.swatchHalo, { backgroundColor: friendColor }]} />
        <Text style={styles.swatchGlyph}>{cat.glyph}</Text>
      </View>

      {/* Friend name + label + match bar */}
      <View style={styles.body}>
        <View style={styles.bodyTopRow}>
          {twin.avatar_url ? (
            <Image source={{ uri: twin.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: friendColor }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.friendName} numberOfLines={1}>
              {twin.display_name.split(' ')[0]}
            </Text>
            <Text style={styles.friendLabel} numberOfLines={1}>
              your <Text style={styles.friendLabelItalic}>{cat.label.replace(/s$/, '')}-twin</Text>
            </Text>
          </View>
          <View style={styles.matchPct}>
            <Text style={styles.matchPctNum}>{twin.match}</Text>
            <Text style={styles.matchPctSym}>%</Text>
          </View>
        </View>

        {/* Match bar */}
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${twin.match}%` }]} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  scroll: { paddingBottom: TAB_CLEARANCE },

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
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PALETTE.ink,
    overflow: 'hidden',
  },
  swatchHalo: {
    position: 'absolute',
    width: 60,
    height: 60,
    opacity: 0.18,
  },
  swatchGlyph: {
    fontSize: 26,
    color: PALETTE.ink,
  },

  // Body
  body: { flex: 1, justifyContent: 'space-between', gap: 10 },
  bodyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.surface,
  },
  friendName: {
    fontFamily: FONTS.display,
    fontSize: 17,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  friendLabel: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
  },
  friendLabelItalic: {
    fontStyle: 'italic',
  },

  matchPct: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  matchPctNum: {
    fontFamily: FONTS.display,
    fontSize: 30,
    color: ACCENT.red,
    fontStyle: 'italic',
    fontWeight: '400',
    lineHeight: 32,
  },
  matchPctSym: {
    fontFamily: FONTS.mono,
    fontSize: 11,
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

  // Empty row
  rowLabel: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.ink,
  },
  rowEmptyText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    marginTop: 4,
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
