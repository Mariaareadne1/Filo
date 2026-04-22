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
      // Sort by pin count descending
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

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push(`/(app)/user/${item.id}?from=directory`)}
        activeOpacity={0.7}
      >
        <Text style={styles.rank}>#{index + 1}</Text>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.displayName}>{item.display_name}</Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>
        <View style={styles.pinCountBadge}>
          <Text style={styles.pinCount}>{item.pin_count}</Text>
          <Text style={styles.pinCountLabel}>pins</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navHeader}>
        <Text style={styles.navTitle}>Columbia</Text>
        <Text style={styles.navSub}>{users.length} students</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#E63946" size="large" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E63946" />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎓</Text>
              <Text style={styles.emptyTitle}>No users yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  navHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  navTitle: { fontSize: 22, fontWeight: '800', color: '#111' },
  navSub: { fontSize: 12, color: '#aaa', marginTop: 2 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 40 },
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 80 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  rank: { fontSize: 12, fontWeight: '700', color: '#ccc', width: 24, textAlign: 'right' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 16, fontWeight: '700', color: '#666' },
  info: { flex: 1, gap: 2 },
  displayName: { fontSize: 15, fontWeight: '700', color: '#111' },
  username: { fontSize: 12, color: '#888' },
  pinCountBadge: { alignItems: 'center' },
  pinCount: { fontSize: 16, fontWeight: '800', color: '#E63946' },
  pinCountLabel: { fontSize: 10, color: '#aaa', marginTop: -1 },
  chevron: { fontSize: 20, color: '#ccc' },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 16, color: '#888' },
});
