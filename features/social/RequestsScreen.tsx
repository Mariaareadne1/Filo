import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowRequests, useRespondToRequest } from '../../lib/hooks';
import { toUserMessage } from '../../lib/errors';
import { Button } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { StatusScrim } from '../../design/StatusScrim';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';

/** Incoming follow requests (private accounts). Approve or decline each. */
export function RequestsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const requests = useFollowRequests();
  const respond = useRespondToRequest();

  const act = (followerId: string, accept: boolean) => {
    haptic.select();
    respond.mutate({ followerId, accept }, { onError: (e) => Alert.alert("Couldn't update the request", toUserMessage(e)) });
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.sm }]}>
      <PressableScale onPress={() => router.back()} style={s.back} accessibilityLabel="Back">
        <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
        <Text variant="bodyStrong">Back</Text>
      </PressableScale>
      <FlatList
        data={requests.data ?? []}
        keyExtractor={(r) => r.follower.id}
        contentContainerStyle={[s.list, { paddingBottom: clearance }]}
        ListHeaderComponent={
          <View style={s.head}>
            <Text variant="title" accessibilityRole="header">Follow requests</Text>
            <Text variant="callout" tone="secondary">People you approve can see your places and rankings.</Text>
          </View>
        }
        ListEmptyComponent={
          requests.isLoading ? <ActivityIndicator /> :
          requests.isError ? <Text variant="callout" tone="secondary">{toUserMessage(requests.error)}</Text> :
          <Text variant="callout" tone="secondary">No pending requests.</Text>
        }
        renderItem={({ item }) => {
          const busy = respond.isPending && respond.variables?.followerId === item.follower.id;
          return (
            <View style={s.row}>
              <PressableScale style={s.who} onPress={() => router.push(`/(app)/user/${item.follower.id}`)}
                accessibilityLabel={`${item.follower.display_name}, @${item.follower.username}`}>
                <View style={s.avatar}><Text variant="label">{item.follower.display_name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{item.follower.display_name}</Text>
                  <Text variant="caption" tone="secondary">@{item.follower.username}</Text>
                </View>
              </PressableScale>
              <Button kind="secondary" label="Decline" onPress={() => act(item.follower.id, false)} disabled={busy} style={s.btn} />
              <Button label="Approve" onPress={() => act(item.follower.id, true)} busy={busy} style={s.btn} />
            </View>
          );
        }}
      />
      <StatusScrim />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: GUTTER, minHeight: 44, alignSelf: 'flex-start' },
    list: { paddingHorizontal: GUTTER, gap: SPACE.sm },
    head: { gap: SPACE.xs, marginBottom: SPACE.lg },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 64 },
    who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
    btn: { minHeight: 38, paddingHorizontal: SPACE.md },
  }),
);
