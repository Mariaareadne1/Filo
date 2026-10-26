import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAddToBoard, useBoards } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { parseIdParam } from '../../lib/params';
import { toUserMessage } from '../../lib/errors';
import { Button } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';
import { BoardCover } from './BoardCover';

/** Pick a board for a pin (or create one with it). */
export function AddToBoardScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ pinId?: string; placeName?: string }>();
  const pinId = parseIdParam(params.pinId);
  const { userId } = useSession();
  const boards = useBoards(userId);
  const add = useAddToBoard();

  if (!pinId) {
    return <View style={[s.root, s.center]}><Text variant="heading">Save this place first.</Text></View>;
  }

  const pick = (boardId: string, name: string) =>
    add.mutate({ boardId, pinId }, {
      onSuccess: () => { haptic.commit(); router.back(); },
      onError: (e) => Alert.alert(`Couldn't add to ${name}`, toUserMessage(e)),
    });

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.lg }]}>
      <View style={s.head}>
        <Text variant="caption" tone="secondary" style={{ letterSpacing: 0.8 }}>ADD TO BOARD</Text>
        <Text variant="title" numberOfLines={2} accessibilityRole="header">{params.placeName ?? 'This place'}</Text>
      </View>
      <FlatList
        data={boards.data ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 120 }]}
        ListEmptyComponent={boards.isLoading ? <ActivityIndicator /> : (
          <Text variant="callout" tone="secondary">No boards yet — create the first one below.</Text>
        )}
        renderItem={({ item }) => (
          <PressableScale style={s.row} onPress={() => pick(item.id, item.name)} disabled={add.isPending}
            accessibilityLabel={`Add to ${item.name}, ${item.pinCount} places`}>
            <View style={s.thumb}><BoardCover covers={item.covers} categories={item.categories} name={item.name} height={52} /></View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>{item.name}</Text>
              <Text variant="caption" tone="secondary">{item.pinCount} places</Text>
            </View>
            {add.isPending && add.variables?.boardId === item.id
              ? <ActivityIndicator color={colors.thread} />
              : <Icon name="plus.circle" fallback="+" size={20} color={colors.thread} />}
          </PressableScale>
        )}
      />
      <View style={[s.footer, { paddingBottom: insets.bottom + SPACE.md }]}>
        <Button kind="secondary" symbol="plus" fallback="+" label="New board with this place"
          onPress={() => router.replace({ pathname: '/board-modal/create', params: { pinId } })} />
        <Button kind="quiet" label="Cancel" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    head: { paddingHorizontal: GUTTER, gap: 4, marginBottom: SPACE.md },
    list: { paddingHorizontal: GUTTER, gap: SPACE.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 64 },
    thumb: { width: 52, height: 52, borderRadius: RADIUS.sm, overflow: 'hidden' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: GUTTER, paddingTop: SPACE.md, gap: SPACE.xs, backgroundColor: c.bg },
  }),
);
