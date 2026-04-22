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
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useBoards, Board } from '../../hooks/useBoards';
import { CATEGORY_COLORS, CATEGORY_LABELS, Category, MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  campus: string;
}

const VISIBILITY_LABEL: Record<string, string> = {
  public: 'Public',
  friends: 'Friends',
  private: 'Private',
};

const VISIBILITY_COLOR: Record<string, string> = {
  public: '#22c55e',
  friends: '#3b82f6',
  private: '#aaa',
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [recentPins, setRecentPins] = useState<MapPin[]>([]);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const router = useRouter();

  const { boards, loading, refetch } = useBoards(userId);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, campus')
        .eq('id', user.id)
        .single();
      setProfile(data);
    })();
  }, []);

  const loadCounts = useCallback(async () => {
    if (!userId) return;
    const [followerRes, followingRes, pinsRes] = await Promise.all([
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId)
        .eq('status', 'active'),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId)
        .eq('status', 'active'),
      supabase
        .from('pins')
        .select(`
          id, user_id, status, impression, created_at,
          users!inner(username, display_name, avatar_url),
          places!inner(id, name, category, address, lat, lng, photo_url)
        `)
        .eq('user_id', userId)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

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
  }, [userId]);

  useFocusEffect(useCallback(() => {
    refetch();
    loadCounts();
  }, [userId]));

  useEffect(() => {
    if (userId) loadCounts();
  }, [userId]);

  const initials = profile?.display_name
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.displayName}>{profile?.display_name ?? ''}</Text>
            <Text style={styles.username}>@{profile?.username ?? ''}</Text>
            <View style={styles.campusBadge}>
              <Text style={styles.campusBadgeText}>🎓 Columbia</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={() => supabase.auth.signOut()}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
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
            <Text style={styles.statNumber}>{recentPins.length}</Text>
            <Text style={styles.statLabel}>Recent</Text>
          </View>
        </View>

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
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Boards section */}
        <View style={styles.boardsHeader}>
          <Text style={styles.boardsTitle}>My Boards</Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push('/board-modal/create')}
          >
            <Text style={styles.createBtnText}>+ New board</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#E63946" style={{ marginTop: 24 }} />
        ) : boards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No boards yet</Text>
            <Text style={styles.emptySub}>
              Create a board to organise your pins — "Late Night Eats", "Ideal Date Night", anything.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/board-modal/create')}
            >
              <Text style={styles.emptyBtnText}>Create your first board</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.boardList}>
            {boards.map((item: Board, idx: number) => (
              <View key={item.id}>
                {idx > 0 && <View style={styles.separator} />}
                <TouchableOpacity
                  style={styles.boardRow}
                  onPress={() => router.push(`/(app)/board/${item.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.boardIcon}>
                    <Text style={styles.boardIconEmoji}>📋</Text>
                  </View>
                  <View style={styles.boardInfo}>
                    <Text style={styles.boardName}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.boardDesc} numberOfLines={1}>{item.description}</Text>
                    ) : null}
                    <Text style={styles.boardCount}>{item.pin_count} pins</Text>
                  </View>
                  <View style={styles.boardRight}>
                    <View style={[styles.visBadge, { borderColor: VISIBILITY_COLOR[item.visibility] }]}>
                      <Text style={[styles.visBadgeText, { color: VISIBILITY_COLOR[item.visibility] }]}>
                        {VISIBILITY_LABEL[item.visibility]}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 14,
  },
  avatarWrap: {},
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#f0f0f0',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 20, fontWeight: '700', color: '#666' },
  profileInfo: { flex: 1, gap: 3 },
  displayName: { fontSize: 17, fontWeight: '800', color: '#111' },
  username: { fontSize: 13, color: '#888' },
  campusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f4ff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
  campusBadgeText: { fontSize: 11, color: '#4361EE', fontWeight: '600' },
  signOutBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  signOutText: { fontSize: 12, color: '#aaa' },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginHorizontal: 20,
    borderBottomWidth: 1, borderColor: '#f0f0f0',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNumber: { fontSize: 18, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 11, color: '#888' },
  statDivider: { width: 1, height: 28, backgroundColor: '#f0f0f0' },

  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 10 },
  pinRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  pinDot: { width: 9, height: 9, borderRadius: 5 },
  pinInfo: { flex: 1, gap: 1 },
  pinName: { fontSize: 14, fontWeight: '700', color: '#111' },
  pinCategory: { fontSize: 11, fontWeight: '600' },
  chevron: { fontSize: 20, color: '#ccc' },

  boardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  boardsTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  createBtn: {
    backgroundColor: '#E63946',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  boardList: {},
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 74 },

  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  boardIcon: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: '#fef2f2',
    alignItems: 'center', justifyContent: 'center',
  },
  boardIconEmoji: { fontSize: 22 },
  boardInfo: { flex: 1, gap: 2 },
  boardName: { fontSize: 15, fontWeight: '700', color: '#111' },
  boardDesc: { fontSize: 12, color: '#aaa' },
  boardCount: { fontSize: 12, color: '#888', marginTop: 2 },
  boardRight: { alignItems: 'flex-end', gap: 6 },
  visBadge: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  visBadgeText: { fontSize: 11, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 40, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    backgroundColor: '#E63946', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
