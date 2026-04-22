import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useOnboarding } from '../../contexts/onboarding';

interface DirectoryUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  pin_count: number;
}

export default function FindFriendsScreen() {
  const router = useRouter();
  const { setOnboardingComplete } = useOnboarding();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Local set of user IDs the viewer has followed during this session
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Slide-up entrance animation for the list
  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Fetch campus users + existing follows in parallel
      const [usersRes, followsRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, username, display_name, avatar_url, pins(count)')
          .eq('campus', 'columbia')
          .neq('id', user.id),
        supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)
          .eq('status', 'active'),
      ]);

      if (usersRes.data) {
        const mapped: DirectoryUser[] = usersRes.data.map((u: any) => ({
          id: u.id,
          username: u.username,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          pin_count: u.pins?.[0]?.count ?? 0,
        }));
        mapped.sort((a, b) => b.pin_count - a.pin_count);
        setUsers(mapped);
      }

      if (followsRes.data) {
        setFollowedIds(new Set(followsRes.data.map((f: any) => f.following_id)));
      }

      setLoading(false);

      // Animate content in
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 180 }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    })();
  }, []);

  const toggleFollow = useCallback(async (targetId: string, targetIsPrivate: boolean = false) => {
    if (!currentUserId || togglingId) return;
    setTogglingId(targetId);

    const isCurrentlyFollowing = followedIds.has(targetId);

    if (isCurrentlyFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetId);
      setFollowedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    } else {
      await supabase.from('follows').insert({
        follower_id: currentUserId,
        following_id: targetId,
        status: 'active',
      });
      setFollowedIds((prev) => new Set(prev).add(targetId));

      // Fire push notification
      await supabase.rpc('notify_new_follow', {
        p_follower_id: currentUserId,
        p_following_id: targetId,
      });
    }

    setTogglingId(null);
  }, [currentUserId, followedIds, togglingId]);

  async function handleDone() {
    if (!currentUserId || saving) return;
    setSaving(true);
    await supabase
      .from('users')
      .update({ onboarding_complete: true })
      .eq('id', currentUserId);
    // Update in-memory state so the route guard doesn't redirect back
    setOnboardingComplete(true);
    router.replace('/(app)');
  }

  const followCount = followedIds.size;

  const renderItem = useCallback(({ item }: { item: DirectoryUser }) => {
    const isFollowing = followedIds.has(item.id);
    const isToggling  = togglingId === item.id;
    const initials    = item.display_name
      .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

    return (
      <View style={styles.row}>
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
          {item.pin_count > 0 && (
            <Text style={styles.pinCount}>{item.pin_count} pin{item.pin_count !== 1 ? 's' : ''}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.followBtn, isFollowing && styles.followingBtn]}
          onPress={() => toggleFollow(item.id)}
          disabled={isToggling}
          activeOpacity={0.75}
        >
          {isToggling ? (
            <ActivityIndicator size="small" color={isFollowing ? '#888' : '#fff'} />
          ) : (
            <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }, [followedIds, togglingId, toggleFollow]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.stepRow}>
          <View style={styles.stepDot} />
          <View style={styles.stepDot} />
          <View style={[styles.stepDot, styles.stepDotActive]} />
        </View>
        <Text style={styles.headline}>Find people to follow.</Text>
        <Text style={styles.subtext}>Their pins show up on your map.</Text>

        {followCount > 0 && (
          <View style={styles.followCountBadge}>
            <Text style={styles.followCountText}>
              {followCount} {followCount === 1 ? 'person' : 'people'} followed
            </Text>
          </View>
        )}
      </View>

      {/* User list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#E63946" size="large" />
        </View>
      ) : (
        <Animated.View style={[styles.listWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🎓</Text>
                <Text style={styles.emptyText}>No other Columbia students yet.</Text>
              </View>
            }
          />
        </Animated.View>
      )}

      {/* Done button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.doneBtn, saving && styles.doneBtnDisabled]}
          onPress={handleDone}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.doneBtnText}>Done — take me to my map</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 6,
  },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ddd' },
  stepDotActive: { backgroundColor: '#E63946', width: 18 },

  headline: { fontSize: 26, fontWeight: '800', color: '#111', letterSpacing: -0.3 },
  subtext:  { fontSize: 15, color: '#888' },

  followCountBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  followCountText: { fontSize: 12, fontWeight: '700', color: '#E63946' },

  listWrap: { flex: 1 },
  list: { paddingBottom: 16 },
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 78 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 16, fontWeight: '700', color: '#666' },

  info: { flex: 1, gap: 1 },
  displayName: { fontSize: 15, fontWeight: '700', color: '#111' },
  username:    { fontSize: 12, color: '#888' },
  pinCount:    { fontSize: 11, color: '#aaa', marginTop: 1 },

  followBtn: {
    backgroundColor: '#E63946',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingBtn: { backgroundColor: '#f0f0f0' },
  followBtnText:    { fontSize: 13, fontWeight: '700', color: '#fff' },
  followingBtnText: { color: '#555' },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  doneBtn: {
    backgroundColor: '#E63946',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  doneBtnDisabled: { opacity: 0.6 },
  doneBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: '#aaa' },
});
