import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Share,
} from 'react-native';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import MapboxGL from '@rnmapbox/maps';
import { supabase } from '../../lib/supabase';
import { useBoards, Board } from '../../hooks/useBoards';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { Category, MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  TAB_CLEARANCE,
  SCREEN_PAD,
  VISIBILITY_COLOR,
  VISIBILITY_LABEL,
} from '../../constants/theme';

// Token must be set before any MapView mounts. Idempotent — the map
// screen sets the same token on its own load.
MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const MORNINGSIDE: [number, number] = [-73.9626, 40.8075];

/** Translates places.category (MapPin vocab) to the noun used in the
 *  "mostly X" taste-profile chip. The discover-vocab plurals read more
 *  naturally than the singular schema values. */
const CATEGORY_MOSTLY: Record<string, string> = {
  food:       'food',
  bar:        'bars',
  beauty:     'beauty',
  experience: 'experiences',
  retail:     'shops',
};

/** Hand-picked neighborhood centroids around Columbia. Each pin gets
 *  bucketed to its nearest centroid via squared Euclidean distance on
 *  raw lat/lng — close enough at this scale, no PostGIS needed. */
const NEIGHBORHOODS: { name: string; lat: number; lng: number }[] = [
  { name: 'Morningside Heights', lat: 40.8075, lng: -73.9626 },
  { name: 'Manhattanville',      lat: 40.8156, lng: -73.9580 },
  { name: 'Hamilton Heights',    lat: 40.8226, lng: -73.9495 },
  { name: 'Harlem',              lat: 40.8116, lng: -73.9465 },
  { name: 'Upper West Side',     lat: 40.7870, lng: -73.9754 },
  { name: 'Washington Heights',  lat: 40.8417, lng: -73.9393 },
];

