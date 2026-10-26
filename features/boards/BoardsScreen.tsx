import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBoards } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { toUserMessage } from '../../lib/errors';
import type { BoardSummary } from '../../lib/api/boards';
import { Button, GlassIconButton } from '../../design/controls';
import { Icon, PressableScale, Text } from '../../design/primitives';
import { StatusScrim } from '../../design/StatusScrim';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SHADOW, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';
import { BoardCover } from './BoardCover';

const VIS_LABEL = { private: 'Only you', friends: 'Followers', public: 'Shareable link' } as const;
const VIS_SYMBOL = { private: 'lock.fill', friends: 'person.2.fill', public: 'link' } as const;

export function BoardsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const { userId } = useSession();
  const boards = useBoards(userId);

  const header = (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text variant="title" accessibilityRole="header">Boards</Text>
        <Text variant="callout" tone="secondary">Your city guides — for a friend, a date, a slow Sunday.</Text>
      </View>
      <GlassIconButton symbol="plus" fallback="+" label="New board" onPress={() => router.push('/board-modal/create')} testID="boards-new" />
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.md }]}>
      <FlatList
        data={boards.data ?? []}
        keyExtractor={(b) => b.id}
        numColumns={2}
        columnWrapperStyle={s.colGap}
        contentContainerStyle={[s.list, { paddingBottom: clearance + SPACE.lg }]}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={boards.isRefetching} onRefresh={() => boards.refetch()} tintColor={colors.thread} />}
        renderItem={({ item }) => <BoardCard board={item} onPress={() => router.push(`/(app)/board/${item.id}`)} />}
        ListEmptyComponent={
          boards.isLoading ? <ActivityIndicator style={{ marginTop: SPACE.xxl }} /> :
          boards.isError ? (
            <View style={s.empty}>
              <Text variant="callout" tone="secondary">{toUserMessage(boards.error, "Couldn't load your boards.")}</Text>
              <Button kind="secondary" label="Try again" onPress={() => boards.refetch()} />
            </View>
          ) : (
            <View style={s.empty}>
              <Icon name="square.stack" fallback="▤" size={34} color={colors.inkTertiary} />
              <Text variant="heading">No boards yet</Text>
              <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
                Group places into a guide — “Late night eats”, “Study cafes” — and share it with one link.
              </Text>
              <Button label="Create a board" onPress={() => router.push('/board-modal/create')} />
            </View>
          )
        }
      />
      <StatusScrim />
    </View>
  );
}

function BoardCard({ board, onPress }: { board: BoardSummary; onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale style={s.card} onPress={onPress} pressedScale={0.97}
      accessibilityLabel={`${board.name}, ${board.pinCount} places, ${VIS_LABEL[board.visibility]}`}>
      <BoardCover covers={board.covers} categories={board.categories} name={board.name} height={148} />
      <View style={s.cardBody}>
        <Text variant="heading" numberOfLines={2} style={s.cardTitle}>{board.name}</Text>
        <View style={s.meta}>
          <Icon name={VIS_SYMBOL[board.visibility]} fallback="·" size={11} color={colors.inkTertiary} />
          <Text variant="caption" tone="tertiary">
            {board.pinCount} {board.pinCount === 1 ? 'place' : 'places'}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    list: { paddingHorizontal: GUTTER, gap: SPACE.md },
    colGap: { gap: SPACE.md },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, marginBottom: SPACE.md },
    card: { flex: 1, maxWidth: '50%', borderRadius: RADIUS.lg, backgroundColor: c.surface, overflow: 'hidden', ...SHADOW.card },
    cardBody: { padding: SPACE.md, gap: 4 },
    cardTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 17, lineHeight: 21 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    empty: { alignItems: 'center', gap: SPACE.md, paddingTop: SPACE.xxxl, paddingHorizontal: SPACE.xl },
  }),
);
