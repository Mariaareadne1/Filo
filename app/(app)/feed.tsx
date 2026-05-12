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
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { enrichWithMyRanks } from '../../hooks/usePins';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  TAB_CLEARANCE,
} from '../../constants/theme';

/**
 * FEED — single-column, full-width cards with varied height and visual
 * weight based on content richness. Four variants chosen per pin:
 *
 *   A "photo"      — pin.photo_url set; photo headlines, place name
 *                    overlaid in italic white on an ink scrim.
 *   D "rank"       — no photo but pin has a viewer rank; the rank
 *                    number is the hero, optional impression below.
 *   B "impression" — no photo, no rank, but a substantive impression
 *                    (> 40 chars); pull-quote treatment with a soft
 *                    open-quote watermark.
 *   C "minimal"    — everything else; place name + meta + status pill,
 *                    tight padding. If a (short) impression exists it
 *                    renders as a single line for added context.
 *
 * Red is reserved: the only ACCENT.red elements on any card are the
 * rank chip (A, B, C bottom strip), the rank-card accent bar (D), and
 * the page header italic accent. Place names in non-photo variants are
 * always PALETTE.ink — never red.
 *
 * Feed pins come from the get_friends_feed RPC, which doesn't carry
 * the viewer's rank inline. We decorate the result with the shared
 * enrichWithMyRanks helper so the rank-chip / rank-card path lights up
 * the same way it does for the map's "my" mode.
 */

const CARD_HORIZONTAL_PAD = 16;
const IMPRESSION_HERO_THRESHOLD = 40;

