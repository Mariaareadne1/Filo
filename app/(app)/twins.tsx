import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useEffect, useState , useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
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
 * TASTE TWINS — five category rows, one top match per category.
 *
 * For each category we run a real Spearman rank correlation between the
 * caller's rankings and each followed friend's rankings, restricted to
 * places they've both ranked. Friends with fewer than 3 overlapping
 * places are skipped — Spearman needs n ≥ 3 to be meaningful. The
 * friend with the highest correlation per category becomes the twin.
 *
 * Match % = clamp(round(ρ * 100), 0, 100). Negative correlations
 * (anti-twins) clamp to 0. Re-ranking is performed inside the overlap
 * subset before computing ρ — using raw category-wide positions would
 * make the formula nonsensical for partial overlaps.
 */

type CatKey = 'cafes' | 'food' | 'bars' | 'shops' | 'experiences';

interface CategoryDef {
  key: CatKey;
  label: string;
  /** glyph used in the left swatch */
  glyph: string;
}

const CATS: CategoryDef[] = [
  { key: 'cafes',       label: 'cafes',       glyph: '◉' },
  { key: 'food',        label: 'food',        glyph: '◆' },
  { key: 'bars',        label: 'bars',        glyph: '○' },
  { key: 'shops',       label: 'shops',       glyph: '◇' },
  { key: 'experiences', label: 'experiences', glyph: '✦' },
];

/** Spearman needs at least this many overlapping places to be meaningful. */
const MIN_OVERLAP = 3;

interface Twin {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  /** 0–100, clamped */
  match: number;
}

interface CatStats {
  twin: Twin | null;
  myCount: number;
}

const EMPTY_STATS: Record<CatKey, CatStats> = {
  cafes:       { twin: null, myCount: 0 },
  food:        { twin: null, myCount: 0 },
  bars:        { twin: null, myCount: 0 },
  shops:       { twin: null, myCount: 0 },
  experiences: { twin: null, myCount: 0 },
};

const FRIEND_COLOR_PALETTE = [
  '#ff6b4a', '#5b8def', '#f4c542', '#7d5fff', '#2ec27e', '#e6739f',
];
function colorForUserId(uid: string): string {
  // Deterministic hash → palette index, so each friend always gets the
  // same swatch tint across renders / screens.
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return FRIEND_COLOR_PALETTE[h % FRIEND_COLOR_PALETTE.length];
}

