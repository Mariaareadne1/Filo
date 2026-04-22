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
    if (!error && data) {
      setPins(data as MapPin[]);
    }
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
    const initials = item.display_name
      .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => setSelectedPin(item)}
        activeOpacity={0.75}
      >
        {/* User row */}
        <View style={styles.userRow}>
          <TouchableOpacity onPress={() => router.push(`/(app)/user/${item.user_id}`)}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => router.push(`/(app)/user/${item.user_id}`)}
          >
            <Text style={styles.username}>@{item.username}</Text>
            <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
          </TouchableOpacity>
          <View style={[styles.categoryBadge, { backgroundColor: color + '18', borderColor: color }]}>
            <View style={[styles.categoryDot, { backgroundColor: color }]} />
            <Text style={[styles.categoryLabel, { color }]}>{label}</Text>
          </View>
        </View>

        {/* Pin content */}
        <View style={styles.pinContent}>
          <Text style={styles.placeName}>{item.place_name}</Text>
          {item.impression ? (
            <Text style={styles.impression} numberOfLines={2}>"{item.impression}"</Text>
          ) : null}
          <View style={[styles.statusPill, item.status === 'visited' ? styles.visited : styles.wantToGo]}>
            <Text style={styles.statusText}>
              {item.status === 'visited' ? '✓ Visited' : '♡ Want to go'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.navHeader}>
          <Text style={styles.navTitle}>Friends</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#E63946" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navHeader}>
        <Text style={styles.navTitle}>Friends</Text>
      </View>

      <FlatList
        data={pins}
        keyExtractor={(item) => item.pin_id}
        renderItem={renderItem}
        contentContainerStyle={pins.length === 0 ? styles.emptyContainer : styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E63946" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👀</Text>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>
              Follow people to see their pins here.{'\n'}Find friends in the Columbia directory.
            </Text>
            <TouchableOpacity
              style={styles.directoryBtn}
              onPress={() => router.push('/(app)/directory')}
            >
              <Text style={styles.directoryBtnText}>Browse Directory</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  navHeader: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  navTitle: { fontSize: 22, fontWeight: '800', color: '#111' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { paddingVertical: 8 },
  emptyContainer: { flex: 1 },
  separator: { height: 1, backgroundColor: '#f5f5f5' },

  item: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 14, fontWeight: '700', color: '#666' },
  username: { fontSize: 14, fontWeight: '700', color: '#111' },
  timestamp: { fontSize: 11, color: '#aaa', marginTop: 1 },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3, gap: 4,
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryLabel: { fontSize: 11, fontWeight: '600' },

  pinContent: { paddingLeft: 52, gap: 6 },
  placeName: { fontSize: 17, fontWeight: '800', color: '#111' },
  impression: { fontSize: 13, color: '#555', fontStyle: 'italic', lineHeight: 18 },
  statusPill: {
    alignSelf: 'flex-start', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 2,
  },
  visited: { backgroundColor: '#d1fae5' },
  wantToGo: { backgroundColor: '#fef3c7' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#333' },

  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 10, paddingTop: 80,
  },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  directoryBtn: {
    marginTop: 8, backgroundColor: '#E63946',
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14,
  },
  directoryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
