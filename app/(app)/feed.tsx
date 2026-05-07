import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { MapPin, CATEGORY_LABELS, Category } from '../../types';
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
} from '../../constants/theme';

const CATEGORY_GLYPH: Record<string, string> = {
  food: '◆',
  bar: '○',
  beauty: '◇',
  experience: '✦',
  retail: '◉',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RatingDots({ count = 4 }: { count?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 6, height: 6,
            backgroundColor: i < count ? ACCENT.red : PALETTE.inkLine,
          }}
        />
      ))}
    </View>
  );
}

export default function FeedScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const loadFeed = useCallback(async (uid: string | null = userId) => {
    if (!uid) return;
    const { data, error } = await supabase.rpc('get_friends_feed', { p_user_id: uid });
    if (!error && data) setPins(data as MapPin[]);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => { if (userId) loadFeed(userId); }, [userId]);
  useFocusEffect(useCallback(() => { if (userId) loadFeed(userId); }, [userId]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFeed();
  }, [loadFeed]);

  const filteredPins = searchQuery.trim()
    ? pins.filter(
        (p) =>
          p.place_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.username.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : pins;

  const renderItem = ({ item }: { item: MapPin; index: number }) => {
    const label = CATEGORY_LABELS[item.category as Category] ?? item.category;
    const glyph = CATEGORY_GLYPH[item.category] ?? '◉';
    const initials = item.display_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setSelectedPin(item)}
        activeOpacity={0.92}
      >
        {/* Top row: avatar + text + time */}
        <View style={styles.cardHeader}>
          <TouchableOpacity
            onPress={() => router.push(`/(app)/user/${item.user_id}`)}
            activeOpacity={0.7}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.cardHeaderText}>
            <Text style={styles.cardKicker}>
              @{item.username} · {timeAgo(item.created_at)}
            </Text>
            <Text style={styles.cardTitle} numberOfLines={2}>
              <Text style={styles.cardUserName}>{item.display_name.split(' ')[0]}</Text>
              <Text style={styles.cardAction}> pinned </Text>
              <Text style={styles.cardPlaceItalic}>{item.place_name}</Text>
            </Text>
            {item.address ? (
              <Text style={styles.cardAddress} numberOfLines={1}>
                {item.address.split(',')[0]}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Photo strip */}
        {item.photo_url ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoStrip}
            contentContainerStyle={styles.photoStripContent}
          >
            <Image source={{ uri: item.photo_url }} style={styles.photo} />
          </ScrollView>
        ) : null}

        {/* Bottom: rating + impression + category */}
        <View style={styles.cardBottom}>
          <View style={styles.cardBottomLeft}>
            {item.status === 'visited' && (
              <View style={styles.ratingRow}>
                <RatingDots count={4} />
              </View>
            )}
            {item.impression ? (
              <Text style={styles.impression} numberOfLines={2}>"{item.impression}"</Text>
            ) : null}
          </View>
          <View style={styles.catPill}>
            <Text style={styles.catPillGlyph}>{glyph}</Text>
            <Text style={styles.catPillText}>{label.toLowerCase()}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.metaLabel}>YOUR FEED</Text>
            <Text style={styles.wordmark}>
              filo<Text style={styles.wordmarkDot}>.</Text>
            </Text>
          </View>
          <TouchableOpacity style={styles.bellBtn} activeOpacity={0.7}>
            <Text style={styles.bellIcon}>◌</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="search a place, person…"
              placeholderTextColor={PALETTE.inkMute}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7} hitSlop={8}>
                <Text style={styles.searchClear}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={ACCENT.red} size="large" />
          </View>
        ) : (
          <FlatList
            data={filteredPins}
            keyExtractor={(item) => item.pin_id}
            renderItem={renderItem}
            contentContainerStyle={filteredPins.length === 0 ? styles.emptyContainer : styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT.red} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {searchQuery ? (
                    <>no <Text style={styles.emptyTitleItalic}>results.</Text></>
                  ) : (
                    <>your feed is <Text style={styles.emptyTitleItalic}>empty.</Text></>
                  )}
                </Text>
                <Text style={styles.emptySub}>
                  {searchQuery
                    ? 'try a different search.'
                    : 'follow people to see their pins.'}
                </Text>
                {!searchQuery && (
                  <TouchableOpacity
                    style={styles.findBtn}
                    onPress={() => router.push('/(app)/directory')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.findBtnText}>find friends →</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </SafeAreaView>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 12,
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginBottom: 4,
  },
  wordmark: {
    fontFamily: FONTS.display,
    fontSize: 38,
    color: PALETTE.ink,
    fontWeight: '400',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  wordmarkDot: {
    color: ACCENT.red,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...STICKER_SHADOW,
  },
  bellIcon: { fontSize: 16, color: PALETTE.ink },

  searchWrap: { paddingHorizontal: SCREEN_PAD, paddingBottom: 14 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    ...STICKER_SHADOW,
  },
  searchIcon: {
    fontSize: 14,
    color: PALETTE.inkSoft,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.ink,
    padding: 0,
  },
  searchClear: {
    fontSize: 18,
    color: PALETTE.inkSoft,
    lineHeight: 18,
  },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 4,
    paddingBottom: TAB_CLEARANCE + 16,
    gap: 12,
  },
  emptyContainer: { flex: 1 },

  card: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    padding: 14,
    ...STICKER_SHADOW_LG,
  },

  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.ink,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.zone1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: FONTS.display,
    fontSize: 14,
    fontWeight: '400',
    color: ACCENT.red,
  },

  cardHeaderText: { flex: 1, gap: 3 },
  cardKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
  cardTitle: {
    fontFamily: FONTS.display,
    fontSize: 17,
    lineHeight: 21,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  cardUserName: { fontWeight: '400', color: PALETTE.ink },
  cardAction: { color: PALETTE.inkSoft, fontFamily: FONTS.body, fontSize: 14 },
  cardPlaceItalic: { fontStyle: 'italic', color: ACCENT.red },
  cardAddress: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },

  photoStrip: { marginTop: 12, marginLeft: -14, marginRight: -14 },
  photoStripContent: { paddingHorizontal: 14, gap: 8 },
  photo: {
    width: 220,
    height: 150,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    resizeMode: 'cover',
  },

  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  cardBottomLeft: { flex: 1, gap: 6 },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  impression: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    ...STICKER_SHADOW,
  },
  catPillGlyph: {
    fontSize: 10,
    color: ACCENT.red,
  },
  catPillText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: PALETTE.ink,
    fontWeight: '600',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 24,
    color: PALETTE.ink,
    fontWeight: '400',
    textAlign: 'center',
  },
  emptyTitleItalic: { fontStyle: 'italic', color: ACCENT.red },
  emptySub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
    lineHeight: 19,
  },
  findBtn: {
    marginTop: 14,
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 22,
    paddingVertical: 11,
    ...STICKER_SHADOW_LG,
  },
  findBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