export default function TwinsScreen() {
  const [stats, setStats] = useState<Record<CatKey, CatStats>>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const reload = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStats(EMPTY_STATS);
      setLoading(false);
      return;
    }
    const next = await computeTwins(user.id);
    setStats(next);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

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

          {/* Loading vs rows */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={ACCENT.red} />
            </View>
          ) : (
            <View style={styles.rows}>
              {CATS.map((c) => {
                const s = stats[c.key];
                return (
                  <TwinRow
                    key={c.key}
                    cat={c}
                    twin={s.twin}
                    myCount={s.myCount}
                    onPress={() => {
                      if (!s.twin) return;
                      router.push({
                        pathname: `/(app)/user/${s.twin.user_id}`,
                        params: { category: c.key },
                      } as never);
                    }}
                  />
                );
              })}
            </View>
          )}

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
  myCount,
  onPress,
}: {
  cat: CategoryDef;
  twin: Twin | null;
  myCount: number;
  onPress: () => void;
}) {
  if (!twin) {
    const need = Math.max(0, MIN_OVERLAP - myCount);
    const message =
      myCount < MIN_OVERLAP
        ? `rank ${need} more to find your twin.`
        : 'no friend overlap yet.';
    return (
      <View style={[styles.row, styles.rowEmpty]}>
        <View style={[styles.swatch, { backgroundColor: PALETTE.zone2 }]}>
          <Text style={styles.swatchGlyph}>{cat.glyph}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>your {cat.label.replace(/s$/, '')}-twin</Text>
          <Text style={styles.rowEmptyText}>{message}</Text>
        </View>
      </View>
    );
  }

  const friendColor = colorForUserId(twin.user_id);
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
            <Image
              source={{ uri: twin.avatar_url }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={twin.user_id}
            />
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

// ─── Computation ────────────────────────────────────────────────────────

async function computeTwins(userId: string): Promise<Record<CatKey, CatStats>> {
  const stats: Record<CatKey, CatStats> = {
    cafes:       { twin: null, myCount: 0 },
    food:        { twin: null, myCount: 0 },
    bars:        { twin: null, myCount: 0 },
    shops:       { twin: null, myCount: 0 },
    experiences: { twin: null, myCount: 0 },
  };

  // 1. My rankings (all categories — we'll bucket below).
  const { data: myRanks } = await supabase
    .from('rankings')
    .select('place_id, category, position')
    .eq('user_id', userId);

  const myByCat = new Map<CatKey, Map<string, number>>();
  for (const r of (myRanks ?? []) as any[]) {
    if (!isCatKey(r.category)) continue;
    const cat = r.category as CatKey;
    if (!myByCat.has(cat)) myByCat.set(cat, new Map());
    myByCat.get(cat)!.set(r.place_id, r.position);
    stats[cat].myCount += 1;
  }

  // 2. People I follow.
  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .eq('status', 'active');
  const friendIds = (follows ?? []).map((f: any) => f.following_id);
  if (friendIds.length === 0) return stats;

  // 3. Friends' rankings + their display info, in a single query.
  const { data: friendRanks } = await supabase
    .from('rankings')
    .select('user_id, place_id, category, position, users!inner(username, display_name, avatar_url)')
    .in('user_id', friendIds);

  type FriendInfo = { username: string; display_name: string; avatar_url: string | null };
  const friendInfo = new Map<string, FriendInfo>();
  // friendId → category → place_id → position
  const friendByCat = new Map<string, Map<CatKey, Map<string, number>>>();

  for (const r of (friendRanks ?? []) as any[]) {
    if (!isCatKey(r.category)) continue;
    const cat = r.category as CatKey;
    const fid = r.user_id;
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    if (u && !friendInfo.has(fid)) {
      friendInfo.set(fid, {
        username: u.username,
        display_name: u.display_name,
        avatar_url: u.avatar_url ?? null,
      });
    }
    if (!friendByCat.has(fid)) friendByCat.set(fid, new Map());
    const fcm = friendByCat.get(fid)!;
    if (!fcm.has(cat)) fcm.set(cat, new Map());
    fcm.get(cat)!.set(r.place_id, r.position);
  }

  // 4. For each category, score every friend; keep the highest.
  for (const cat of CATS) {
    const myMap = myByCat.get(cat.key);
    if (!myMap || myMap.size < MIN_OVERLAP) continue;

    let bestTwin: Twin | null = null;
    let bestPct = -1;

    for (const [fid, fcm] of friendByCat) {
      const fMap = fcm.get(cat.key);
      if (!fMap) continue;

      // Build the overlap as paired positions.
      const pairs: [number, number][] = [];
      for (const [pid, myPos] of myMap) {
        const fPos = fMap.get(pid);
        if (fPos !== undefined) pairs.push([myPos, fPos]);
      }
      if (pairs.length < MIN_OVERLAP) continue;

      const pct = spearmanPct(pairs);
      if (pct > bestPct) {
        const info = friendInfo.get(fid)!;
        bestPct = pct;
        bestTwin = {
          user_id: fid,
          username: info.username,
          display_name: info.display_name,
          avatar_url: info.avatar_url,
          match: pct,
        };
      }
    }

    stats[cat.key].twin = bestTwin;
  }

  return stats;
}

/** Spearman rank correlation expressed as a 0–100 percentage.
 *
 * The raw `position` values come from arbitrary-length category lists,
 * so we re-rank both sides within the overlap subset before computing
 * the standard `1 - 6·Σd² / (n·(n²-1))` formula. Negative correlations
 * (anti-twins) clamp to 0%. Rankings are unique per (user, category)
 * so no tie-correction is needed. */
function spearmanPct(pairs: [number, number][]): number {
  const n = pairs.length;
  if (n < 2) return 0;

  const myAbsSorted = pairs.map((p) => p[0]).sort((a, b) => a - b);
  const fAbsSorted  = pairs.map((p) => p[1]).sort((a, b) => a - b);

  let sumD2 = 0;
  for (const [m, f] of pairs) {
    const myR = myAbsSorted.indexOf(m) + 1;
    const fR  = fAbsSorted.indexOf(f) + 1;
    const d = myR - fR;
    sumD2 += d * d;
  }
  const denom = n * (n * n - 1);
  if (denom === 0) return 0;
  const rho = 1 - (6 * sumD2) / denom;
  return Math.max(0, Math.min(100, Math.round(rho * 100)));
}

function isCatKey(c: unknown): c is CatKey {
  return c === 'cafes' || c === 'food' || c === 'bars' || c === 'shops' || c === 'experiences';
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

  // Loading
  loadingWrap: {
    paddingTop: 40,
    paddingBottom: 20,
    alignItems: 'center',
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
