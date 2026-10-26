import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowList } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { parseIdParam } from '../../lib/params';
import { toUserMessage } from '../../lib/errors';
import { Icon, PressableScale, Text } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';

export function FollowListScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const params = useLocalSearchParams<{ userId?: string; mode?: string }>();
  const { userId: me } = useSession();
  const userId = parseIdParam(params.userId) ?? me;
  const mode = params.mode === 'following' ? 'following' : 'followers';
  const list = useFollowList(userId, mode);

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.sm }]}>
      <PressableScale onPress={() => router.back()} style={s.back} accessibilityLabel="Back">
        <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
        <Text variant="bodyStrong">Back</Text>
      </PressableScale>
      <Text variant="title" style={s.title} accessibilityRole="header">{mode === 'followers' ? 'Followers' : 'Following'}</Text>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[s.list, { paddingBottom: clearance }]}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator /> : (
          <Text variant="callout" tone="secondary">
            {list.isError ? toUserMessage(list.error) : mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
          </Text>
        )}
        renderItem={({ item }) => (
          <PressableScale style={s.row} onPress={() => router.push(`/(app)/user/${item.id}`)} accessibilityLabel={`${item.display_name}, @${item.username}`}>
            <View style={s.avatar}><Text variant="label">{item.display_name.slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>{item.display_name}</Text>
              <Text variant="caption" tone="secondary">@{item.username}</Text>
            </View>
            <Icon name="chevron.right" fallback="›" size={14} color={colors.inkTertiary} />
          </PressableScale>
        )}
      />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: GUTTER, minHeight: 44, alignSelf: 'flex-start' },
    title: { paddingHorizontal: GUTTER, marginBottom: SPACE.md },
    list: { paddingHorizontal: GUTTER },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 60 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
  }),
);