function neighborhoodFor(lat: number, lng: number): string {
  let best = NEIGHBORHOODS[0];
  let bestD = Infinity;
  for (const n of NEIGHBORHOODS) {
    const dlat = lat - n.lat;
    const dlng = lng - n.lng;
    const d = dlat * dlat + dlng * dlng;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best.name;
}

const ANNUAL_CHALLENGE_GOAL = 50;

/** Monday 00:00 of the week containing `d`, in local time. ISO weeks
 *  start on Monday; Sunday counts as the previous week. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = Sun, 1 = Mon, … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

/** Count consecutive weeks ending at the current week that contain at
 *  least one pin. Returns 0 if the current week has no pin. */
function computeStreak(pins: { created_at: string }[]): number {
  if (pins.length === 0) return 0;
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const weeksWithPin = new Set<string>();
  for (const p of pins) {
    weeksWithPin.add(key(startOfWeek(new Date(p.created_at))));
  }
  let streak = 0;
  const cursor = startOfWeek(new Date());
  while (weeksWithPin.has(key(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  campus: string;
}

const RANKING_CATEGORIES: { key: string; label: string }[] = [
  { key: 'cafes',       label: 'cafes'       },
  { key: 'food',        label: 'food'        },
  { key: 'bars',        label: 'bars'        },
  { key: 'shops',       label: 'shops'       },
  { key: 'experiences', label: 'experiences' },
];

const BOARD_ACCENTS = [ACCENT.red, ACCENT.electric, '#f4c542', '#2ec27e', '#7d5fff', '#e6739f'];

function boardAccentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return BOARD_ACCENTS[Math.abs(hash) % BOARD_ACCENTS.length];
}

export default function ProfileScreen() {
  const userId = useCurrentUserId() ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [allPins, setAllPins] = useState<MapPin[]>([]);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [topRanked, setTopRanked] = useState<{ name: string; category: string } | null>(null);
  const [statsError, setStatsError] = useState(false);
  const router = useRouter();
  const reqIdRef = useRef(0);

  const { boards, loading, refetch } = useBoards(userId);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase
      .from('users')
      .select('id, username, display_name, avatar_url, campus')
      .eq('id', userId)
      .single()
      .then(({ data }) => { if (active) setProfile(data); });
    return () => { active = false; };
  }, [userId]);

  const loadCounts = useCallback(async () => {
    if (!userId) return;
    const myReq = ++reqIdRef.current;
    const [followerRes, followingRes, pinsRes, topRankRes] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId).eq('status', 'active'),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'active'),
      supabase.from('pins').select(`
        id, user_id, status, impression, photo_url, created_at,
        users!inner(username, display_name, avatar_url),
        places!inner(id, name, category, address, lat, lng, photo_url)
      `).eq('user_id', userId).order('created_at', { ascending: false }),
      // Any #1 ranking — used for the taste-profile star chip. With
      // multiple categories the user gets multiple #1s; we just take
      // the first row Supabase returns.
      supabase.from('rankings')
        .select('position, category, places!inner(name)')
        .eq('user_id', userId)
        .eq('position', 1)
        .limit(1),
    ]);

    if (reqIdRef.current !== myReq) return; // superseded / unmounted
    if (pinsRes.error || followerRes.error || followingRes.error) {
      setStatsError(true);
      return; // keep prior data rather than blanking to zeros
    }
    setStatsError(false);
    setFollowerCount(followerRes.count ?? 0);
    setFollowingCount(followingRes.count ?? 0);

    const pins = (pinsRes.data ?? []).map((row: any) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const place = Array.isArray(row.places) ? row.places[0] : row.places;
      return {
        pin_id: row.id, user_id: row.user_id,
        username: user?.username ?? '', display_name: user?.display_name ?? '',
        avatar_url: user?.avatar_url ?? null,
        place_id: place?.id ?? '', place_name: place?.name ?? '',
        category: (place?.category ?? 'food') as Category,
        address: place?.address ?? '',
        lat: place?.lat ?? 0, lng: place?.lng ?? 0,
        // Prefer the pin author's own photo over the shared place photo.
        photo_url: row.photo_url ?? place?.photo_url ?? null,
        status: row.status, impression: row.impression ?? null,
        created_at: row.created_at,
      } as MapPin;
    });
    setAllPins(pins);

    if (topRankRes.data && topRankRes.data.length > 0) {
      const row = topRankRes.data[0] as any;
      const place = Array.isArray(row.places) ? row.places[0] : row.places;
      setTopRanked({
        name: place?.name ?? '',
        category: row.category ?? '',
      });
    } else {
      setTopRanked(null);
    }
  }, [userId]);

  // Single path: fires on first focus, on userId change (callbacks change
  // identity), and on refocus — no duplicate mount fetch.
  useFocusEffect(useCallback(() => { refetch(); loadCounts(); }, [refetch, loadCounts]));

  const beenPins = allPins.filter((p) => p.status === 'visited');
  const wantPins = allPins.filter((p) => p.status === 'want_to_go');

  // ─── Taste profile insights ─────────────────────────────────────────
  const topCategoryLabel = useMemo<string | null>(() => {
    if (allPins.length === 0) return null;
    const counts = new Map<string, number>();
    for (const p of allPins) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    let best: string | null = null;
    let max = 0;
    for (const [k, v] of counts) if (v > max) { max = v; best = k; }
    return best ? (CATEGORY_MOSTLY[best] ?? best) : null;
  }, [allPins]);

  const topNeighborhood = useMemo<string | null>(() => {
    if (allPins.length === 0) return null;
    const counts = new Map<string, number>();
    for (const p of allPins) {
      const nb = neighborhoodFor(p.lat, p.lng);
      counts.set(nb, (counts.get(nb) ?? 0) + 1);
    }
    let best: string | null = null;
    let max = 0;
    for (const [k, v] of counts) if (v > max) { max = v; best = k; }
    return best;
  }, [allPins]);

  const miniMapCenter = useMemo<[number, number]>(() => {
    if (allPins.length === 0) return MORNINGSIDE;
    let sumLat = 0, sumLng = 0;
    for (const p of allPins) { sumLat += p.lat; sumLng += p.lng; }
    return [sumLng / allPins.length, sumLat / allPins.length];
  }, [allPins]);

  // Mini-map camera fits to the bbox of the user's pins. defaultSettings
  // only seeds the initial frame; re-fitting via ref handles the case
  // where pins arrive after the map has mounted.
  const miniMapCameraRef = useRef<MapboxGL.Camera>(null);
  useEffect(() => {
    if (allPins.length === 0) return;
    let minLat = allPins[0].lat, maxLat = allPins[0].lat;
    let minLng = allPins[0].lng, maxLng = allPins[0].lng;
    for (const p of allPins) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    // fitBounds(neCoord, swCoord, padding, animationDuration)
    miniMapCameraRef.current?.fitBounds(
      [maxLng, maxLat],
      [minLng, minLat],
      30,
      0,
    );
  }, [allPins]);

  const hasTasteProfile = !!(topCategoryLabel || topNeighborhood || topRanked);

  // ─── Streak + annual challenge ──────────────────────────────────────
  const streak = useMemo(() => computeStreak(allPins), [allPins]);

  const currentYear = new Date().getFullYear();
  const pinsThisYear = useMemo(
    () => allPins.filter((p) => new Date(p.created_at).getFullYear() === currentYear).length,
    [allPins, currentYear],
  );
  const challengeProgress = Math.min(pinsThisYear / ANNUAL_CHALLENGE_GOAL, 1);

  const initials = profile?.display_name
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '';

  async function handleShare() {
    try {
      await Share.share({ message: `Check out @${profile?.username ?? ''} on Filo` });
    } catch {}
  }

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Header kicker */}
          <View style={styles.headerBlock}>
            <Text style={styles.metaLabel}>YOUR PROFILE</Text>
            <Text style={styles.title}>
              the map <Text style={styles.titleItalic}>you</Text>{'\n'}would draw.
            </Text>
          </View>

          {/* Avatar + name */}
          <View style={styles.profileSection}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <Text style={styles.displayName}>{profile?.display_name ?? ''}</Text>
            <Text style={styles.username}>@{profile?.username ?? ''}</Text>
          </View>

          {/* Stats row — sticker card */}
          <View style={styles.statsCard}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push('/(app)/follow-list?mode=followers' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{followerCount}</Text>
              <Text style={styles.statLabel}>FOLLOWERS</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => router.push('/(app)/follow-list?mode=following' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.statNumber}>{followingCount}</Text>
              <Text style={styles.statLabel}>FOLLOWING</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{allPins.length}</Text>
              <Text style={styles.statLabel}>PINS</Text>
            </View>
          </View>

          {statsError && (
            <TouchableOpacity
              onPress={() => loadCounts()}
              activeOpacity={0.85}
              style={{
                marginHorizontal: SCREEN_PAD,
                marginTop: 10,
                borderWidth: 1,
                borderColor: ACCENT.red,
                backgroundColor: PALETTE.surface,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 0.5, color: ACCENT.red }}>
                couldn&apos;t refresh your stats · tap to retry
              </Text>
            </TouchableOpacity>
          )}

          {/* Find friends — permanent entry point to the directory,
              which is otherwise unreachable from the tab bar. */}
          <TouchableOpacity
            style={styles.findFriendsRow}
            onPress={() => router.push('/(app)/directory' as never)}
            activeOpacity={0.85}
          >
            <Text style={styles.findFriendsKicker}>WHO'S PINNING</Text>
            <Text style={styles.findFriendsCta}>
              find <Text style={styles.findFriendsCtaItalic}>friends</Text> →
            </Text>
          </TouchableOpacity>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>edit profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>share profile</Text>
            </TouchableOpacity>
          </View>

          {/* Taste profile chips */}
          {hasTasteProfile && (
            <View style={styles.tasteRow}>
              {topCategoryLabel && (
                <View style={styles.tasteChip}>
                  <Text style={styles.tasteChipText}>
                    MOSTLY {topCategoryLabel.toUpperCase()}
                  </Text>
                </View>
              )}
              {topNeighborhood && (
                <View style={styles.tasteChip}>
                  <Text style={styles.tasteChipText}>{topNeighborhood.toUpperCase()}</Text>
                </View>
              )}
              {topRanked && (
                <View style={styles.tasteChip}>
                  <Text style={styles.tasteChipText} numberOfLines={1}>
                    ★ {topRanked.name.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Rankings */}
          <View style={styles.rankingsHeader}>
            <Text style={styles.metaLabel}>YOUR RANKINGS</Text>
            <Text style={styles.boardsTitle}>
              <Text style={styles.boardsTitleItalic}>taste.</Text>
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rankingsScroll}
          >
            {RANKING_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={styles.rankingsPill}
                onPress={() =>
                  router.push(`/(app)/rankings?category=${c.key}` as never)
                }
                activeOpacity={0.85}
              >
                <Text style={styles.rankingsPillText}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Been / Want to Go */}
          <View style={styles.sectionList}>
            <TouchableOpacity style={styles.sectionRow} activeOpacity={0.85}>
              <View style={styles.sectionRowLeft}>
                <View style={styles.sectionRowGlyphWrap}>
                  <Text style={styles.sectionRowGlyph}>✓</Text>
                </View>
                <View>
                  <Text style={styles.sectionRowKicker}>STATUS</Text>
                  <Text style={styles.sectionRowLabel}>been</Text>
                </View>
              </View>
              <View style={styles.sectionRowRight}>
                <View style={styles.countChip}>
                  <Text style={styles.countChipText}>{beenPins.length}</Text>
                </View>
                <Text style={styles.chevron}>→</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sectionRow} activeOpacity={0.85}>
              <View style={styles.sectionRowLeft}>
                <View style={styles.sectionRowGlyphWrap}>
                  <Text style={styles.sectionRowGlyph}>♡</Text>
                </View>
                <View>
                  <Text style={styles.sectionRowKicker}>WISHLIST</Text>
                  <Text style={styles.sectionRowLabel}>want to go</Text>
                </View>
              </View>
              <View style={styles.sectionRowRight}>
                <View style={styles.countChip}>
                  <Text style={styles.countChipText}>{wantPins.length}</Text>
                </View>
                <Text style={styles.chevron}>→</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Boards */}
          <View style={styles.boardsHeader}>
            <View>
              <Text style={styles.metaLabel}>YOUR LISTS</Text>
              <Text style={styles.boardsTitle}>
                <Text style={styles.boardsTitleItalic}>boards</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={styles.newBoardBtn}
              onPress={() => router.push('/board-modal/create')}
              activeOpacity={0.85}
            >
              <Text style={styles.newBoardBtnText}>+ new</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={ACCENT.red} style={{ marginTop: 24 }} />
          ) : boards.length === 0 ? (
            <View style={styles.emptyBoards}>
              <Text style={styles.emptyBoardsText}>no boards yet.</Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => router.push('/board-modal/create')}
                activeOpacity={0.85}
              >
                <Text style={styles.createBtnText}>create your first board</Text>
              </TouchableOpacity>
            </View>
          ) : (
            (() => {
              // Pinterest-style masonry: two columns, alternating heights so
              // adjacent cards across columns are uneven. Pattern is offset
              // between columns so the visual rhythm reads organic, not
              // striped.
              const HEIGHT_PATTERN = [240, 180, 180, 240];
              const distributed = boards.map((b: Board, i: number) => ({
                board: b,
                col: (i % 2) as 0 | 1,
                height: HEIGHT_PATTERN[i % HEIGHT_PATTERN.length],
              }));
              const colA = distributed.filter((d) => d.col === 0);
              const colB = distributed.filter((d) => d.col === 1);

              const renderCard = ({
                board,
                height,
              }: {
                board: Board;
                height: number;
              }) => {
                const accent = boardAccentColor(board.name);
                return (
                  <TouchableOpacity
                    key={board.id}
                    style={[styles.boardCard, { height }]}
                    onPress={() => router.push(`/(app)/board/${board.id}`)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.boardCover, { backgroundColor: PALETTE.zone1 }]}>
                      <View style={[styles.boardCoverHalo, { backgroundColor: accent, opacity: 0.18 }]} />
                      <Text style={[styles.boardCoverLetter, { color: accent }]}>
                        {board.name[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.boardCardBottom}>
                      <Text style={styles.boardCardName} numberOfLines={1}>{board.name}</Text>
                      <View style={styles.boardCardMeta}>
                        <Text style={styles.boardCardCount}>{board.pin_count} pins</Text>
                        <View style={[styles.visBadge, { borderColor: VISIBILITY_COLOR[board.visibility] }]}>
                          <Text style={[styles.visBadgeText, { color: VISIBILITY_COLOR[board.visibility] }]}>
                            {VISIBILITY_LABEL[board.visibility].toLowerCase()}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              };

              return (
                <View style={styles.boardGrid}>
                  <View style={styles.boardColumn}>{colA.map(renderCard)}</View>
                  <View style={styles.boardColumn}>{colB.map(renderCard)}</View>
                </View>
              );
            })()
          )}

          {/* Mini map — non-interactive identity element */}
          {allPins.length > 0 && (
            <View style={styles.miniMapWrap} pointerEvents="none">
              <MapboxGL.MapView
                style={StyleSheet.absoluteFill}
                styleURL={MapboxGL.StyleURL.Street}
                logoEnabled={false}
                attributionEnabled={false}
                compassEnabled={false}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                <MapboxGL.Camera
                  ref={miniMapCameraRef}
                  defaultSettings={{
                    centerCoordinate: miniMapCenter,
                    zoomLevel: 13,
                  }}
                />
                <MapboxGL.ShapeSource
                  id="profile-pins"
                  shape={{
                    type: 'FeatureCollection',
                    features: allPins.map((p) => ({
                      type: 'Feature',
                      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
                      properties: { id: p.pin_id },
                    })),
                  }}
                >
                  <MapboxGL.CircleLayer
                    id="profile-pins-layer"
                    style={{
                      circleColor: ACCENT.red,
                      circleRadius: 5,
                      circleStrokeWidth: 1.5,
                      circleStrokeColor: PALETTE.ink,
                    }}
                  />
                </MapboxGL.ShapeSource>
              </MapboxGL.MapView>
            </View>
          )}

          {/* Overview — streak + challenge + wrapped, grouped at the bottom */}
          <View style={styles.overviewHeader}>
            <Text style={styles.metaLabel}>OVERVIEW</Text>
          </View>

          {streak > 0 ? (
            <View style={styles.streakChip}>
              <Text style={styles.streakText}>◉ {streak} week streak</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.streakChip}
              onPress={() => router.push('/pin/search' as never)}
              activeOpacity={0.85}
            >
              <Text style={styles.streakText}>start your streak →</Text>
            </TouchableOpacity>
          )}

          <View style={styles.challengeCard}>
            <View style={styles.challengeRow}>
              <Text style={styles.challengeKicker}>{currentYear}</Text>
              <Text style={styles.challengeCount}>
                {pinsThisYear}
                <Text style={styles.challengeCountTotal}> / {ANNUAL_CHALLENGE_GOAL}</Text>
              </Text>
            </View>
            <View style={styles.challengeBar}>
              <View
                style={[
                  styles.challengeBarFill,
                  { width: `${challengeProgress * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.challengeFootnote}>places this year</Text>
          </View>

          <TouchableOpacity
            style={styles.wrappedRow}
            onPress={() => router.push('/(app)/wrapped' as never)}
            activeOpacity={0.85}
          >
            <View style={styles.wrappedLeft}>
              <Text style={styles.wrappedKicker}>{currentYear} REVIEW</Text>
              <Text style={styles.wrappedTitle}>
                your <Text style={styles.wrappedTitleItalic}>year in filo.</Text>
              </Text>
            </View>
            <Text style={styles.wrappedArrow}>→</Text>
          </TouchableOpacity>

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutBtn} onPress={() => supabase.auth.signOut()} activeOpacity={0.7}>
            <Text style={styles.signOutText}>sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  scroll: { paddingBottom: TAB_CLEARANCE },

  // Header kicker
  headerBlock: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 18,
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

  // Avatar block
  profileSection: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 18,
    paddingHorizontal: SCREEN_PAD,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PALETTE.ink,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: PALETTE.zone1,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...STICKER_SHADOW,
  },
  avatarInitials: {
    fontFamily: FONTS.display,
    fontSize: 30,
    color: ACCENT.red,
    fontWeight: '400',
  },
  displayName: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
    marginBottom: 2,
  },
  username: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
  },

  // Stats sticker card
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SCREEN_PAD,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNumber: {
    fontFamily: FONTS.display,
    fontSize: 24,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  statLabel: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
  },
  statDivider: { width: 1, height: 32, backgroundColor: PALETTE.inkLine },

  // Streak
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: SCREEN_PAD,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: ACCENT.red,
    ...STICKER_SHADOW,
  },
  streakText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: ACCENT.red,
    fontWeight: '600',
  },

  // Annual challenge
  challengeCard: {
    marginHorizontal: SCREEN_PAD,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  challengeKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  challengeCount: {
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    fontSize: 24,
    color: ACCENT.red,
    fontWeight: '400',
  },
  challengeCountTotal: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    fontStyle: 'normal',
  },
  challengeBar: {
    height: 4,
    backgroundColor: PALETTE.zone2,
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
    overflow: 'hidden',
  },
  challengeBarFill: {
    height: 2,
    backgroundColor: ACCENT.red,
  },
  challengeFootnote: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
    marginTop: 8,
    textTransform: 'lowercase',
  },

  // Wrapped row
  wrappedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: SCREEN_PAD,
    marginTop: 4,
    marginBottom: 14,
    backgroundColor: PALETTE.ink,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  wrappedLeft: { flex: 1 },
  wrappedKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.55)',
  },
  wrappedTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.bg,
    fontWeight: '400',
    marginTop: 2,
  },
  wrappedTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  wrappedArrow: {
    fontFamily: FONTS.body,
    fontSize: 22,
    color: PALETTE.bg,
  },

  // Taste profile
  tasteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 14,
    paddingBottom: 12,
  },
  tasteChip: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '100%',
    ...STICKER_SHADOW,
  },
  tasteChipText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: PALETTE.ink,
    fontWeight: '600',
  },

  // Overview header
  overviewHeader: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 12,
    paddingBottom: 4,
  },

  // Mini map
  miniMapWrap: {
    height: 140,
    marginHorizontal: SCREEN_PAD,
    marginTop: 4,
    marginBottom: 6,
    backgroundColor: PALETTE.zone1,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    overflow: 'hidden',
    ...STICKER_SHADOW_LG,
  },
  miniMapDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.surface,
  },

  // Find friends row
  findFriendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SCREEN_PAD,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  findFriendsKicker: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    flexShrink: 1,
  },
  findFriendsCta: {
    fontFamily: FONTS.display,
    fontSize: 18,
    color: PALETTE.ink,
    fontWeight: '400',
    textAlign: 'right',
  },
  findFriendsCtaItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 12,
    paddingBottom: 22,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingVertical: 11,
    alignItems: 'center',
    ...STICKER_SHADOW,
  },
  actionBtnText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.ink,
  },

  // Section rows
  sectionList: {
    paddingHorizontal: SCREEN_PAD,
    gap: 10,
    paddingBottom: 24,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  sectionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionRowGlyphWrap: {
    width: 38,
    height: 38,
    backgroundColor: PALETTE.zone1,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionRowGlyph: {
    fontSize: 16,
    color: ACCENT.red,
  },
  sectionRowKicker: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'uppercase',
  },
  sectionRowLabel: {
    fontFamily: FONTS.display,
    fontSize: 18,
    color: PALETTE.ink,
    fontWeight: '400',
    marginTop: 2,
  },
  sectionRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countChip: {
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: PALETTE.surface,
    ...STICKER_SHADOW,
  },
  countChipText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: PALETTE.ink,
    letterSpacing: 0.5,
  },
  chevron: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: PALETTE.ink,
  },

  // Boards
  rankingsHeader: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 4,
    paddingBottom: 12,
  },
  rankingsScroll: {
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: 24,
    gap: 8,
  },
  rankingsPill: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    borderRadius: RADII.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    ...STICKER_SHADOW,
  },
  rankingsPillText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.ink,
  },

  boardsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 14,
  },
  boardsTitle: {
    fontFamily: FONTS.display,
    fontSize: 26,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  boardsTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  newBoardBtn: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...STICKER_SHADOW,
  },
  newBoardBtnText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.ink,
  },

  boardGrid: {
    flexDirection: 'row',
    paddingHorizontal: SCREEN_PAD,
    gap: 12,
    alignItems: 'flex-start',
  },
  boardColumn: {
    flex: 1,
    gap: 12,
  },
  boardCard: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    overflow: 'hidden',
    ...STICKER_SHADOW_LG,
  },
  boardCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.ink,
  },
  boardCoverHalo: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  boardCoverLetter: {
    fontFamily: FONTS.display,
    fontSize: 56,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  boardCardBottom: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  boardCardName: {
    fontFamily: FONTS.display,
    fontSize: 14,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  boardCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boardCardCount: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: PALETTE.inkSoft,
  },
  visBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  visBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: '600',
  },

  emptyBoards: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 40,
    gap: 14,
  },
  emptyBoardsText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
  },
  createBtn: {
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 22,
    paddingVertical: 11,
    ...STICKER_SHADOW_LG,
  },
  createBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  signOutBtn: {
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 16,
  },
  signOutText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
  },
});
