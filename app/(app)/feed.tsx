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

/** Paper-tinted block backgrounds for cards without a photo. The hues
 *  are pulled from the palette's "zone" + park/water tokens so each
 *  category reads slightly different without breaking the brand
 *  restraint. */
const CATEGORY_TINT: Record<string, string> = {
  food:       PALETTE.zone1,
  bar:        PALETTE.water,
  beauty:     PALETTE.zone3,
  experience: PALETTE.park,
  retail:     PALETTE.zone2,
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

// ─── Row layout ────────────────────────────────────────────────────────

/** Photo cards always occupy a full-width row. No-photo cards pair into
 *  side-by-side rows; an unpaired trailing no-photo card spreads to a
 *  full-width "single-block" row so it doesn't look orphaned. */
type FeedRow =
  | { kind: 'photo';        key: string; pin: MapPin }
  | { kind: 'single-block'; key: string; pin: MapPin }
  | { kind: 'pair';         key: string; left: MapPin; right: MapPin };

function buildRows(pins: MapPin[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let buffer: MapPin | null = null;

  for (const pin of pins) {
    if (pin.photo_url) {
      rows.push({ kind: 'photo', key: pin.pin_id, pin });
    } else {
      if (buffer === null) {
        buffer = pin;
      } else {
        rows.push({
          kind: 'pair',
          key: `${buffer.pin_id}+${pin.pin_id}`,
          left: buffer,
          right: pin,
        });
        buffer = null;
      }
    }
  }
  if (buffer) {
    rows.push({ kind: 'single-block', key: buffer.pin_id, pin: buffer });
  }
  return rows;
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

  const rows = useMemo(() => buildRows(filteredPins), [filteredPins]);

  const renderRow = ({ item }: { item: FeedRow }) => {
    if (item.kind === 'photo') {
      return (
        <PhotoCard
          pin={item.pin}
          onPressCard={() => setSelectedPin(item.pin)}
          onPressUser={() => router.push(`/(app)/user/${item.pin.user_id}` as never)}
        />
      );
    }
    if (item.kind === 'single-block') {
      return (
        <BlockCard
          pin={item.pin}
          variant="full"
          onPressCard={() => setSelectedPin(item.pin)}
          onPressUser={() => router.push(`/(app)/user/${item.pin.user_id}` as never)}
        />
      );
    }
    return (
      <View style={styles.pairRow}>
        <BlockCard
          pin={item.left}
          variant="half"
          onPressCard={() => setSelectedPin(item.left)}
          onPressUser={() => router.push(`/(app)/user/${item.left.user_id}` as never)}
        />
        <BlockCard
          pin={item.right}
          variant="half"
          onPressCard={() => setSelectedPin(item.right)}
          onPressUser={() => router.push(`/(app)/user/${item.right.user_id}` as never)}
        />
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
            data={rows}
            keyExtractor={(r) => r.key}
            renderItem={renderRow}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            contentContainerStyle={
              rows.length === 0 ? styles.emptyContainer : styles.list
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

// ─── Cards ─────────────────────────────────────────────────────────────

function CardHeader({
  pin,
  onPressUser,
  compact = false,
}: {
  pin: MapPin;
  onPressUser: () => void;
  compact?: boolean;
}) {
  const initials = pin.display_name
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <TouchableOpacity onPress={onPressUser} activeOpacity={0.7} style={styles.cardHeader}>
      {pin.avatar_url ? (
        <Image
          source={{ uri: pin.avatar_url }}
          style={compact ? styles.avatarSmall : styles.avatar}
        />
      ) : (
        <View style={[
          compact ? styles.avatarFallbackSmall : styles.avatarFallback,
        ]}>
          <Text style={compact ? styles.avatarInitialsSmall : styles.avatarInitials}>
            {initials}
          </Text>
        </View>
      )}
      <Text style={styles.headerText} numberOfLines={1}>
        <Text style={styles.headerUsername}>@{pin.username}</Text>
        <Text style={styles.headerAction}> pinned</Text>
      </Text>
    </TouchableOpacity>
  );
}

function CardFooter({ pin, compact = false }: { pin: MapPin; compact?: boolean }) {
  const label = CATEGORY_LABELS[pin.category as Category] ?? pin.category;
  const glyph = CATEGORY_GLYPH[pin.category] ?? '◉';
  return (
    <View style={styles.cardFooter}>
      <View style={styles.catPill}>
        <Text style={styles.catPillGlyph}>{glyph}</Text>
        {!compact && (
          <Text style={styles.catPillText}>{label.toLowerCase()}</Text>
        )}
      </View>
      <Text style={styles.timeText}>{timeAgo(pin.created_at)}</Text>
    </View>
  );
}

/** Full-width card with the photo at the top and the place name overlaid
 *  in white italic Fraunces. */
function PhotoCard({
  pin,
  onPressCard,
  onPressUser,
}: {
  pin: MapPin;
  onPressCard: () => void;
  onPressUser: () => void;
}) {
  return (
    <TouchableOpacity style={styles.cardFull} onPress={onPressCard} activeOpacity={0.94}>
      <View style={styles.cardHeaderWrap}>
        <CardHeader pin={pin} onPressUser={onPressUser} />
      </View>

      <View style={styles.photoWrap}>
        <Image source={{ uri: pin.photo_url ?? undefined }} style={styles.photo} />
        <View style={styles.photoTint} pointerEvents="none" />
        <Text style={styles.photoName} numberOfLines={2}>
          {pin.place_name}
        </Text>
      </View>

      <View style={styles.cardBody}>
        {pin.impression ? (
          <Text style={styles.impression} numberOfLines={2}>"{pin.impression}"</Text>
        ) : null}
        <CardFooter pin={pin} />
      </View>
    </TouchableOpacity>
  );
}

/** No-photo card — colored category block, glyph centered, place name +
 *  impression below. `variant: 'full'` is full-width (used for trailing
 *  unpaired no-photo pins); `variant: 'half'` is the side-by-side pair
 *  rendering. */
function BlockCard({
  pin,
  variant,
  onPressCard,
  onPressUser,
}: {
  pin: MapPin;
  variant: 'full' | 'half';
  onPressCard: () => void;
  onPressUser: () => void;
}) {
  const tint = CATEGORY_TINT[pin.category] ?? PALETTE.zone1;
  const glyph = CATEGORY_GLYPH[pin.category] ?? '◉';
  const isHalf = variant === 'half';

  return (
    <TouchableOpacity
      style={isHalf ? styles.cardHalf : styles.cardFull}
      onPress={onPressCard}
      activeOpacity={0.94}
    >
      <View style={styles.cardHeaderWrap}>
        <CardHeader pin={pin} onPressUser={onPressUser} compact={isHalf} />
      </View>

      <View
        style={[
          isHalf ? styles.blockHalf : styles.blockFull,
          { backgroundColor: tint },
        ]}
      >
        <Text style={[styles.blockGlyph, isHalf && styles.blockGlyphHalf]}>
          {glyph}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <Text
          style={[styles.placeName, isHalf && styles.placeNameHalf]}
          numberOfLines={isHalf ? 2 : 1}
        >
          {pin.place_name}
        </Text>
        {pin.impression ? (
          <Text style={styles.impression} numberOfLines={isHalf ? 1 : 2}>
            "{pin.impression}"
          </Text>
        ) : null}
        <CardFooter pin={pin} compact={isHalf} />
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

  // Row container for the 2-up no-photo pair.
  pairRow: { flexDirection: 'row', gap: 12 },

  // Card chrome
  cardFull: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    overflow: 'hidden',
    ...STICKER_SHADOW_LG,
  },
  cardHalf: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    overflow: 'hidden',
    ...STICKER_SHADOW_LG,
  },
  cardHeaderWrap: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  cardBody: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 6 },

  // Header
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.ink,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.zone1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: FONTS.display,
    fontSize: 13,
    fontWeight: '400',
    color: ACCENT.red,
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.ink,
  },
  avatarFallbackSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.zone1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitialsSmall: {
    fontFamily: FONTS.display,
    fontSize: 11,
    fontWeight: '400',
    color: ACCENT.red,
  },
  headerText: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 13,
  },
  headerUsername: {
    fontWeight: '700',
    color: PALETTE.ink,
  },
  headerAction: {
    color: PALETTE.inkSoft,
  },

  // Photo card
  photoWrap: {
    height: 160,
    backgroundColor: PALETTE.zone2,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoTint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  photoName: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    fontSize: 24,
    lineHeight: 28,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // No-photo color block
  blockFull: {
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: PALETTE.inkLine,
  },
  blockHalf: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: PALETTE.inkLine,
  },
  blockGlyph: {
    fontSize: 56,
    color: PALETTE.inkSoft,
    includeFontPadding: false,
  },
  blockGlyphHalf: {
    fontSize: 40,
  },

  // Place name (no-photo cards)
  placeName: {
    fontFamily: FONTS.display,
    fontSize: 18,
    lineHeight: 22,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  placeNameHalf: {
    fontSize: 15,
    lineHeight: 19,
  },

  impression: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    fontStyle: 'italic',
    lineHeight: 17,
  },

  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 6,
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
  timeText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
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
