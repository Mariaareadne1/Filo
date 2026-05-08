import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  TAB_CLEARANCE,
  SCREEN_PAD,
} from '../../constants/theme';

/**
 * FEED — Pinterest-style masonry. Pins flow into two columns by
 * alternating index (col 0 / col 1 / col 0 / …); columns stack
 * independently so photo cards (tall) sit naturally next to no-photo
 * cards (short), giving uneven masonry rhythm.
 *
 * Long impressions (>80 chars) escape the column flow and render as
 * full-width breakouts. The escape flushes any in-progress 2-up batch
 * first so the chronological order stays correct.
 */

const LONG_IMPRESSION_CHARS = 80;

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

// ─── Block layout ──────────────────────────────────────────────────────

type FeedBlock =
  | { kind: 'full';    key: string; pin: MapPin }
  | { kind: 'columns'; key: string; col0: MapPin[]; col1: MapPin[] };

function buildBlocks(pins: MapPin[]): FeedBlock[] {
  const blocks: FeedBlock[] = [];
  let col0: MapPin[] = [];
  let col1: MapPin[] = [];
  let altIdx = 0;

  const flushColumns = () => {
    if (col0.length || col1.length) {
      blocks.push({
        kind: 'columns',
        key: `cols-${blocks.length}`,
        col0,
        col1,
      });
      col0 = [];
      col1 = [];
      altIdx = 0;
    }
  };

  for (const pin of pins) {
    const isLong = (pin.impression?.length ?? 0) > LONG_IMPRESSION_CHARS;
    if (isLong) {
      flushColumns();
      blocks.push({ kind: 'full', key: pin.pin_id, pin });
    } else {
      if (altIdx % 2 === 0) col0.push(pin);
      else col1.push(pin);
      altIdx++;
    }
  }
  flushColumns();
  return blocks;
}

// ─── Screen ────────────────────────────────────────────────────────────

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

  const blocks = useMemo(() => buildBlocks(filteredPins), [filteredPins]);

  const renderBlock = ({ item }: { item: FeedBlock }) => {
    if (item.kind === 'full') {
      return (
        <FeedCard
          pin={item.pin}
          variant="full"
          onPressCard={() => setSelectedPin(item.pin)}
          onPressUser={() => router.push(`/(app)/user/${item.pin.user_id}` as never)}
        />
      );
    }
    return (
      <View style={styles.columnsRow}>
        <View style={styles.column}>
          {item.col0.map((p) => (
            <FeedCard
              key={p.pin_id}
              pin={p}
              variant="column"
              onPressCard={() => setSelectedPin(p)}
              onPressUser={() => router.push(`/(app)/user/${p.user_id}` as never)}
            />
          ))}
        </View>
        <View style={styles.column}>
          {item.col1.map((p) => (
            <FeedCard
              key={p.pin_id}
              pin={p}
              variant="column"
              onPressCard={() => setSelectedPin(p)}
              onPressUser={() => router.push(`/(app)/user/${p.user_id}` as never)}
            />
          ))}
        </View>
      </View>
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
            data={blocks}
            keyExtractor={(b) => b.key}
            renderItem={renderBlock}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            contentContainerStyle={
              blocks.length === 0 ? styles.emptyContainer : styles.list
            }
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

// ─── Card ──────────────────────────────────────────────────────────────

/** One card. `variant: 'column'` is half-width inside a 2-up row;
 *  `variant: 'full'` is full-width for long-impression breakouts. The
 *  layout is otherwise identical — photo (if any) on top, then mono
 *  "@username pinned" kicker, italic red Fraunces place name, and an
 *  optional body-italic impression. */
function FeedCard({
  pin,
  variant,
  onPressCard,
  onPressUser,
}: {
  pin: MapPin;
  variant: 'column' | 'full';
  onPressCard: () => void;
  onPressUser: () => void;
}) {
  const isFull = variant === 'full';
  return (
    <TouchableOpacity style={styles.card} onPress={onPressCard} activeOpacity={0.94}>
      {pin.photo_url ? (
        <Image source={{ uri: pin.photo_url }} style={styles.photo} />
      ) : null}
      <View style={styles.cardBody}>
        <TouchableOpacity onPress={onPressUser} hitSlop={6}>
          <Text style={styles.cardKicker} numberOfLines={1}>
            @{pin.username} pinned · {timeAgo(pin.created_at)}
          </Text>
        </TouchableOpacity>
        <Text
          style={[styles.cardPlace, isFull && styles.cardPlaceFull]}
          numberOfLines={isFull ? 2 : 2}
        >
          {pin.place_name}
        </Text>
        {pin.impression ? (
          <Text
            style={styles.cardImpression}
            numberOfLines={isFull ? 6 : 3}
          >
            "{pin.impression}"
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────

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
    paddingBottom: TAB_CLEARANCE,
  },
  emptyContainer: { flex: 1 },

  // Block containers
  columnsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
    gap: 12,
  },

  // Card chrome — used by both column and full variants.
  card: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    overflow: 'hidden',
    ...STICKER_SHADOW,
  },
  photo: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 4,
  },
  cardKicker: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
  cardPlace: {
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    fontSize: 18,
    lineHeight: 22,
    color: ACCENT.red,
    fontWeight: '400',
  },
  cardPlaceFull: {
    fontSize: 24,
    lineHeight: 28,
  },
  cardImpression: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    fontStyle: 'italic',
    lineHeight: 17,
    marginTop: 2,
  },

  // Empty state
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
    ...STICKER_SHADOW,
  },
  findBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
