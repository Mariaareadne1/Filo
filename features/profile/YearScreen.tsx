import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRankingSummary, useUserPins } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { CATEGORY_META } from '../../lib/categories';
import { computeYearStats } from '../../lib/yearStats';
import { Icon, PressableScale, Text } from '../../design/primitives';
import { StatusScrim } from '../../design/StatusScrim';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Your year in Filo — only from your own pins and rankings. */
export function YearScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const { userId } = useSession();
  const pins = useUserPins(userId);
  const ranks = useRankingSummary(userId);
  const year = new Date().getFullYear();
  const stats = useMemo(() => computeYearStats(
    (pins.data ?? []).map((p) => ({ created_at: p.created_at, status: p.status, category: p.place.category, neighborhood: p.place.neighborhood })),
    year,
  ), [pins.data, year]);
  const favorite = (ranks.data ?? []).sort((a, b) => b.count - a.count)[0];

  const blocks: { kicker: string; value: string; sub?: string }[] = stats.total === 0 ? [] : [
    { kicker: 'PLACES SAVED', value: String(stats.total), sub: `${stats.visited} been, ${stats.total - stats.visited} still on the list` },
    ...(stats.topCategory ? [{ kicker: 'MOSTLY', value: CATEGORY_META[stats.topCategory].plural }] : []),
    ...(stats.topNeighborhood ? [{ kicker: 'YOUR NEIGHBORHOOD', value: stats.topNeighborhood, sub: `${stats.distinctNeighborhoods} ${stats.distinctNeighborhoods === 1 ? 'neighborhood' : 'neighborhoods'} explored` }] : []),
    ...(stats.topMonth !== null ? [{ kicker: 'BUSIEST MONTH', value: MONTHS[stats.topMonth] }] : []),
    ...(favorite?.top[0] ? [{ kicker: `YOUR #1 ${CATEGORY_META[favorite.category].singular.toUpperCase()}`, value: favorite.top[0] }] : []),
  ];

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + SPACE.sm, paddingBottom: clearance + SPACE.lg }}>
      <PressableScale onPress={() => router.back()} style={s.back} accessibilityLabel="Back">
        <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
        <Text variant="bodyStrong">You</Text>
      </PressableScale>
      <View style={s.head}>
        <Text variant="caption" tone="secondary" style={s.kicker}>{year} IN FILO</Text>
        <Text variant="hero" accessibilityRole="header">Your year, <Text variant="hero" italic tone="thread">mapped</Text>.</Text>
      </View>
      {pins.isLoading ? <ActivityIndicator style={{ marginTop: SPACE.xxl }} /> : blocks.length === 0 ? (
        <Text variant="callout" tone="secondary" style={s.pad}>Save a few places this year and your recap appears here.</Text>
      ) : blocks.map((b) => (
        <View key={b.kicker} style={s.block} accessible accessibilityLabel={`${b.kicker}: ${b.value}${b.sub ? `. ${b.sub}` : ''}`}>
          <Text variant="caption" tone="secondary" style={s.kicker}>{b.kicker}</Text>
          <Text variant="title" italic>{b.value}</Text>
          {b.sub ? <Text variant="callout" tone="secondary">{b.sub}</Text> : null}
        </View>
      ))}
    </ScrollView>
    <StatusScrim />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: GUTTER, minHeight: 44, alignSelf: 'flex-start' },
    head: { paddingHorizontal: GUTTER, gap: SPACE.sm, marginBottom: SPACE.xl, marginTop: SPACE.lg },
    pad: { paddingHorizontal: GUTTER },
    kicker: { letterSpacing: 1.2 },
    block: { marginHorizontal: GUTTER, marginBottom: SPACE.md, padding: SPACE.xl, gap: SPACE.xs, borderRadius: RADIUS.lg, backgroundColor: c.surface },
  }),
);
