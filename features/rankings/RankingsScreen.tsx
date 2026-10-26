import { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useProfile, useRankings, useRemoveRanking, useRerank } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { CATEGORIES, CATEGORY_META, normalizeCategory, type Category } from '../../lib/categories';
import { parseIdParam } from '../../lib/params';
import { toUserMessage } from '../../lib/errors';
import type { RankedPlace } from '../../lib/api/rankings';
import { GlassChip } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { StatusScrim } from '../../design/StatusScrim';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SHADOW, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';

/**
 * A person's ranked lists. Owners can reorder by dragging (long-press),
 * or without dragging via each row's menu / VoiceOver actions — every move
 * goes through the atomic rerank_place RPC with an optimistic update.
 */
export function RankingsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const params = useLocalSearchParams<{ userId?: string; category?: string }>();
  const { userId: me } = useSession();
  const target = parseIdParam(params.userId) ?? me;
  const isOwn = target === me;
  const [cat, setCat] = useState<Category>(normalizeCategory(params.category) ?? 'cafe');
  const owner = useProfile(isOwn ? null : target);
  const list = useRankings(target, cat);
  const rerank = useRerank(cat);
  const remove = useRemoveRanking(cat);

  const meta = CATEGORY_META[cat];
  const items = useMemo(() => list.data ?? [], [list.data]);
  const who = isOwn ? 'Your' : owner.data ? `${owner.data.display_name.split(' ')[0]}'s` : 'Their';

  const move = useCallback((placeId: string, position: number) => {
    haptic.select();
    rerank.mutate({ placeId, position }, { onError: (e) => Alert.alert("Couldn't move it", toUserMessage(e)) });
  }, [rerank]);

  const confirmRemove = useCallback((item: RankedPlace) => {
    Alert.alert(`Remove ${item.name} from your ${meta.plural}?`, 'It stays on your map — only the ranking is removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(item.placeId, { onError: (e) => Alert.alert("Couldn't remove", toUserMessage(e)) }) },
    ]);
  }, [remove, meta.plural]);

  const openMenu = useCallback((item: RankedPlace) => {
    const n = items.length;
    const options = ['Move to top', 'Move up', 'Move down', 'Remove ranking', 'Cancel'];
    const run = (i: number) => {
      if (i === 0 && item.position > 1) move(item.placeId, 1);
      if (i === 1 && item.position > 1) move(item.placeId, item.position - 1);
      if (i === 2 && item.position < n) move(item.placeId, item.position + 1);
      if (i === 3) confirmRemove(item);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, destructiveButtonIndex: 3, cancelButtonIndex: 4, title: item.name }, run);
    } else {
      Alert.alert(item.name, undefined, options.slice(0, 4).map((t, i) => ({ text: t, onPress: () => run(i) })).concat({ text: 'Cancel', onPress: () => undefined }));
    }
  }, [items.length, move, confirmRemove]);

  const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<RankedPlace>) => {
    const pos = (getIndex() ?? item.position - 1) + 1;
    return (
      <ScaleDecorator activeScale={1.03}>
        <PressableScale
          pressedScale={0.99}
          onLongPress={isOwn ? () => { haptic.tap(); drag(); } : undefined}
          onPress={() => router.navigate({ pathname: '/(app)/map', params: { place: item.placeId } })}
          style={[s.row, isActive && s.rowActive]}
          accessibilityLabel={`Number ${pos}, ${item.name}`}
          accessibilityHint={isOwn ? 'Opens on the map. Long press and drag to reorder, or use actions.' : 'Opens on the map'}
          accessibilityActions={isOwn ? [
            { name: 'moveUp', label: 'Move up' }, { name: 'moveDown', label: 'Move down' },
            { name: 'moveTop', label: 'Move to top' }, { name: 'remove', label: 'Remove ranking' },
          ] : undefined}
          onAccessibilityAction={(e) => {
            const a = e.nativeEvent.actionName;
            if (a === 'moveUp' && pos > 1) move(item.placeId, pos - 1);
            if (a === 'moveDown' && pos < items.length) move(item.placeId, pos + 1);
            if (a === 'moveTop' && pos > 1) move(item.placeId, 1);
            if (a === 'remove') confirmRemove(item);
          }}
        >
          <Text variant="title" tone={pos <= 3 ? 'thread' : 'tertiary'} style={s.rank}>{pos}</Text>
          <View style={s.body}>
            <Text variant="bodyStrong" numberOfLines={1}>{item.name}</Text>
            <Text variant="caption" tone="secondary" numberOfLines={1}>{item.neighborhood ?? item.address}</Text>
          </View>
          {isOwn ? (
            <PressableScale onPress={() => openMenu(item)} hitSlop={10} accessibilityLabel={`Options for ${item.name}`} style={s.more}>
              <Icon name="ellipsis" fallback="⋯" size={18} color={colors.inkSecondary} />
            </PressableScale>
          ) : null}
          {isOwn ? <Icon name="line.3.horizontal" fallback="≡" size={18} color={colors.inkTertiary} /> : null}
        </PressableScale>
      </ScaleDecorator>
    );
  }, [isOwn, items.length, move, confirmRemove, openMenu, router, s, colors]);

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.sm }]}>
      <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/profile'))} style={s.back} accessibilityLabel="Back">
        <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
        <Text variant="bodyStrong">Back</Text>
      </PressableScale>
      <View style={s.head}>
        <Text variant="caption" tone="secondary" style={s.kicker}>RANKINGS · BEST FIRST</Text>
        <Text variant="title" accessibilityRole="header">
          {who} <Text variant="title" italic tone="thread">{meta.plural}</Text>.
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={s.chipScroller}>
        {CATEGORIES.map((c) => (
          <GlassChip key={c} label={CATEGORY_META[c].short} symbol={CATEGORY_META[c].symbol} fallback={CATEGORY_META[c].glyph}
            selected={c === cat} onPress={() => setCat(c)} />
        ))}
      </ScrollView>

      {list.isLoading ? (
        <ActivityIndicator style={{ marginTop: SPACE.xxl }} color={colors.thread} />
      ) : list.isError ? (
        <Text variant="callout" tone="secondary" style={s.empty}>{toUserMessage(list.error, "Couldn't load rankings.")}</Text>
      ) : items.length === 0 ? (
        <View style={s.emptyBox}>
          <Text variant="heading">{isOwn ? `No ${meta.plural} ranked yet` : `No ${meta.plural} ranked`}</Text>
          {isOwn ? (
            <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
              Open a place you've been on the map and tap Rank — a few quick “this or that?” answers place it.
            </Text>
          ) : null}
        </View>
      ) : (
        <DraggableFlatList
          data={items}
          keyExtractor={(i) => i.placeId}
          renderItem={renderItem}
          activationDistance={12}
          onDragBegin={() => haptic.tap()}
          onDragEnd={({ data, from, to }) => {
            if (from === to) return;
            const moved = data[to];
            move(moved.placeId, to + 1);
          }}
          containerStyle={{ flex: 1 }}
          contentContainerStyle={[s.list, { paddingBottom: clearance }]}
        />
      )}
      <StatusScrim />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: GUTTER, minHeight: 44, alignSelf: 'flex-start' },
    head: { paddingHorizontal: GUTTER, gap: 4 },
    kicker: { letterSpacing: 0.8 },
    chipScroller: { flexGrow: 0, marginTop: SPACE.md },
    chips: { paddingHorizontal: GUTTER, gap: SPACE.sm, paddingVertical: 4 },
    list: { paddingHorizontal: GUTTER, paddingTop: SPACE.md, gap: SPACE.sm },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 64, paddingHorizontal: SPACE.lg,
      backgroundColor: c.surface, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline,
    },
    rowActive: { ...SHADOW.float, borderColor: c.thread },
    rank: { width: 36, textAlign: 'center', fontSize: 26, lineHeight: 30 },
    body: { flex: 1, gap: 1 },
    more: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
    empty: { paddingHorizontal: GUTTER, marginTop: SPACE.xl },
    emptyBox: { alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.xxl, marginTop: SPACE.xxxl },
  }),
);
