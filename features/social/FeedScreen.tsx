import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeed } from '../../lib/hooks';
import { CATEGORY_META } from '../../lib/categories';
import { placePhotoUrl } from '../../lib/search';
import { toUserMessage } from '../../lib/errors';
import type { FeedItem } from '../../lib/api/social';
import { Button } from '../../design/controls';
import { Icon, PressableScale, Text } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';

/** How long ago, in calm words. */
function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d` : `${Math.round(d / 7)}w`;
}

/**
 * What the people you follow saved recently. Chronological, no ranking
 * algorithm, no ads — and it ends ("You're caught up") instead of
 * scrolling forever.
 */
export function FeedScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const feed = useFeed();
  const items = feed.data?.pages.flat() ?? [];

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.sm }]}>
      <PressableScale onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(app)/discover'))} style={s.back} accessibilityLabel="Back">
        <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
        <Text variant="bodyStrong">Discover</Text>
      </PressableScale>
      <FlatList
        data={items}
        keyExtractor={(i) => i.pin_id}
        contentContainerStyle={[s.list, { paddingBottom: clearance }]}
        refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => feed.refetch()} tintColor={colors.thread} />}
        ListHeaderComponent={<Text variant="title" style={s.title} accessibilityRole="header">Friend activity</Text>}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage(); }}
        renderItem={({ item }) => <FeedRow item={item} onPress={() => router.navigate({ pathname: '/(app)/map', params: { place: item.place_id } })} />}
        ListEmptyComponent={feed.isLoading ? <ActivityIndicator /> : feed.isError ? (
          <View style={s.empty}>
            <Text variant="callout" tone="secondary">{toUserMessage(feed.error, "Couldn't load activity.")}</Text>
            <Button kind="secondary" label="Try again" onPress={() => feed.refetch()} />
          </View>
        ) : (
          <View style={s.empty}>
            <Text variant="heading">Quiet so far</Text>
            <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>Follow friends to see what they save. Nothing here is ever sponsored.</Text>
          </View>
        )}
        ListFooterComponent={items.length > 0 ? (
          feed.isFetchingNextPage ? <ActivityIndicator style={{ margin: SPACE.lg }} /> :
          !feed.hasNextPage ? <Text variant="caption" tone="tertiary" style={s.end}>You're all caught up.</Text> : null
        ) : null}
      />
    </View>
  );
}

function FeedRow({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const meta = CATEGORY_META[item.category];
  const photo = placePhotoUrl(item.photo_url, 300);
  const verb = item.status === 'visited' ? 'has been to' : 'wants to go to';
  return (
    <PressableScale style={s.row} onPress={onPress} pressedScale={0.99}
      accessibilityLabel={`@${item.username} ${verb} ${item.place_name}${item.impression ? `: ${item.impression}` : ''}, ${ago(item.created_at)} ago`}>
      <View style={s.avatar}><Text variant="label">{item.display_name.slice(0, 1).toUpperCase()}</Text></View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="callout">
          <Text variant="bodyStrong">@{item.username}</Text> <Text variant="callout" tone="secondary">{verb}</Text>
        </Text>
        <Text variant="heading" style={s.place} numberOfLines={2}>{item.place_name}</Text>
        <View style={s.meta}>
          <Icon name={meta.symbol} fallback={meta.glyph} size={11} color={colors.inkTertiary} />
          <Text variant="caption" tone="tertiary">{meta.short} · {ago(item.created_at)}</Text>
        </View>
        {item.impression ? <Text variant="callout" style={s.quote}>“{item.impression}”</Text> : null}
      </View>
      {photo ? <Image source={{ uri: photo }} style={s.thumb} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: GUTTER, minHeight: 44, alignSelf: 'flex-start' },
    title: { marginBottom: SPACE.md },
    list: { paddingHorizontal: GUTTER },
    row: { flexDirection: 'row', gap: SPACE.md, paddingVertical: SPACE.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
    place: { fontFamily: 'Fraunces-SemiBold', fontSize: 19, lineHeight: 23 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    quote: { marginTop: 2 },
    thumb: { width: 64, height: 64, borderRadius: RADIUS.sm },
    empty: { alignItems: 'center', gap: SPACE.sm, paddingTop: SPACE.xxxl },
    end: { textAlign: 'center', padding: SPACE.xl },
  }),
);
