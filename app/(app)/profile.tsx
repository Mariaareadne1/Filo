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

const { width } = Dimensions.get('window');
const BOARD_CARD_SIZE = (width - SCREEN_PAD * 2 - 12) / 2;

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  campus: string;
}

const BOARD_ACCENTS = [ACCENT.red, ACCENT.electric, '#f4c542', '#2ec27e', '#7d5fff', '#e6739f'];

function boardAccentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return BOARD_ACCENTS[Math.abs(hash) % BOARD_ACCENTS.length];
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
              <Text style={styles.statNumber}>{allPins.length}</Text>
              <Text style={styles.statLabel}>PINS</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>edit profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>share profile</Text>
            </TouchableOpacity>
          </View>

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
            <View style={styles.boardGrid}>
              {boards.map((item: Board) => {
                const accent = boardAccentColor(item.name);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.boardCard}
                    onPress={() => router.push(`/(app)/board/${item.id}`)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.boardCover, { backgroundColor: PALETTE.zone1 }]}>
                      <View style={[styles.boardCoverHalo, { backgroundColor: accent, opacity: 0.18 }]} />
                      <Text style={[styles.boardCoverLetter, { color: accent }]}>
                        {item.name[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.boardCardBottom}>
                      <Text style={styles.boardCardName} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.boardCardMeta}>
                        <Text style={styles.boardCardCount}>{item.pin_count} pins</Text>
                        <View style={[styles.visBadge, { borderColor: VISIBILITY_COLOR[item.visibility] }]}>
                          <Text style={[styles.visBadgeText, { color: VISIBILITY_COLOR[item.visibility] }]}>
                            {VISIBILITY_LABEL[item.visibility].toLowerCase()}
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
  scroll: { paddingBottom: TAB_CLEARANCE + 24 },

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
    flexWrap: 'wrap',
    paddingHorizontal: SCREEN_PAD,
    gap: 12,
  },
  boardCard: {
    width: BOARD_CARD_SIZE,
    height: BOARD_CARD_SIZE + 56,
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
