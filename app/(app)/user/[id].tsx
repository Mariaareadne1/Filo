import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useFollow } from '../../../hooks/useFollow';
import { useBoards, Board } from '../../../hooks/useBoards';
import { CATEGORY_COLORS, CATEGORY_LABELS, Category, MapPin } from '../../../types';
import { PinDetailSheet } from '../../../components/PinDetailSheet';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  campus: string;
  is_private: boolean;
}

const VISIBILITY_COLOR: Record<string, string> = {
  public: '#22c55e',
  friends: '#3b82f6',
  private: '#aaa',
};
const VISIBILITY_LABEL: Record<string, string> = {
  public: 'Public',
  friends: 'Friends',
  private: 'Private',
};

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
      supabase
        .from('users')
        .select('id, username, display_name, avatar_url, campus, is_private')
        .eq('id', id)
        .single(),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', id)
        .eq('status', 'active'),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', id)
        .eq('status', 'active'),
      supabase
        .from('pins')
        .select(`
          id, user_id, status, impression, created_at,
          users!inner(username, display_name, avatar_url),
          places!inner(id, name, category, address, lat, lng, photo_url)
        `)
        .eq('user_id', id)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    setProfile(profileRes.data ?? null);
    setFollowerCount(followerRes.count ?? 0);
    setFollowingCount(followingRes.count ?? 0);

    const pins = (pinsRes.data ?? []).map((row: any) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const place = Array.isArray(row.places) ? row.places[0] : row.places;
      return {
        pin_id: row.id,
        user_id: row.user_id,
        username: user?.username ?? '',
        display_name: user?.display_name ?? '',
        avatar_url: user?.avatar_url ?? null,
        place_id: place?.id ?? '',
        place_name: place?.name ?? '',
        category: (place?.category ?? 'food') as Category,
        address: place?.address ?? '',
        lat: place?.lat ?? 0,
        lng: place?.lng ?? 0,
        photo_url: place?.photo_url ?? null,
        status: row.status,
        impression: row.impression ?? null,
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

  const followButtonStyle = () => {
    if (status === 'active') return [styles.followBtn, styles.followingBtn];
    if (status === 'pending') return [styles.followBtn, styles.pendingBtn];
    return [styles.followBtn];
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#E63946" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFound}>User not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Back button */}
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
          </View>
          <Text style={styles.displayName}>{profile.display_name}</Text>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.campus ? (
            <View style={styles.campusBadge}>
              <Text style={styles.campusBadgeText}>🎓 Columbia</Text>
            </View>
          ) : null}
        </View>

        {/* Follower stats */}
        <View style={styles.statsRow}>
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
            <Text style={styles.statNumber}>{recentPins.length > 0 ? '…' : 0}</Text>
            <Text style={styles.statLabel}>Pins</Text>
          </View>
        </View>

        {/* Follow / Unfollow button */}
        {!isOwnProfile ? (
          <TouchableOpacity
            style={followButtonStyle()}
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
                  style={styles.pinRow}
                  onPress={() => setSelectedPin(pin)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.pinDot, { backgroundColor: color }]} />
                  <View style={styles.pinInfo}>
                    <Text style={styles.pinName}>{pin.place_name}</Text>
                    <Text style={[styles.pinCategory, { color }]}>{label}</Text>
                    {pin.impression ? (
                      <Text style={styles.pinImpression} numberOfLines={1}>
                        "{pin.impression}"
                      </Text>
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
            {boards
              .filter((b) => b.visibility === 'public' || (status === 'active' && b.visibility === 'friends') || isOwnProfile)
              .map((board: Board) => (
                <TouchableOpacity
                  key={board.id}
                  style={styles.boardRow}
                  onPress={() => router.push(`/(app)/board/${board.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.boardIcon}>
                    <Text style={styles.boardIconEmoji}>📋</Text>
                  </View>
                  <View style={styles.boardInfo}>
                    <Text style={styles.boardName}>{board.name}</Text>
                    <Text style={styles.boardCount}>{board.pin_count} pins</Text>
                  </View>
                  <View style={[styles.visBadge, { borderColor: VISIBILITY_COLOR[board.visibility] }]}>
                    <Text style={[styles.visBadgeText, { color: VISIBILITY_COLOR[board.visibility] }]}>
                      {VISIBILITY_LABEL[board.visibility]}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
          </View>
        )}

        {recentPins.length === 0 && boards.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📍</Text>
            <Text style={styles.emptyText}>No pins yet.</Text>
          </View>
        )}
      </ScrollView>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 16, color: '#888' },
  scroll: { paddingBottom: 60 },

  backBtn: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  backText: { fontSize: 14, color: '#E63946', fontWeight: '600' },

  header: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  avatarWrap: { marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: '#666' },
  displayName: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 4 },
  username: { fontSize: 14, color: '#888', marginBottom: 8 },
  campusBadge: {
    backgroundColor: '#f0f4ff', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  campusBadgeText: { fontSize: 12, color: '#4361EE', fontWeight: '600' },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, marginHorizontal: 20,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f0f0f0',
    gap: 0,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNumber: { fontSize: 20, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 12, color: '#888' },
  statDivider: { width: 1, height: 32, backgroundColor: '#f0f0f0' },

  followBtn: {
    marginHorizontal: 20, marginTop: 16, marginBottom: 4,
    backgroundColor: '#E63946', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  followingBtn: { backgroundColor: '#f0f0f0' },
  pendingBtn: { backgroundColor: '#f5f5f5' },
  followBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  followingBtnText: { color: '#555' },

  editBtn: {
    marginHorizontal: 20, marginTop: 16, marginBottom: 4,
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  editBtnText: { fontSize: 15, fontWeight: '600', color: '#aaa' },

  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 12 },

  pinRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 14,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  pinDot: { width: 10, height: 10, borderRadius: 5 },
  pinInfo: { flex: 1, gap: 2 },
  pinName: { fontSize: 15, fontWeight: '700', color: '#111' },
  pinCategory: { fontSize: 12, fontWeight: '600' },
  pinImpression: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  pinChevron: { fontSize: 20, color: '#ccc' },

  boardRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  boardIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center',
  },
  boardIconEmoji: { fontSize: 18 },
  boardInfo: { flex: 1, gap: 2 },
  boardName: { fontSize: 15, fontWeight: '700', color: '#111' },
  boardCount: { fontSize: 12, color: '#888' },
  visBadge: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  visBadgeText: { fontSize: 11, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: '#aaa' },
});
