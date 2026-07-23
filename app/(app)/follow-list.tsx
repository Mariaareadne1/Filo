import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FONTS,
  STICKER_SHADOW,
  SCREEN_PAD,
  TAB_CLEARANCE,
} from '../../constants/theme';

/**
 * FOLLOW LIST — shows a user's followers or following list. Reads
 * `userId` (defaults to current auth user) and `mode` ('followers' or
 * 'following') from the URL. Each row taps through to that user's
 * profile.
 */

type Mode = 'followers' | 'following';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export default function FollowListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string; mode?: string }>();

  const mode: Mode = params.mode === 'following' ? 'following' : 'followers';

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const targetUserId = params.userId ?? currentUserId;
  const isOwn = !params.userId || params.userId === currentUserId;

  // Resolve owner's first name when viewing someone else's list.
  useEffect(() => {
    if (isOwn || !targetUserId) { setOwnerName(null); return; }
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('username, display_name')
        .eq('id', targetUserId)
        .single();
      if (data) setOwnerName(data.display_name?.split(' ')[0] ?? data.username);
    })();
  }, [targetUserId, isOwn]);

  useEffect(() => {
    if (!targetUserId) return;
    (async () => {
      setLoading(true);

      const lookupCol = mode === 'followers' ? 'following_id' : 'follower_id';
      const selectCol = mode === 'followers' ? 'follower_id'  : 'following_id';

      const { data: rows, error } = await supabase
        .from('follows')
        .select(selectCol)
        .eq(lookupCol, targetUserId)
        .eq('status', 'active');

      if (error || !rows || rows.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const ids = (rows as any[]).map((r) => r[selectCol]).filter(Boolean);
      if (ids.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const { data: userRows } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);

      // Preserve the follow order (most recent follows first by default
      // in Supabase, but we'll sort alphabetically for stability).
      const sorted = (userRows ?? []).slice().sort((a: any, b: any) =>
        (a.display_name ?? a.username).localeCompare(b.display_name ?? b.username),
      );
      setUsers(sorted as UserRow[]);
      setLoading(false);
    })();
  }, [targetUserId, mode]);

  const possessive = isOwn ? 'your' : ownerName ? `${ownerName}'s` : 'their';
  const label = mode === 'followers' ? 'followers' : 'following';

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>← back</Text>
          </TouchableOpacity>

          <Text style={styles.metaLabel}>{label.toUpperCase()}</Text>
          <Text style={styles.title}>
            {possessive}{' '}
            <Text style={styles.titleItalic}>{label}.</Text>
          </Text>
          {!loading && (
            <Text style={styles.subtitle}>
              {users.length} {users.length === 1 ? 'person' : 'people'}.
            </Text>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={ACCENT.red} size="large" />
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            contentContainerStyle={
              users.length === 0 ? styles.emptyContainer : styles.list
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const initials = item.display_name
                .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push(`/(app)/user/${item.id}` as never)}
                  activeOpacity={0.85}
                >
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
                  <View style={styles.rowInfo}>
                    <Text style={styles.displayName} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    <Text style={styles.username}>@{item.username}</Text>
                  </View>
                  <Text style={styles.chevron}>→</Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyRing} />
                <Text style={styles.emptyTitle}>
                  no {label} <Text style={styles.emptyTitleItalic}>yet.</Text>
                </Text>
                <Text style={styles.emptySub}>
                  {mode === 'followers'
                    ? isOwn
                      ? 'invite a friend to start your circle.'
                      : `${ownerName ?? 'they'} have no followers yet.`
                    : isOwn
                      ? 'follow someone to see their pins on your map.'
                      : `${ownerName ?? 'they'} don't follow anyone yet.`}
                </Text>
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

  header: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 6,
  },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginTop: 6,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 32,
    lineHeight: 34,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  titleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: TAB_CLEARANCE },
  emptyContainer: { flex: 1 },
  separator: {
    height: 1,
    backgroundColor: PALETTE.inkLine,
    marginLeft: SCREEN_PAD + 56,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: PALETTE.bg,
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
    ...STICKER_SHADOW,
  },
  avatarInitials: {
    fontFamily: FONTS.display,
    fontSize: 15,
    fontWeight: '400',
    color: ACCENT.red,
  },
  rowInfo: { flex: 1, gap: 2 },
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
  chevron: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: PALETTE.ink,
  },

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
  emptyTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  emptySub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
    lineHeight: 18,
  },
});
