import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useFollow } from '../../../hooks/useFollow';
import { useBoards, Board } from '../../../hooks/useBoards';
import { CATEGORY_COLORS, CATEGORY_LABELS, Category, MapPin } from '../../../types';
import { PinDetailSheet } from '../../../components/PinDetailSheet';
import { COLORS, GLASS, GLASS_SM, VISIBILITY_COLOR, VISIBILITY_LABEL } from '../../../constants/theme';

const { width } = Dimensions.get('window');
const BOARD_CARD_SIZE = (width - 48 - 12) / 2;

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  campus: string;
  is_private: boolean;
}

function boardAccentColor(name: string): string {
  const colors = [COLORS.primary, COLORS.accent, '#06D6A0', '#FFB703', '#FB5607', '#7209B7'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

export default function UserProfileScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [recentPins, setRecentPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);

  const { boards } = useBoards(id ?? null);
  const { status, loading: followLoading, follow, unfollow } = useFollow(currentUserId, id ?? null);

  const isOwnProfile = currentUserId === id;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [profileRes, followerRes, followingRes, pinsRes] = await Promise.all([
      supabase.from('users').select('id, username, display_name, avatar_url, campus, is_private').eq('id', id).single(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id).eq('status', 'active'),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id).eq('status', 'active'),
      supabase.from('pins').select(`
        id, user_id, status, impression, created_at,
        users!inner(username, display_name, avatar_url),
        places!inner(id, name, category, address, lat, lng, photo_url)
      `).eq('user_id', id).eq('is_public', true).order('created_at', { ascending: false }).limit(6),
    ]);

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
        photo_url: place?.photo_url ?? null,
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
    if (status === 'active') return 'Following';
    if (status === 'pending') return 'Requested';
    return 'Follow';
  };

  if (loading) {
    return (
      <View style={styles.safe}>
        <View style={styles.orbRed} pointerEvents="none" />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.primary} size="large" />
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
            <Text style={styles.notFound}>User not found.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <View style={styles.orbRed} pointerEvents="none" />
      <View style={styles.orbBlue} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Avatar + name */}
          <View style={styles.header}>
            <View style={styles.avatarWrap}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              <View style={styles.avatarRing} />
            </View>
            <Text style={styles.displayName}>{profile.display_name}</Text>
            <Text style={styles.username}>@{profile.username}</Text>
            {profile.campus ? (
              <View style={styles.campusBadge}>
                <Text style={styles.campusBadgeText}>Columbia</Text>
              </View>
            ) : null}
          </View>

          {/* Stats */}
          <View style={[styles.statsRow, GLASS_SM]}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{followerCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{followingCount}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{recentPins.length > 0 ? recentPins.length : 0}</Text>
              <Text style={styles.statLabel}>Pins</Text>
            </View>
          </View>

          {/* Follow / Sign out button */}
          {!isOwnProfile ? (
            <TouchableOpacity
              style={[
                styles.followBtn,
                status === 'active' && styles.followingBtn,
                status === 'pending' && styles.pendingBtn,
              ]}
              onPress={handleFollowPress}
              disabled={followLoading}
            >
              <Text style={[
                styles.followBtnText,
                (status === 'active' || status === 'pending') && styles.followingBtnText,
              ]}>
                {followButtonLabel()}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => supabase.auth.signOut()}
            >
              <Text style={styles.editBtnText}>Sign out</Text>
            </TouchableOpacity>
          )}

          {/* Recent Pins */}
          {recentPins.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Pins</Text>
              {recentPins.map((pin) => {
                const color = CATEGORY_COLORS[pin.category] ?? '#888';
                const label = CATEGORY_LABELS[pin.category] ?? pin.category;
                return (
                  <TouchableOpacity
                    key={pin.pin_id}
                    style={[styles.pinRow, GLASS_SM]}
                    onPress={() => setSelectedPin(pin)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.pinDot, { backgroundColor: color }]} />
                    <View style={styles.pinInfo}>
                      <Text style={styles.pinName}>{pin.place_name}</Text>
                      <Text style={[styles.pinCategory, { color }]}>{label}</Text>
                      {pin.impression ? (
                        <Text style={styles.pinImpression} numberOfLines={1}>"{pin.impression}"</Text>
                      ) : null}
                    </View>
                    <Text style={styles.pinChevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Boards */}
          {boards.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Boards</Text>
              <View style={styles.boardGrid}>
                {boards
                  .filter((b) => b.visibility === 'public' || (status === 'active' && b.visibility === 'friends') || isOwnProfile)
                  .map((board: Board) => {
                    const accent = boardAccentColor(board.name);
                    return (
                      <TouchableOpacity
                        key={board.id}
                        style={[styles.boardCard, { borderColor: accent + '33' }]}
                        onPress={() => router.push(`/(app)/board/${board.id}`)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.boardCover, { backgroundColor: accent + '18' }]}>
                          <Text style={[styles.boardCoverLetter, { color: accent }]}>
                            {board.name[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.boardCardBottom}>
                          <Text style={styles.boardCardName} numberOfLines={1}>{board.name}</Text>
                          <View style={styles.boardCardMeta}>
                            <Text style={styles.boardCardCount}>{board.pin_count} pins</Text>
                            <View style={[styles.visBadge, { borderColor: VISIBILITY_COLOR[board.visibility] + '55' }]}>
                              <Text style={[styles.visBadgeText, { color: VISIBILITY_COLOR[board.visibility] }]}>
                                {VISIBILITY_LABEL[board.visibility]}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </View>
          )}

          {recentPins.length === 0 && boards.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyRing} />
              <Text style={styles.emptyText}>No pins yet.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  orbRed: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(230,57,70,0.12)', top: -40, right: -60,
  },
  orbBlue: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(67,97,238,0.08)', bottom: 100, left: -60,
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 16, color: COLORS.textSecondary },
  scroll: { paddingBottom: 60 },

  backBtn: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },

  header: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  avatarWrap: { marginBottom: 14, position: 'relative' },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: 'rgba(230,57,70,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 30, fontWeight: '700', color: COLORS.primary },
  avatarRing: {
    position: 'absolute', top: -3, left: -3,
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 2, borderColor: COLORS.primary + '45',
  },
  displayName: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  username: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 8 },
  campusBadge: {
    backgroundColor: 'rgba(67,97,238,0.18)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(67,97,238,0.35)',
  },
  campusBadgeText: { fontSize: 12, color: '#7B93FF', fontWeight: '600' },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 20, paddingVertical: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNumber: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(26,26,26,0.06)' },

  followBtn: {
    marginHorizontal: 20, marginTop: 16, marginBottom: 4,
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  followingBtn: { backgroundColor: 'rgba(26,26,26,0.06)', borderWidth: 1, borderColor: 'rgba(26,26,26,0.15)' },
  pendingBtn: { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(26,26,26,0.12)' },
  followBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  followingBtnText: { color: COLORS.textSecondary },

  editBtn: {
    marginHorizontal: 20, marginTop: 16, marginBottom: 4,
    borderWidth: 1, borderColor: 'rgba(26,26,26,0.15)', borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
  },
  editBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },

  section: { marginTop: 24, paddingHorizontal: 20, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4, letterSpacing: -0.3 },

  pinRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 12,
  },
  pinDot: { width: 10, height: 10, borderRadius: 5 },
  pinInfo: { flex: 1, gap: 2 },
  pinName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  pinCategory: { fontSize: 12, fontWeight: '600' },
  pinImpression: { fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic' },
  pinChevron: { fontSize: 20, color: 'rgba(26,26,26,0.18)' },

  boardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  boardCard: {
    width: BOARD_CARD_SIZE,
    height: BOARD_CARD_SIZE + 52,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
  },
  boardCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardCoverLetter: { fontSize: 48, fontWeight: '900', opacity: 0.7 },
  boardCardBottom: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(245,240,235,0.9)',
    gap: 3,
  },
  boardCardName: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  boardCardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boardCardCount: { fontSize: 10, color: COLORS.textSecondary },
  visBadge: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  visBadgeText: { fontSize: 9, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyRing: {
    width: 50, height: 50, borderRadius: 25,
    borderWidth: 1.5, borderColor: COLORS.primary + '40',
    marginBottom: 4,
  },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
});
