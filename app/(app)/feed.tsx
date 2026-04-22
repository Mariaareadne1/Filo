import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
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
import { COLORS, GLASS } from '../../constants/theme';

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️',
  bar: '🍸',
  beauty: '✂️',
  experience: '🎯',
  retail: '🛍️',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Stars({ count = 4 }: { count?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={{ fontSize: 13, color: i < count ? '#F59E0B' : 'rgba(26,26,26,0.18)' }}>
          ★
        </Text>
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
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const loadFeed = useCallback(async (uid: string | null = userId) => {
    if (!uid) return;
    const { data, error } = await supabase.rpc('get_friends_feed', { p_user_id: uid });
    if (!error && data) setPins(data as MapPin[]);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    if (userId) loadFeed(userId);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (userId) loadFeed(userId);
  }, [userId]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFeed();
  }, [loadFeed]);

  const renderItem = ({ item }: { item: MapPin }) => {
    const color = CATEGORY_COLORS[item.category as Category] ?? '#888';
    const label = CATEGORY_LABELS[item.category as Category] ?? item.category;
    const emoji = CATEGORY_EMOJI[item.category] ?? '📍';
    const initials = item.display_name
      .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

    return (
      <TouchableOpacity
        style={[styles.card, GLASS]}
        onPress={() => setSelectedPin(item)}
        activeOpacity={0.85}
      >
        {/* User row */}
        <TouchableOpacity
          style={styles.userRow}
          onPress={() => router.push(`/(app)/user/${item.user_id}`)}
          activeOpacity={0.7}
        >
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: color + '33' }]}>
              <Text style={[styles.avatarInitials, { color }]}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.userLine} numberOfLines={1}>
              <Text style={styles.username}>@{item.username}</Text>
              <Text style={styles.wasAt}> was at</Text>
            </Text>
            <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
          </View>
          <View style={[styles.catPill, { backgroundColor: color + '22', borderColor: color + '66' }]}>
            <Text style={[styles.catPillText, { color }]}>{label}</Text>
          </View>
        </TouchableOpacity>

        {/* Place photo or gradient placeholder */}
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.placePhoto} />
        ) : (
          <View style={[styles.gradientPlaceholder, { backgroundColor: color + '22' }]}>
            <Text style={styles.placeholderEmoji}>{emoji}</Text>
            <Text style={[styles.placeholderCategory, { color }]}>{label}</Text>
          </View>
        )}

        {/* Content */}
        <View style={styles.bottomContent}>
          <Text style={styles.placeName} numberOfLines={2}>{item.place_name}</Text>
          {item.status === 'visited' && <Stars count={4} />}
          {item.impression ? (
            <Text style={styles.impression} numberOfLines={2}>"{item.impression}"</Text>
          ) : null}
          <View style={item.status === 'visited' ? styles.visitedPill : styles.wantPill}>
            <Text style={styles.statusText}>
              {item.status === 'visited' ? '✓  Been' : '♡  Want to go'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.safe}>
      {/* Background orbs */}
      <View style={styles.orbRed} pointerEvents="none" />
      <View style={styles.orbBlue} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feed</Text>
          {/* Red thread motif */}
          <View style={styles.redThread} pointerEvents="none" />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={pins}
            keyExtractor={(item) => item.pin_id}
            renderItem={renderItem}
            contentContainerStyle={pins.length === 0 ? styles.emptyContainer : styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.threadIllustration}>
                  <View style={[styles.threadRing, styles.threadRing1]} />
                  <View style={[styles.threadRing, styles.threadRing2]} />
                  <View style={styles.threadDot} />
                </View>
                <Text style={styles.emptyTitle}>Follow people to see{'\n'}their pins.</Text>
                <Text style={styles.emptySub}>Find Columbia students in the directory.</Text>
                <TouchableOpacity
                  style={styles.directoryBtn}
                  onPress={() => router.push('/(app)/directory')}
                >
                  <Text style={styles.directoryBtnText}>Browse Directory</Text>
                </TouchableOpacity>
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
  safe: { flex: 1, backgroundColor: COLORS.bg },
  orbRed: {
    position: 'absolute',
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(230,57,70,0.15)',
    top: -80, right: -80,
  },
  orbBlue: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(67,97,238,0.10)',
    bottom: 100, left: -80,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 14,
    position: 'relative',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  redThread: {
    position: 'absolute',
    right: 24,
    top: 12,
    width: 90,
    height: 36,
    borderTopWidth: 1.5,
    borderColor: 'rgba(230,57,70,0.5)',
    borderRadius: 40,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 16, paddingTop: 4 },
  emptyContainer: { flex: 1 },

  card: { overflow: 'hidden' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 13, fontWeight: '700' },
  userLine: { fontSize: 13 },
  username: { fontWeight: '700', color: COLORS.textPrimary },
  wasAt: { fontWeight: '400', color: COLORS.textSecondary },
  timestamp: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  catPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  catPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  placePhoto: { width: '100%', height: 180, resizeMode: 'cover' },
  gradientPlaceholder: {
    width: '100%', height: 130,
    alignItems: 'center', justifyContent: 'center',
    gap: 6,
  },
  placeholderEmoji: { fontSize: 44 },
  placeholderCategory: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, opacity: 0.8 },

  bottomContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 8,
  },
  placeName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  impression: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  visitedPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  wantPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },

  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, paddingTop: 80, gap: 14,
  },
  threadIllustration: {
    width: 80, height: 80,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  threadRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 100,
  },
  threadRing1: { width: 80, height: 80, opacity: 0.25 },
  threadRing2: { width: 52, height: 52, opacity: 0.45 },
  threadDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.primary, opacity: 0.85,
  },
  emptyTitle: {
    fontSize: 22, fontWeight: '800',
    color: COLORS.textPrimary, textAlign: 'center', lineHeight: 30,
  },
  emptySub: {
    fontSize: 14, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 20,
  },
  directoryBtn: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  directoryBtnText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 },
});
