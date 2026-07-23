import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect, Redirect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useFollow } from '../../../hooks/useFollow';
import { useBoards, Board } from '../../../hooks/useBoards';
import { useCurrentUserId } from '../../../hooks/useCurrentUserId';
import { parseIdParam } from '../../../lib/params';
import { CATEGORY_LABELS, Category, MapPin } from '../../../types';
import { PinDetailSheet } from '../../../components/PinDetailSheet';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  SCREEN_PAD,
  VISIBILITY_COLOR,
  VISIBILITY_LABEL,
} from '../../../constants/theme';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  campus: string;
  is_private: boolean;
}

const CATEGORY_GLYPH: Record<string, string> = {
  food: '◆', bar: '○', beauty: '◇', experience: '✦', retail: '◉',
};

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

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const id = parseIdParam(params.id);
  const router = useRouter();

  const currentUserId = useCurrentUserId() ?? null;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [recentPins, setRecentPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const reqIdRef = useRef(0);

  const { boards } = useBoards(id);
  const { status, loading: followLoading, follow, unfollow } = useFollow(currentUserId, id);

  const isOwnProfile = currentUserId === id;

  const loadProfile = useCallback(async () => {
    if (!id) return;
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const [profileRes, followerRes, followingRes, pinsRes] = await Promise.all([
      supabase.from('users').select('id, username, display_name, avatar_url, campus, is_private').eq('id', id).single(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id).eq('status', 'active'),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id).eq('status', 'active'),
      supabase.from('pins').select(`
        id, user_id, status, impression, photo_url, created_at,
        users!inner(username, display_name, avatar_url),
        places!inner(id, name, category, address, lat, lng, photo_url)
      `).eq('user_id', id).eq('is_public', true).order('created_at', { ascending: false }).limit(6),
    ]);

    if (reqIdRef.current !== myReq) return;
    setProfile(profileRes.data ?? null);
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
    setRecentPins(pins);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  const handleFollowPress = async () => {
    if (!profile) return;
    if (status === 'active' || status === 'pending') {
      await unfollow();
    } else {
      await follow(profile.is_private);
    }
  };

  const initials = profile?.display_name
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '';

  const followButtonLabel = () => {
    if (followLoading) return '...';
    if (status === 'active') return 'following ✓';
    if (status === 'pending') return 'requested';
    return '+ follow';
  };

  // Malformed/duplicated deep link — redirect cleanly. All hooks above run
  // unconditionally first.
  if (!id) return <Redirect href="/(app)/discover" />;

  if (loading) {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={ACCENT.red} size="large" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.loadingContainer}>
            <Text style={styles.notFound}>user not found.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const visibleBoards = boards.filter(
    (b) =>
      b.visibility === 'public' ||
      (status === 'active' && b.visibility === 'friends') ||
      isOwnProfile
  );

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Back — use canGoBack so deep-link / replace cases land on
              the tab root instead of throwing nav state. router.back()
              already returns to the originating screen (map, feed,
              directory) when the stack has history. */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(app)' as never);
            }}
            hitSlop={12}
          >
            <Text style={styles.backText}>← back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.metaLabel}>PROFILE · @{profile.username.toUpperCase()}</Text>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <Text style={styles.displayName}>{profile.display_name}</Text>
            <Text style={styles.username}>@{profile.username}</Text>
            {profile.campus ? (
              <View style={styles.campusBadge}>
                <Text style={styles.campusBadgeText}>columbia</Text>
              </View>
            ) : null}
          </View>

          {/* Stats */}
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{followerCount}</Text>
              <Text style={styles.statLabel}>FOLLOWERS</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{followingCount}</Text>
              <Text style={styles.statLabel}>FOLLOWING</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{recentPins.length}</Text>
              <Text style={styles.statLabel}>PINS</Text>
            </View>
          </View>

          {/* Follow / Sign out */}
          {!isOwnProfile ? (
            <TouchableOpacity
              style={[
                styles.followBtn,
                (status === 'active' || status === 'pending') && styles.followBtnSecondary,
              ]}
              onPress={handleFollowPress}
              disabled={followLoading}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.followBtnText,
                  (status === 'active' || status === 'pending') && styles.followBtnTextSecondary,
                ]}
              >
                {followButtonLabel()}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => supabase.auth.signOut()}
              activeOpacity={0.85}
            >
              <Text style={styles.editBtnText}>sign out</Text>
            </TouchableOpacity>
          )}

          {/* Rankings */}
          <View style={styles.section}>
            <Text style={styles.sectionMeta}>RANKINGS</Text>
            <Text style={styles.sectionTitle}>
              their <Text style={styles.sectionTitleItalic}>taste.</Text>
            </Text>
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
                    router.push(`/(app)/rankings?category=${c.key}&userId=${id}` as never)
                  }
                  activeOpacity={0.85}
                >
                  <Text style={styles.rankingsPillText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Recent pins */}
          {recentPins.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionMeta}>RECENT</Text>
              <Text style={styles.sectionTitle}>
                pinned <Text style={styles.sectionTitleItalic}>by them.</Text>
              </Text>
              <View style={styles.pinList}>
                {recentPins.map((pin) => {
                  const glyph = CATEGORY_GLYPH[pin.category] ?? '◉';
                  const label = CATEGORY_LABELS[pin.category] ?? pin.category;
                  return (
                    <TouchableOpacity
                      key={pin.pin_id}
                      style={styles.pinRow}
                      onPress={() => setSelectedPin(pin)}
                      activeOpacity={0.92}
                    >
                      <View style={styles.pinIcon}>
                        <Text style={styles.pinGlyph}>{glyph}</Text>
                      </View>
                      <View style={styles.pinInfo}>
                        <Text style={styles.pinName} numberOfLines={1}>{pin.place_name}</Text>
                        <Text style={styles.pinCategory}>{label.toLowerCase()}</Text>
                        {pin.impression ? (
                          <Text style={styles.pinImpression} numberOfLines={1}>
                            "{pin.impression}"
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.pinChevron}>→</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Boards */}
          {visibleBoards.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionMeta}>LISTS</Text>
              <Text style={styles.sectionTitle}>
                their <Text style={styles.sectionTitleItalic}>boards.</Text>
              </Text>
              {(() => {
                // Pinterest-style masonry (matches profile.tsx) — two
                // columns, alternating heights so adjacent cards across
                // columns are uneven.
                const HEIGHT_PATTERN = [240, 180, 180, 240];
                const distributed = visibleBoards.map((b: Board, i: number) => ({
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
              })()}
            </View>
          )}

          {recentPins.length === 0 && visibleBoards.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyRing} />
              <Text style={styles.emptyTitle}>no pins yet.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: PALETTE.inkSoft,
  },
  scroll: { paddingBottom: 60 },

  backBtn: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 12,
    paddingBottom: 22,
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginBottom: 14,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    marginBottom: 12,
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
    fontSize: 24,
    color: PALETTE.ink,
    fontWeight: '400',
    marginBottom: 2,
  },
  username: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
    marginBottom: 10,
  },
  campusBadge: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 10,
    paddingVertical: 3,
    ...STICKER_SHADOW,
  },
  campusBadgeText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: PALETTE.ink,
    fontWeight: '600',
  },

  // Stats
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

  // Follow buttons
  followBtn: {
    marginHorizontal: SCREEN_PAD,
    marginTop: 14,
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: ACCENT.red,
    paddingVertical: 14,
    alignItems: 'center',
    ...STICKER_SHADOW_LG,
  },
  followBtnSecondary: {
    backgroundColor: PALETTE.surface,
    borderColor: PALETTE.ink,
  },
  followBtnText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.surface,
  },
  followBtnTextSecondary: { color: PALETTE.ink },

  editBtn: {
    marginHorizontal: SCREEN_PAD,
    marginTop: 14,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingVertical: 13,
    alignItems: 'center',
    ...STICKER_SHADOW,
  },
  editBtnText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.ink,
  },

  // Sections
  section: {
    marginTop: 28,
    paddingHorizontal: SCREEN_PAD,
  },
  sectionMeta: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: FONTS.display,
    fontSize: 24,
    color: PALETTE.ink,
    fontWeight: '400',
    marginBottom: 14,
  },
  sectionTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },

  // Rankings pills
  rankingsScroll: {
    paddingTop: 4,
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

  // Pin list
  pinList: { gap: 10 },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW,
  },
  pinIcon: {
    width: 36,
    height: 36,
    backgroundColor: PALETTE.zone1,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinGlyph: { fontSize: 14, color: ACCENT.red },
  pinInfo: { flex: 1, gap: 2 },
  pinName: {
    fontFamily: FONTS.display,
    fontSize: 15,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  pinCategory: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
  },
  pinImpression: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    fontStyle: 'italic',
    marginTop: 2,
  },
  pinChevron: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: PALETTE.ink,
  },

  // Boards — Pinterest-style masonry
  boardGrid: {
    flexDirection: 'row',
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

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: ACCENT.red,
    opacity: 0.4,
  },
  emptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 20,
    color: PALETTE.inkSoft,
    fontWeight: '400',
  },
});
