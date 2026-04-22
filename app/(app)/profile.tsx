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
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useBoards, Board } from '../../hooks/useBoards';
import { CATEGORY_COLORS, CATEGORY_LABELS, Category, MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { COLORS, GLASS, GLASS_SM, VISIBILITY_COLOR, VISIBILITY_LABEL } from '../../constants/theme';

const { width } = Dimensions.get('window');
const BOARD_CARD_SIZE = (width - 48 - 12) / 2;

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  campus: string;
}

function boardAccentColor(name: string): string {
  const colors = [COLORS.primary, COLORS.accent, '#06D6A0', '#FFB703', '#FB5607', '#7209B7'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

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
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId).eq('status', 'active'),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'active'),
      supabase.from('pins').select(`
        id, user_id, status, impression, created_at,
        users!inner(username, display_name, avatar_url),
        places!inner(id, name, category, address, lat, lng, photo_url)
      `).eq('user_id', userId).eq('is_public', true).order('created_at', { ascending: false }).limit(6),
    ]);

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
    <View style={styles.safe}>
      <View style={styles.orbRed} pointerEvents="none" />
      <View style={styles.orbBlue} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
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
              <View style={styles.avatarRing} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.displayName}>{profile?.display_name ?? ''}</Text>
              <Text style={styles.username}>@{profile?.username ?? ''}</Text>
              <View style={styles.campusBadge}>
                <Text style={styles.campusBadgeText}>Columbia</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.signOutBtn} onPress={() => supabase.auth.signOut()}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
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
              <Text style={styles.statNumber}>{recentPins.length}</Text>
              <Text style={styles.statLabel}>Recent</Text>
            </View>
          </View>

          {/* Red thread motif */}
          <View style={styles.threadWrap} pointerEvents="none">
            <View style={styles.threadLine} />
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
                    style={[styles.pinRow, GLASS_SM]}
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

          {/* Boards */}
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
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
          ) : boards.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyThreadDot} />
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
            <View style={styles.boardGrid}>
              {boards.map((item: Board) => {
                const accent = boardAccentColor(item.name);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.boardCard, { borderColor: accent + '33' }]}
                    onPress={() => router.push(`/(app)/board/${item.id}`)}
                    activeOpacity={0.8}
                  >
                    {/* Cover area */}
                    <View style={[styles.boardCover, { backgroundColor: accent + '18' }]}>
                      <View style={[styles.boardCoverAccent, { backgroundColor: accent + '22' }]} />
                      <Text style={[styles.boardCoverLetter, { color: accent }]}>
                        {item.name[0].toUpperCase()}
                      </Text>
                    </View>
                    {/* Bottom info */}
                    <View style={styles.boardCardBottom}>
                      <Text style={styles.boardCardName} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.boardCardMeta}>
                        <Text style={styles.boardCardCount}>{item.pin_count} pins</Text>
                        <View style={[styles.visBadge, { borderColor: VISIBILITY_COLOR[item.visibility] + '66' }]}>
                          <Text style={[styles.visBadgeText, { color: VISIBILITY_COLOR[item.visibility] }]}>
                            {VISIBILITY_LABEL[item.visibility]}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  orbRed: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(230,57,70,0.12)', top: -60, right: -60,
  },
  orbBlue: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(67,97,238,0.08)', bottom: 200, left: -80,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 14,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  avatarFallback: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(230,57,70,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  avatarRing: {
    position: 'absolute', top: -2, left: -2,
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: COLORS.primary + '50',
  },
  profileInfo: { flex: 1, gap: 3 },
  displayName: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  username: { fontSize: 13, color: COLORS.textSecondary },
  campusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(67,97,238,0.18)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
    borderWidth: 1,
    borderColor: 'rgba(67,97,238,0.35)',
  },
  campusBadgeText: { fontSize: 11, color: '#7B93FF', fontWeight: '600' },
  signOutBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  signOutText: { fontSize: 12, color: COLORS.textMuted },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    paddingVertical: 16,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNumber: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 11, color: COLORS.textSecondary },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(26,26,26,0.06)' },

  threadWrap: { alignItems: 'flex-end', paddingRight: 24, marginTop: 4 },
  threadLine: {
    width: 120, height: 28,
    borderTopWidth: 1.5,
    borderColor: 'rgba(230,57,70,0.35)',
    borderRadius: 40,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },

  section: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4, letterSpacing: -0.3 },
  pinRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 12,
  },
  pinDot: { width: 9, height: 9, borderRadius: 5 },
  pinInfo: { flex: 1, gap: 1 },
  pinName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  pinCategory: { fontSize: 11, fontWeight: '600' },
  chevron: { fontSize: 20, color: 'rgba(26,26,26,0.25)' },

  boardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 14,
  },
  boardsTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  createBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  createBtnText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },

  boardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    gap: 12,
  },
  boardCard: {
    width: BOARD_CARD_SIZE,
    height: BOARD_CARD_SIZE + 56,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
  },
  boardCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  boardCoverAccent: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    top: '20%', right: '10%',
  },
  boardCoverLetter: {
    fontSize: 52,
    fontWeight: '900',
    opacity: 0.7,
  },
  boardCardBottom: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(245,240,235,0.9)',
    gap: 4,
  },
  boardCardName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  boardCardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boardCardCount: { fontSize: 11, color: COLORS.textSecondary },
  visBadge: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  visBadgeText: { fontSize: 10, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 40, gap: 10 },
  emptyThreadDot: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.primary + '55',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 8,
  },
  emptyBtnText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 },
});
