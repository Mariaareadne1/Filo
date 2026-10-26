import { useCallback, useMemo } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useBoard, useDeleteBoard, useRemoveBoardItem, useReorderBoard, useUpdateBoard } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { parseIdParam } from '../../lib/params';
import { boardShareUrl, type BoardItem } from '../../lib/api/boards';
import { CATEGORY_META } from '../../lib/categories';
import { toUserMessage } from '../../lib/errors';
import { Button, GlassIconButton } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SHADOW, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';
import { BoardCover } from './BoardCover';

const VIS_COPY = { private: 'Only you', friends: 'Your followers', public: 'Anyone with the link' } as const;

export function BoardScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const id = parseIdParam(useLocalSearchParams<{ id?: string }>().id);
  const { userId } = useSession();
  const detail = useBoard(id);
  const reorder = useReorderBoard(id ?? '');
  const removeItem = useRemoveBoardItem(id ?? '');
  const update = useUpdateBoard(id ?? '');
  const del = useDeleteBoard();

  const board = detail.data?.board;
  const items = useMemo(() => detail.data?.items ?? [], [detail.data]);
  const isOwner = !!board && board.user_id === userId;
  const covers = useMemo(() => {
    const photos = items.filter((i) => i.photoUrl);
    const chosen = photos.find((i) => i.pinId === board?.cover_pin_id);
    const ordered = chosen ? [chosen, ...photos.filter((i) => i !== chosen)] : photos;
    return ordered.map((i) => i.photoUrl as string).slice(0, 4);
  }, [items, board?.cover_pin_id]);

  const share = useCallback(async () => {
    if (!board) return;
    if (board.visibility !== 'public' || !board.share_token) {
      Alert.alert('Make it shareable?', 'Anyone with the link will be able to see this board’s places and notes.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Make public & share', onPress: () => update.mutate({ visibility: 'public' }, { onSuccess: () => detail.refetch() }) },
      ]);
      return;
    }
    const url = boardShareUrl(board.share_token);
    await Share.share({ message: `${board.name} — a Filo board\n${url}`, url });
  }, [board, update, detail]);

  const confirmDelete = () => {
    if (!board) return;
    Alert.alert(`Delete “${board.name}”?`, 'The places stay on your map. Shared links stop working.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => del.mutate(board.id, {
        onSuccess: () => { haptic.warn(); router.navigate('/(app)/boards'); },
        onError: (e) => Alert.alert("Couldn't delete", toUserMessage(e)),
      }) },
    ]);
  };

  const itemMenu = useCallback((item: BoardItem) => {
    const opts = ['Open on map', ...(item.photoUrl ? ['Use photo as cover'] : []), 'Remove from board', 'Cancel'];
    const run = (i: number) => {
      const label = opts[i];
      if (label === 'Open on map') router.navigate({ pathname: '/(app)/map', params: { place: item.placeId } });
      if (label === 'Use photo as cover') update.mutate({ cover_pin_id: item.pinId });
      if (label === 'Remove from board') removeItem.mutate(item.id, { onError: (e) => Alert.alert("Couldn't remove", toUserMessage(e)) });
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: opts.length - 1, destructiveButtonIndex: opts.length - 2, title: item.name }, run);
    } else {
      Alert.alert(item.name, undefined, opts.slice(0, -1).map((t, i) => ({ text: t, onPress: () => run(i) })));
    }
  }, [router, update, removeItem]);

  const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<BoardItem>) => {
    const meta = CATEGORY_META[item.category];
    const n = (getIndex() ?? 0) + 1;
    return (
      <ScaleDecorator activeScale={1.03}>
        <PressableScale
          style={[s.item, isActive && s.itemActive]}
          pressedScale={0.99}
          onPress={() => (isOwner ? itemMenu(item) : router.navigate({ pathname: '/(app)/map', params: { place: item.placeId } }))}
          onLongPress={isOwner ? () => { haptic.tap(); drag(); } : undefined}
          accessibilityLabel={`${n}. ${item.name}${item.impression ? `. ${item.impression}` : ''}`}
          accessibilityHint={isOwner ? 'Opens options. Long press and drag to reorder.' : 'Opens on the map'}
        >
          <Text variant="count" tone="tertiary" style={s.num}>{String(n).padStart(2, '0')}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" style={s.itemName} numberOfLines={2}>{item.name}</Text>
            <Text variant="caption" tone="secondary" numberOfLines={1}>{[meta.short, item.neighborhood].filter(Boolean).join(' · ')}</Text>
            {item.impression ? <Text variant="callout" style={s.quote}>“{item.impression}”</Text> : null}
          </View>
          {isOwner ? <Icon name="line.3.horizontal" fallback="≡" size={18} color={colors.inkTertiary} /> : null}
        </PressableScale>
      </ScaleDecorator>
    );
  }, [isOwner, itemMenu, router, s, colors]);

  if (!id) return <View style={[s.root, s.center]}><Text variant="heading">Board not found.</Text></View>;
  if (detail.isLoading) return <View style={[s.root, s.center]}><ActivityIndicator color={colors.thread} /></View>;
  if (!detail.data || !board) {
    return (
      <View style={[s.root, s.center]}>
        <Text variant="heading">{detail.isError ? toUserMessage(detail.error) : 'This board is private or was deleted.'}</Text>
        <Button kind="secondary" label="Back" onPress={() => router.back()} style={{ marginTop: SPACE.lg }} />
      </View>
    );
  }

  const header = (
    <View>
      <View>
        <BoardCover covers={covers} categories={Array.from(new Set(items.map((i) => i.category)))} name={board.name} height={260} />
        <View style={[s.heroBar, { top: insets.top + SPACE.sm }]}>
          <GlassIconButton symbol="chevron.left" fallback="‹" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/boards'))} />
          <View style={s.heroActions}>
            <GlassIconButton symbol="square.and.arrow.up" fallback="↑" label="Share board" onPress={share} testID="board-share" />
            {isOwner ? (
              <GlassIconButton symbol="pencil" fallback="✎" label="Edit board"
                onPress={() => router.push({ pathname: '/board-modal/create', params: { boardId: board.id } })} />
            ) : null}
          </View>
        </View>
      </View>
      <View style={s.titleBlock}>
        <Text variant="caption" tone="secondary" style={s.kicker}>
          A FILO BOARD · {items.length} {items.length === 1 ? 'PLACE' : 'PLACES'}
        </Text>
        <Text variant="hero" accessibilityRole="header">{board.name}</Text>
        {board.description ? <Text variant="body" tone="secondary">{board.description}</Text> : null}
        <View style={s.byline}>
          <Text variant="callout" tone="secondary">by @{detail.data.owner.username}</Text>
          <Text variant="caption" tone="tertiary">· {VIS_COPY[board.visibility]}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <DraggableFlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        activationDistance={12}
        onDragEnd={({ data, from, to }) => {
          if (from === to) return;
          haptic.select();
          reorder.mutate(data.map((i) => i.id), { onError: (e) => Alert.alert("Couldn't reorder", toUserMessage(e)) });
        }}
        contentContainerStyle={{ paddingBottom: clearance + SPACE.lg }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text variant="heading">Nothing here yet</Text>
            <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
              {isOwner ? 'Open a place on the map and tap Board to add it.' : 'This board is still being drawn.'}
            </Text>
          </View>
        }
        ListFooterComponent={isOwner ? (
          <Button kind="danger" label="Delete board" onPress={confirmDelete} busy={del.isPending} style={s.delete} />
        ) : null}
      />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: 'center', justifyContent: 'center', padding: GUTTER },
    heroBar: { position: 'absolute', left: GUTTER, right: GUTTER, flexDirection: 'row', justifyContent: 'space-between' },
    heroActions: { flexDirection: 'row', gap: SPACE.sm },
    titleBlock: { paddingHorizontal: GUTTER, paddingTop: SPACE.xl, gap: SPACE.sm },
    kicker: { letterSpacing: 1 },
    byline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.lg },
    item: {
      flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, marginHorizontal: GUTTER, paddingVertical: SPACE.lg,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline, backgroundColor: c.bg,
    },
    itemActive: { ...SHADOW.float, backgroundColor: c.surface, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md },
    num: { width: 24, marginTop: 4 },
    itemName: { fontFamily: 'Fraunces-SemiBold', fontSize: 20, lineHeight: 24 },
    quote: { marginTop: SPACE.xs },
    empty: { alignItems: 'center', gap: SPACE.sm, padding: SPACE.xxl },
    delete: { marginHorizontal: GUTTER, marginTop: SPACE.xl },
  }),
);
