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
import { MapPin, CATEGORY_COLORS, CATEGORY_LABELS, Category } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { COLORS } from '../../constants/theme';

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️', bar: '🍸', beauty: '✂️', experience: '🎯', retail: '🛍️',
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
            width: 7, height: 7, borderRadius: 4,
            backgroundColor: i < count ? COLORS.primary : '#E8E8E8',
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

  const renderItem = ({ item, index }: { item: MapPin; index: number }) => {
    const color = CATEGORY_COLORS[item.category as Category] ?? '#888';
    const label = CATEGORY_LABELS[item.category as Category] ?? item.category;
    const emoji = CATEGORY_EMOJI[item.category] ?? '📍';
    const initials = item.display_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
    const isLast = index === filteredPins.length - 1;

    return (
      <View>
        <TouchableOpacity
          style={styles.card}
          onPress={() => setSelectedPin(item)}
          activeOpacity={0.96}
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
                <View style={[styles.avatarFallback, { backgroundColor: color + '22' }]}>
                  <Text style={[styles.avatarInitials, { color }]}>{initials}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                <Text style={styles.cardUserName}>{item.display_name}</Text>
                <Text style={styles.cardAction}> pinned </Text>
                <Text style={styles.cardPlaceName}>{item.place_name}</Text>
              </Text>
              <View style={styles.cardMeta}>
                <Text style={styles.cardAddress} numberOfLines={1}>{item.address ? item.address.split(',')[0] : ''}</Text>
                <Text style={styles.cardDot}> · </Text>
                <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
              </View>
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
            <View style={[styles.catPill, { backgroundColor: color + '15' }]}>
              <Text style={[styles.catPillText, { color }]}>{emoji} {label}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {!isLast && <View style={styles.divider} />}
      </View>
    );
  };

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>filo</Text>
          <TouchableOpacity style={styles.bellBtn} activeOpacity={0.7}>
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>⊕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search a place, person..."
              placeholderTextColor="#BBBBBB"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={filteredPins}
            keyExtractor={(item) => item.pin_id}
            renderItem={renderItem}
            contentContainerStyle={filteredPins.length === 0 ? styles.emptyContainer : styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'No results.' : 'Your feed is empty.'}
                </Text>
                <Text style={styles.emptySub}>
                  {searchQuery ? 'Try a different search.' : 'Follow people to see their pins.'}
                </Text>
                {!searchQuery && (
                  <TouchableOpacity
                    style={styles.findBtn}
                    onPress={() => router.push('/(app)/directory')}
                  >
                    <Text style={styles.findBtnText}>Find Friends</Text>
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10,
  },
  wordmark: { fontSize: 26, fontWeight: '900', color: COLORS.primary, letterSpacing: -0.5 },
  bellBtn: { padding: 4 },
  bellIcon: { fontSize: 18 },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F5', borderRadius: 50,
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  searchIcon: { fontSize: 14, color: '#BBBBBB' },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },
  searchClear: { fontSize: 12, color: '#BBBBBB', paddingLeft: 4 },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 40 },
  emptyContainer: { flex: 1 },

  card: { paddingHorizontal: 20, paddingVertical: 16 },

  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 14, fontWeight: '700' },

  cardHeaderText: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 14, lineHeight: 20 },
  cardUserName: { fontWeight: '700', color: COLORS.textPrimary },
  cardAction: { fontWeight: '400', color: COLORS.textSecondary },
  cardPlaceName: { fontWeight: '700', color: COLORS.textPrimary },
  cardMeta: { flexDirection: 'row', alignItems: 'center' },
  cardAddress: { fontSize: 12, color: COLORS.textSecondary, flexShrink: 1 },
  cardDot: { fontSize: 12, color: '#CCCCCC' },
  cardTime: { fontSize: 12, color: COLORS.textSecondary },

  photoStrip: { marginTop: 12, marginLeft: -20, marginRight: -20 },
  photoStripContent: { paddingHorizontal: 20, gap: 8 },
  photo: { width: 200, height: 140, borderRadius: 10, resizeMode: 'cover' },

  cardBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, gap: 8,
  },
  cardBottomLeft: { flex: 1, gap: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  impression: { fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic', lineHeight: 18 },
  catPill: {
    borderRadius: 50, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  catPillText: { fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 20 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  findBtn: {
    marginTop: 12, backgroundColor: COLORS.primary,
    borderRadius: 50, paddingHorizontal: 28, paddingVertical: 13,
  },
  findBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
