import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Share,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useBoards, Board } from '../../hooks/useBoards';
import { CATEGORY_COLORS, CATEGORY_LABELS, Category, MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { COLORS, VISIBILITY_COLOR, VISIBILITY_LABEL } from '../../constants/theme';

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
  const [allPins, setAllPins] = useState<MapPin[]>([]);
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
      `).eq('user_id', userId).order('created_at', { ascending: false }),
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
    setAllPins(pins);
  }, [userId]);

  useFocusEffect(useCallback(() => { refetch(); loadCounts(); }, [userId]));
  useEffect(() => { if (userId) loadCounts(); }, [userId]);

  const beenPins = allPins.filter((p) => p.status === 'visited');
  const wantPins = allPins.filter((p) => p.status === 'want_to_go');

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

          {/* Avatar + name section */}
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

          {/* Stats row */}
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
              <Text style={styles.statNumber}>{allPins.length}</Text>
              <Text style={styles.statLabel}>Pins</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
              <Text style={styles.actionBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.7}>
              <Text style={styles.actionBtnText}>Share Profile</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Been / Want to Go rows */}
          <TouchableOpacity style={styles.sectionRow} activeOpacity={0.7}>
            <View style={styles.sectionRowLeft}>
              <Text style={styles.sectionRowIcon}>✓</Text>
              <Text style={styles.sectionRowLabel}>Been</Text>
            </View>
            <View style={styles.sectionRowRight}>
              <Text style={styles.sectionRowCount}>{beenPins.length}</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.rowDivider} />
          <TouchableOpacity style={styles.sectionRow} activeOpacity={0.7}>
            <View style={styles.sectionRowLeft}>
              <Text style={styles.sectionRowIcon}>♡</Text>
              <Text style={styles.sectionRowLabel}>Want to Go</Text>
            </View>
            <View style={styles.sectionRowRight}>
              <Text style={styles.sectionRowCount}>{wantPins.length}</Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Boards */}
          <View style={styles.boardsHeader}>
            <Text style={styles.boardsTitle}>Boards</Text>
            <TouchableOpacity
              style={styles.newBoardBtn}
              onPress={() => router.push('/board-modal/create')}
            >
              <Text style={styles.newBoardBtnText}>+ New</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
          ) : boards.length === 0 ? (
            <View style={styles.emptyBoards}>
              <Text style={styles.emptyBoardsText}>No boards yet.</Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => router.push('/board-modal/create')}
              >
                <Text style={styles.createBtnText}>Create your first board</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.boardGrid}>
              {boards.map((item: Board) => {
                const accent = boardAccentColor(item.name);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.boardCard}
                    onPress={() => router.push(`/(app)/board/${item.id}`)}
                    activeOpacity={0.82}
                  >
                    <View style={[styles.boardCover, { backgroundColor: accent + '16' }]}>
                      <Text style={[styles.boardCoverLetter, { color: accent }]}>
                        {item.name[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.boardCardBottom}>
                      <Text style={styles.boardCardName} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.boardCardMeta}>
                        <Text style={styles.boardCardCount}>{item.pin_count} pins</Text>
                        <View style={[styles.visBadge, { borderColor: VISIBILITY_COLOR[item.visibility] + '55' }]}>
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

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutBtn} onPress={() => supabase.auth.signOut()}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: {},

  profileSection: { alignItems: 'center', paddingTop: 28, paddingBottom: 20, paddingHorizontal: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  avatarFallback: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FEE2E4',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarInitials: { fontSize: 28, fontWeight: '800', color: COLORS.primary },
  displayName: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  username: { fontSize: 14, color: COLORS.textSecondary },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, paddingHorizontal: 40,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statNumber: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textSecondary },
  statDivider: { width: 1, height: 28, backgroundColor: '#F0F0F0' },

  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingBottom: 20 },
  actionBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 50,
    paddingVertical: 10, alignItems: 'center',
  },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },

  divider: { height: 1, backgroundColor: '#F0F0F0' },
  rowDivider: { height: 1, backgroundColor: '#F5F5F5', marginLeft: 20 },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  sectionRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionRowIcon: { fontSize: 16, color: COLORS.primary, width: 24, textAlign: 'center' },
  sectionRowLabel: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  sectionRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionRowCount: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary },
  chevron: { fontSize: 20, color: '#CCCCCC' },

  boardsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
  },
  boardsTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  newBoardBtn: {
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 50,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  newBoardBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

  boardGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, gap: 12 },
  boardCard: {
    width: BOARD_CARD_SIZE, height: BOARD_CARD_SIZE + 52,
    borderRadius: 12, overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  boardCover: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  boardCoverLetter: { fontSize: 52, fontWeight: '900', opacity: 0.65 },
  boardCardBottom: {
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#FAFAFA', borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 4,
  },
  boardCardName: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  boardCardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boardCardCount: { fontSize: 11, color: COLORS.textSecondary },
  visBadge: { borderWidth: 1, borderRadius: 50, paddingHorizontal: 7, paddingVertical: 2 },
  visBadgeText: { fontSize: 10, fontWeight: '600' },

  emptyBoards: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 40, gap: 12 },
  emptyBoardsText: { fontSize: 15, color: COLORS.textSecondary },
  createBtn: {
    backgroundColor: COLORS.primary, borderRadius: 50,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  signOutBtn: { alignItems: 'center', paddingVertical: 20, marginTop: 8 },
  signOutText: { fontSize: 14, color: COLORS.textSecondary },
});