const CATEGORY_LABEL_RANK: Record<string, string> = {
  food: 'food',
  bar: 'bars',
  beauty: 'beauty',
  experience: 'experiences',
  retail: 'shops',
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

/** Tolerant of both stored values ('visited' | 'want_to_go') and the
 *  UI vocabulary ('been' | 'going_again' | 'want'). The DB collapses
 *  'been' and 'going_again' into 'visited', so the 'went back to' case
 *  doesn't actually fire today — kept for forward-compat. */
function verbFor(status: string): string {
  switch (status) {
    case 'visited':
    case 'been':
      return 'visited';
    case 'going_again':
      return 'went back to';
    case 'want_to_go':
    case 'want':
      return 'saved';
    default:
      return 'pinned';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'visited':
    case 'been':
      return 'been';
    case 'going_again':
      return 'going again';
    case 'want_to_go':
    case 'want':
      return 'want to go';
    default:
      return status;
  }
}

type CardKind = 'photo' | 'rank' | 'impression' | 'minimal';

function pickCardKind(pin: MapPin): CardKind {
  if (pin.photo_url) return 'photo';
  const hasRank =
    typeof pin.myRank === 'number' && typeof pin.myCategoryTotal === 'number';
  if (hasRank) return 'rank';
  if ((pin.impression?.length ?? 0) > IMPRESSION_HERO_THRESHOLD) return 'impression';
  return 'minimal';
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

  const loadFeed = useCallback(
    async (uid: string | null = userId) => {
      if (!uid) return;
      const { data, error } = await supabase.rpc('get_friends_feed', { p_user_id: uid });
      if (!error && data) {
        // Decorate with the viewer's myRank / myCategoryTotal so the
        // rank-chip / rank-card paths can light up. Same helper the
        // map's 'my' mode uses.
        const enriched = await enrichWithMyRanks(data as MapPin[], uid);
        setPins(enriched);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [userId],
  );

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

  const renderItem = ({ item }: { item: MapPin }) => {
    const kind = pickCardKind(item);
    const onPressCard = () => setSelectedPin(item);
    const onPressUser = () => router.push(`/(app)/user/${item.user_id}` as never);

    switch (kind) {
      case 'photo':
        return <PhotoCard pin={item} onPressCard={onPressCard} onPressUser={onPressUser} />;
      case 'rank':
        return <RankCard pin={item} onPressCard={onPressCard} onPressUser={onPressUser} />;
      case 'impression':
        return <ImpressionCard pin={item} onPressCard={onPressCard} onPressUser={onPressUser} />;
      case 'minimal':
      default:
        return <MinimalCard pin={item} onPressCard={onPressCard} onPressUser={onPressUser} />;
    }
  };

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header — unchanged */}
        <View style={styles.header}>
          <Text style={styles.metaLabel}>YOUR FEED</Text>
          <Text style={styles.title}>
            what's <Text style={styles.titleItalic}>new.</Text>
          </Text>
        </View>

        {/* Search bar — unchanged */}
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
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
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
            keyExtractor={(p) => p.pin_id}
            renderItem={renderItem}
            contentContainerStyle={
              filteredPins.length === 0 ? styles.emptyContainer : styles.list
            }
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={ACCENT.red}
              />
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

// ─── Shared sub-components ──────────────────────────────────────────

interface CardProps {
  pin: MapPin;
  onPressCard: () => void;
  onPressUser: () => void;
}

function CategoryPill({ pin }: { pin: MapPin }) {
  return (
    <View style={styles.categoryPill}>
      <Text style={styles.categoryPillText}>
        {CATEGORY_LABEL_RANK[pin.category] ?? pin.category}
      </Text>
    </View>
  );
}

function StatusPill({ pin }: { pin: MapPin }) {
  return (
    <View style={styles.statusPill}>
      <Text style={styles.statusPillText}>{statusLabel(pin.status)}</Text>
    </View>
  );
}

function RankChip({ pin }: { pin: MapPin }) {
  if (typeof pin.myRank !== 'number' || typeof pin.myCategoryTotal !== 'number') {
    return null;
  }
  return (
    <View style={styles.rankChip}>
      <Text style={styles.rankChipText}>
        #{pin.myRank} / {pin.myCategoryTotal}{' '}
        {CATEGORY_LABEL_RANK[pin.category] ?? pin.category}
      </Text>
    </View>
  );
}

function MetaRow({
  pin,
  includeVerb = true,
}: {
  pin: MapPin;
  includeVerb?: boolean;
}) {
  const parts = [`@${pin.username}`];
  if (includeVerb) parts.push(verbFor(pin.status));
  parts.push(timeAgo(pin.created_at));
  return <Text style={styles.meta}>{parts.join(' · ')}</Text>;
}

// ─── TYPE A — photo card ────────────────────────────────────────────

function PhotoCard({ pin, onPressCard, onPressUser }: CardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPressCard} activeOpacity={0.94}>
      <View style={styles.photoWrap}>
        <Image source={{ uri: pin.photo_url ?? undefined }} style={styles.photo} />
        <View style={styles.photoScrim} pointerEvents="none" />
        <Text style={styles.photoName} numberOfLines={2}>
          {pin.place_name}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <TouchableOpacity onPress={onPressUser} hitSlop={4}>
          <MetaRow pin={pin} />
        </TouchableOpacity>
        {pin.impression ? (
          <Text style={styles.impression} numberOfLines={2}>
            "{pin.impression}"
          </Text>
        ) : null}
        <View style={styles.bottomStrip}>
          <CategoryPill pin={pin} />
          <RankChip pin={pin} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── TYPE D — rank card ─────────────────────────────────────────────

function RankCard({ pin, onPressCard, onPressUser }: CardProps) {
  const catLabel = CATEGORY_LABEL_RANK[pin.category] ?? pin.category;
  return (
    <TouchableOpacity style={styles.card} onPress={onPressCard} activeOpacity={0.94}>
      <View style={styles.rankAccentBar} />
      <View style={styles.rankCardBody}>
        <Text style={styles.placeName} numberOfLines={2}>
          {pin.place_name}
        </Text>
        <View style={styles.bigRankRow}>
          <Text style={styles.bigRankNum}>#{pin.myRank}</Text>
          <Text style={styles.bigRankSub}>
            / {pin.myCategoryTotal} {catLabel}
          </Text>
        </View>
        {pin.impression ? (
          <Text style={styles.impression} numberOfLines={2}>
            "{pin.impression}"
          </Text>
        ) : null}
        <TouchableOpacity onPress={onPressUser} hitSlop={4}>
          <MetaRow pin={pin} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── TYPE B — impression card ───────────────────────────────────────

function ImpressionCard({ pin, onPressCard, onPressUser }: CardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPressCard} activeOpacity={0.94}>
      <View style={styles.cardBody}>
        {/* Soft watermark — sits behind the flow content via source order */}
        <Text style={styles.impressionWatermark} pointerEvents="none">
          {'“'}
        </Text>

        <Text style={styles.placeName} numberOfLines={2}>
          {pin.place_name}
        </Text>
        <Text style={styles.impressionHero} numberOfLines={4}>
          {pin.impression}
        </Text>
        <TouchableOpacity onPress={onPressUser} hitSlop={4}>
          <MetaRow pin={pin} includeVerb={false} />
        </TouchableOpacity>
        <View style={styles.bottomStrip}>
          <CategoryPill pin={pin} />
          <RankChip pin={pin} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── TYPE C — minimal card ──────────────────────────────────────────

function MinimalCard({ pin, onPressCard, onPressUser }: CardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPressCard} activeOpacity={0.94}>
      <View style={styles.cardBody}>
        <Text style={styles.placeName} numberOfLines={1}>
          {pin.place_name}
        </Text>
        <TouchableOpacity onPress={onPressUser} hitSlop={4}>
          <MetaRow pin={pin} />
        </TouchableOpacity>
        {pin.impression ? (
          <Text style={styles.impression} numberOfLines={1}>
            "{pin.impression}"
          </Text>
        ) : null}
        <View style={styles.bottomStrip}>
          <CategoryPill pin={pin} />
          <StatusPill pin={pin} />
          <RankChip pin={pin} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },

  // Header
  header: {
    paddingHorizontal: CARD_HORIZONTAL_PAD,
    paddingTop: 8,
    paddingBottom: 12,
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginBottom: 6,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 32,
    lineHeight: 34,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  titleItalic: { fontStyle: 'italic', color: ACCENT.red },

  // Search
  searchWrap: { paddingHorizontal: CARD_HORIZONTAL_PAD, paddingBottom: 14 },
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
  searchIcon: { fontSize: 14, color: PALETTE.inkSoft },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.ink,
    padding: 0,
  },
  searchClear: { fontSize: 18, color: PALETTE.inkSoft, lineHeight: 18 },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    paddingHorizontal: CARD_HORIZONTAL_PAD,
    paddingTop: 4,
    paddingBottom: TAB_CLEARANCE,
  },
  emptyContainer: { flex: 1 },

  // ─── Card shell (all variants) ────────────────────────────────────
  card: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1.5,
    borderColor: PALETTE.ink,
    marginBottom: 14,
    overflow: 'hidden',
    ...STICKER_SHADOW_LG,
  },
  cardBody: {
    padding: 14,
    position: 'relative',
  },

  // ─── Photo card ───────────────────────────────────────────────────
  photoWrap: { height: 180, position: 'relative' },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  photoName: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    fontSize: 20,
    lineHeight: 24,
    color: '#ffffff',
    fontWeight: '400',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ─── Shared text ──────────────────────────────────────────────────
  placeName: {
    fontFamily: FONTS.display,
    fontSize: 20,
    lineHeight: 24,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  meta: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: PALETTE.inkMute,
    textTransform: 'lowercase',
    marginTop: 6,
  },
  impression: {
    fontFamily: FONTS.body,
    fontSize: 14,
    lineHeight: 19,
    color: PALETTE.ink,
    marginTop: 8,
  },

  // ─── Impression card (Type B) ─────────────────────────────────────
  impressionWatermark: {
    position: 'absolute',
    top: 4,
    right: 12,
    fontFamily: FONTS.display,
    fontSize: 72,
    lineHeight: 72,
    fontStyle: 'italic',
    color: PALETTE.zone1,
    fontWeight: '400',
    includeFontPadding: false,
  },
  impressionHero: {
    fontFamily: FONTS.body,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
    color: PALETTE.ink,
    marginTop: 8,
  },

  // ─── Rank card (Type D) ───────────────────────────────────────────
  rankAccentBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    backgroundColor: ACCENT.red,
  },
  rankCardBody: {
    padding: 14,
    paddingLeft: 18,
  },
  bigRankRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
  },
  bigRankNum: {
    fontFamily: FONTS.display,
    fontSize: 36,
    lineHeight: 38,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  bigRankSub: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    letterSpacing: 0.5,
    color: PALETTE.inkMute,
    marginLeft: 6,
    textTransform: 'lowercase',
  },

  // ─── Bottom strip (A, B, C) ───────────────────────────────────────
  bottomStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 6,
  },
  categoryPill: {
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryPillText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.ink,
    textTransform: 'lowercase',
  },
  statusPill: {
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: PALETTE.ink,
    textTransform: 'lowercase',
  },
  rankChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: ACCENT.red,
    backgroundColor: PALETTE.surface,
  },
  rankChipText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: ACCENT.red,
    fontWeight: '700',
    textTransform: 'lowercase',
  },

  // ─── Empty state ──────────────────────────────────────────────────
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
