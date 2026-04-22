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
import { COLORS, GLASS_SM } from '../../constants/theme';

interface DirectoryUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  pin_count: number;
}

export default function DirectoryScreen() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const loadDirectory = useCallback(async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, pins(count)')
      .eq('campus', 'columbia');

    if (!error && data) {
      const mapped: DirectoryUser[] = data.map((u: any) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        pin_count: u.pins?.[0]?.count ?? 0,
      }));
      mapped.sort((a, b) => b.pin_count - a.pin_count);
      setUsers(mapped);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadDirectory(); }, [loadDirectory]);
  useFocusEffect(useCallback(() => { loadDirectory(); }, [loadDirectory]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDirectory();
  }, [loadDirectory]);

  const renderItem = ({ item, index }: { item: DirectoryUser; index: number }) => {
    const initials = item.display_name
      .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    const isTop3 = index < 3;
    const medalColor = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32';

    return (
      <TouchableOpacity
        style={[styles.row, GLASS_SM]}
        onPress={() => router.push(`/(app)/user/${item.id}?from=directory`)}
        activeOpacity={0.75}
      >
        <Text style={[styles.rank, isTop3 && { color: medalColor }]}>
          {isTop3 ? ['①', '②', '③'][index] : `#${index + 1}`}
        </Text>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.displayName} numberOfLines={1}>{item.display_name}</Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>
        <View style={styles.pinCountWrap}>
          <Text style={styles.pinCount}>{item.pin_count}</Text>
          <Text style={styles.pinCountLabel}>pins</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.safe}>
      <View style={styles.orbRed} pointerEvents="none" />
      <View style={styles.orbBlue} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.navHeader}>
          <Text style={styles.navTitle}>Columbia</Text>
          <Text style={styles.navSub}>{users.length} students</Text>
          {/* Red thread */}
          <View style={styles.redThread} pointerEvents="none" />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyThreadRing} />
                <Text style={styles.emptyTitle}>No users yet</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  orbRed: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(230,57,70,0.12)', top: -60, right: -60,
  },
  orbBlue: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(67,97,238,0.08)', bottom: 120, left: -70,
  },
  navHeader: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26,26,26,0.08)',
    position: 'relative',
  },
  navTitle: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  navSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  redThread: {
    position: 'absolute',
    right: 24, top: 14,
    width: 80, height: 30,
    borderTopWidth: 1.5,
    borderColor: 'rgba(230,57,70,0.4)',
    borderRadius: 30,
    borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rank: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, width: 28, textAlign: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(230,57,70,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  info: { flex: 1, gap: 2 },
  displayName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  username: { fontSize: 12, color: COLORS.textSecondary },
  pinCountWrap: { alignItems: 'center' },
  pinCount: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  pinCountLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: -1 },
  chevron: { fontSize: 20, color: 'rgba(26,26,26,0.18)' },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyThreadRing: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 1.5, borderColor: COLORS.primary + '44',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, color: COLORS.textSecondary },
});
