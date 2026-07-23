import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
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
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const reqIdRef = useRef(0);

  const loadDirectory = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    const { data, error: err } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, pins(count)')
      .eq('campus', 'columbia');

    if (reqIdRef.current !== myReq) return;
    if (err) {
      setError(true);
    } else if (data) {
      const mapped: DirectoryUser[] = data.map((u: any) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        pin_count: u.pins?.[0]?.count ?? 0,
      }));
      mapped.sort((a, b) => b.pin_count - a.pin_count);
      setError(false);
      setUsers(mapped);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Single effect: fires on first focus and on refocus (loadDirectory is
  // stable) — no duplicate mount fetch.
  useFocusEffect(useCallback(() => { loadDirectory(); }, [loadDirectory]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setError(false);
    loadDirectory();
  }, [loadDirectory]);

  const filtered = searchQuery.trim()
    ? users.filter(
        (u) =>
          u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users;

  const renderItem = ({ item, index }: { item: DirectoryUser; index: number }) => {
    const initials = item.display_name
      .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    const rank = users.findIndex((u) => u.id === item.id) + 1; // stable rank from full list

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push(`/(app)/user/${item.id}?from=directory`)}
        activeOpacity={0.92}
      >
        <View style={styles.rankWrap}>
          <Text style={styles.rankNum}>{String(rank).padStart(2, '0')}</Text>
        </View>

        {item.avatar_url ? (
          <Image
            source={{ uri: item.avatar_url }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.id}
          />
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
          <Text style={styles.pinCountLabel}>PINS</Text>
        </View>

        <Text style={styles.chevron}>→</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.metaLabel}>WHO'S PINNING</Text>
          <Text style={styles.title}>
            columbia<Text style={styles.titleItalic}>.</Text>
          </Text>
          <Text style={styles.subtitle}>
            {users.length} {users.length === 1 ? 'student' : 'students'} on the map.
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="search by name or @handle…"
              placeholderTextColor={PALETTE.inkMute}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
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
        ) : error ? (
          <View style={styles.errorState}>
            <Text style={styles.emptyTitle}>couldn't load the directory.</Text>
            <Text style={styles.emptySub}>check your connection and try again.</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { setLoading(true); loadDirectory(); }}
              activeOpacity={0.85}
            >
              <Text style={styles.retryBtnText}>retry →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
            renderItem={renderItem}
            contentContainerStyle={
              filtered.length === 0 ? styles.emptyContainer : styles.list
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
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
                <View style={styles.emptyRing} />
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'no matches.' : 'no students yet.'}
                </Text>
                {searchQuery ? (
                  <Text style={styles.emptySub}>try a different name or handle.</Text>
                ) : null}
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },

  // Header
  header: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 14,
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
    fontSize: 38,
    lineHeight: 40,
    color: PALETTE.ink,
    fontWeight: '400',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  titleItalic: {
    color: ACCENT.red,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    marginTop: 4,
  },

  // Search
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
  searchIcon: { fontSize: 14, color: PALETTE.inkSoft },
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
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 22,
    paddingVertical: 11,
    ...STICKER_SHADOW_LG,
  },
  retryBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  list: { paddingBottom: TAB_CLEARANCE },
  emptyContainer: { flex: 1 },
  separator: { height: 1, backgroundColor: PALETTE.inkLine, marginLeft: SCREEN_PAD },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: PALETTE.bg,
  },
  rankWrap: {
    width: 32,
    alignItems: 'flex-start',
  },
  rankNum: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
    fontWeight: '500',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PALETTE.ink,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PALETTE.zone1,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: FONTS.display,
    fontSize: 15,
    fontWeight: '400',
    color: ACCENT.red,
  },
  info: { flex: 1, gap: 2 },
  displayName: {
    fontFamily: FONTS.display,
    fontSize: 16,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  username: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: PALETTE.inkSoft,
  },

  pinCountWrap: { alignItems: 'center', minWidth: 40 },
  pinCount: {
    fontFamily: FONTS.display,
    fontSize: 20,
    fontStyle: 'italic',
    fontWeight: '400',
    color: ACCENT.red,
    lineHeight: 22,
  },
  pinCountLabel: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: PALETTE.inkSoft,
    marginTop: 1,
  },
  chevron: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: PALETTE.ink,
    paddingLeft: 4,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: ACCENT.red,
    opacity: 0.4,
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
  },
});
