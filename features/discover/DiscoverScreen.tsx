import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../lib/session';
import { CATEGORIES, CATEGORY_META, type Category } from '../../lib/categories';
import { parseQuery } from '../../lib/discovery/parseQuery';
import { fetchLens, fetchLikeYou, searchDiscovery, type DiscoveryResult, type LensId } from '../../lib/api/discovery';
import { toUserMessage } from '../../lib/errors';
import { Glass } from '../../design/Glass';
import { GlassChip } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { StatusScrim } from '../../design/StatusScrim';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';
import { useLocationAccess } from '../map/useLocationAccess';

const EXAMPLES = [
  'Quiet cafes to work in the afternoon',
  'First date spot in Brooklyn',
  'Vintage shops around the Lower East Side',
  'Dinner near campus my friends saved',
];

const LENSES: { id: LensId; title: string; italic: string; empty: string }[] = [
  { id: 'new_to_network', title: 'New to your', italic: 'network', empty: 'When friends save places you haven’t, they show up here.' },
  { id: 'like_you', title: 'Saved by people', italic: 'like you', empty: '' },
  { id: 'hidden_gems', title: 'Hidden', italic: 'gems', empty: 'Places friends rank highly that few people know yet.' },
  { id: 'disagree', title: 'Friends', italic: 'disagree', empty: 'Shows up when two friends rank the same place very differently.' },
  { id: 'trending', title: 'Trending near', italic: 'campus', empty: 'Needs at least two people pinning the same place this fortnight.' },
  { id: 'most_pinned', title: 'Most', italic: 'pinned', empty: 'Shows up once two or more people pin the same place.' },
];

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function DiscoverScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const { userId } = useSession();
  const location = useLocationAccess();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | null>(null);
  const q = useDebounced(query.trim(), 300);
  const parsed = useMemo(() => (q.length >= 2 ? parseQuery(q) : null), [q]);

  const search = useQuery({
    queryKey: ['discover-search', q],
    enabled: !!parsed,
    queryFn: async () => {
      const device = parsed?.nearMe && location.access === 'granted' ? await location.current() : null;
      return searchDiscovery(parsed!, device);
    },
    staleTime: 30_000,
  });

  const openOnMap = (r: DiscoveryResult) => {
    haptic.select();
    router.navigate({ pathname: '/(app)/map', params: { place: r.placeId } });
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top + SPACE.md, paddingBottom: clearance + SPACE.xl }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={s.head}>
        <Text variant="title" accessibilityRole="header">
          Discover <Text variant="title" italic tone="thread">through people</Text>.
        </Text>
        <Text variant="callout" tone="secondary">Ask in your own words. Results are real places, with the reasons behind them.</Text>
      </View>

      <Glass style={s.searchBox} radius={RADIUS.lg}>
        <Icon name="sparkle.magnifyingglass" fallback="⌕" size={18} color={colors.inkSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Describe a place, a vibe, a neighborhood"
          placeholderTextColor={colors.inkTertiary}
          style={s.input}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Describe what you're looking for"
          testID="discover-input"
        />
        {search.isFetching ? <ActivityIndicator size="small" color={colors.inkSecondary} /> : null}
      </Glass>

      {!parsed ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.examples}>
          {EXAMPLES.map((e) => (
            <PressableScale key={e} style={s.example} onPress={() => setQuery(e)} accessibilityLabel={`Try: ${e}`}>
              <Text variant="label" tone="secondary">{e}</Text>
            </PressableScale>
          ))}
        </ScrollView>
      ) : (
        <View style={s.results}>
          <FilterSummary parsed={parsed} />
          {parsed.notes.length > 0 ? (
            <View style={s.notes} accessible accessibilityLabel={parsed.notes.join(' ')}>
              <Icon name="info.circle" fallback="i" size={14} color={colors.inkSecondary} />
              <Text variant="caption" tone="secondary" style={{ flex: 1 }}>{parsed.notes.join(' ')}</Text>
            </View>
          ) : null}
          {search.data?.relaxed ? (
            <Text variant="caption" tone="secondary">No places are tagged with those exact words — showing {parsed.category ? CATEGORY_META[parsed.category].plural : 'places'}{parsed.near ? ` near ${parsed.near.label}` : ''} instead.</Text>
          ) : null}
          {search.isError ? (
            <Text variant="callout" tone="danger">{toUserMessage(search.error, 'Search is unavailable right now.')}</Text>
          ) : search.isSuccess && search.data.results.length === 0 ? (
            <Text variant="callout" tone="secondary">
              Nothing in Filo matches that yet{parsed.friendsOnly ? ' among places your friends saved' : ''}. Try fewer words, or add a new place with +.
            </Text>
          ) : (
            (search.data?.results ?? []).map((r) => <ResultRow key={r.placeId} r={r} onPress={() => openOnMap(r)} />)
          )}
        </View>
      )}

      {!parsed ? (
        <>
          <PressableScale style={s.activity} onPress={() => router.push('/(app)/feed')} accessibilityLabel="Friend activity">
            <Icon name="person.2.wave.2" fallback="◎" size={18} color={colors.thread} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Friend activity</Text>
              <Text variant="caption" tone="secondary">What your people saved lately — it ends when you're caught up.</Text>
            </View>
            <Icon name="chevron.right" fallback="›" size={14} color={colors.inkTertiary} />
          </PressableScale>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flexGrow: 0 }}>
            <GlassChip label="all" selected={cat === null} onPress={() => setCat(null)} />
            {CATEGORIES.map((c) => (
              <GlassChip key={c} label={CATEGORY_META[c].short} symbol={CATEGORY_META[c].symbol} fallback={CATEGORY_META[c].glyph}
                selected={cat === c} onPress={() => setCat(cat === c ? null : c)} />
            ))}
          </ScrollView>

          {LENSES.map((l) => (
            <LensSection key={l.id} lens={l} category={cat} me={userId} onOpen={openOnMap} />
          ))}
        </>
      ) : null}
    </ScrollView>
    <StatusScrim />
    </View>
  );
}

function FilterSummary({ parsed }: { parsed: NonNullable<ReturnType<typeof parseQuery>> }) {
  const s = useStyles();
  const bits = [
    parsed.category ? CATEGORY_META[parsed.category].plural : null,
    parsed.near ? `near ${parsed.near.label}` : parsed.nearMe ? 'near you' : null,
    parsed.friendsOnly ? 'saved by friends' : null,
    parsed.text ? `“${parsed.text}”` : null,
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return <Text variant="caption" tone="tertiary" style={s.summary}>Searching {bits.join(' · ')}</Text>;
}

function ResultRow({ r, onPress }: { r: DiscoveryResult; onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const meta = CATEGORY_META[r.category];
  return (
    <PressableScale style={s.row} onPress={onPress} pressedScale={0.99}
      accessibilityLabel={`${r.name}. ${r.reasons.join('. ')}`} accessibilityHint="Shows it on the map">
      <View style={s.rowIcon}><Icon name={meta.symbol} fallback={meta.glyph} size={16} color={colors.ink} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{r.name}</Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>{[meta.short, r.neighborhood].filter(Boolean).join(' · ')}</Text>
        {r.reasons.length > 0 ? <Text variant="caption" tone="thread" numberOfLines={2}>{r.reasons.join(' · ')}</Text> : null}
      </View>
    </PressableScale>
  );
}

function LensSection({ lens, category, me, onOpen }: {
  lens: (typeof LENSES)[number]; category: Category | null; me: string | null; onOpen: (r: DiscoveryResult) => void;
}) {
  const s = useStyles();
  const data = useQuery({
    queryKey: ['discover', lens.id, category ?? 'all'],
    enabled: !!me,
    staleTime: 60_000,
    queryFn: async () => {
      if (lens.id === 'like_you') {
        if (!category) return { results: [], empty: 'Pick a category — taste is compared within one list.' };
        const r = await fetchLikeYou(me!, category);
        const empty = r.reason === 'need_rankings'
          ? `Rank ${3 - r.myRanked} more ${CATEGORY_META[category].plural} to find people with your taste.`
          : 'No one with overlapping rankings yet.';
        return { results: r.results, empty };
      }
      return { results: await fetchLens(lens.id, category), empty: lens.empty };
    },
  });
  return (
    <View style={s.lens}>
      <Text variant="heading" style={s.lensTitle} accessibilityRole="header">
        {lens.title} <Text variant="heading" italic tone="thread" style={s.lensItalic}>{lens.italic}</Text>
      </Text>
      {data.isLoading ? <ActivityIndicator style={{ alignSelf: 'flex-start', marginLeft: GUTTER }} /> :
       data.isError ? <Text variant="caption" tone="secondary" style={s.lensEmpty}>{toUserMessage(data.error)}</Text> :
       (data.data?.results.length ?? 0) === 0 ? <Text variant="caption" tone="secondary" style={s.lensEmpty}>{data.data?.empty}</Text> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cards}>
          {data.data!.results.slice(0, 8).map((r) => (
            <PressableScale key={r.placeId} style={s.card} onPress={() => onOpen(r)} pressedScale={0.97}
              accessibilityLabel={`${r.name}. ${r.reasons.join('. ')}`}>
              <Text variant="caption" tone="secondary">{CATEGORY_META[r.category].short.toUpperCase()}{r.neighborhood ? ` · ${r.neighborhood}` : ''}</Text>
              <Text variant="heading" style={s.cardName} numberOfLines={2}>{r.name}</Text>
              <View style={{ flex: 1 }} />
              {r.reasons.map((x) => <Text key={x} variant="caption" tone="thread" numberOfLines={2}>{x}</Text>)}
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    head: { paddingHorizontal: GUTTER, gap: SPACE.xs },
    searchBox: { marginHorizontal: GUTTER, marginTop: SPACE.lg, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg },
    input: { flex: 1, fontSize: 16, color: c.ink, minHeight: 50 },
    examples: { paddingHorizontal: GUTTER, gap: SPACE.sm, paddingVertical: SPACE.md },
    example: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.capsule, borderWidth: 1, borderColor: c.hairline },
    results: { paddingHorizontal: GUTTER, paddingTop: SPACE.md, gap: SPACE.xs },
    summary: { marginBottom: SPACE.xs },
    notes: { flexDirection: 'row', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.md, backgroundColor: c.surfaceSunk, marginBottom: SPACE.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
    rowIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
    activity: {
      marginHorizontal: GUTTER, marginTop: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
      padding: SPACE.lg, borderRadius: RADIUS.lg, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline,
    },
    chips: { paddingHorizontal: GUTTER, gap: SPACE.sm, paddingVertical: SPACE.lg },
    lens: { marginBottom: SPACE.xl, gap: SPACE.sm },
    lensTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 21, lineHeight: 25, paddingHorizontal: GUTTER },
    lensItalic: { fontFamily: 'Fraunces-Italic', fontSize: 21, lineHeight: 25 },
    lensEmpty: { paddingHorizontal: GUTTER },
    cards: { paddingHorizontal: GUTTER, gap: SPACE.md },
    card: { width: 220, minHeight: 150, padding: SPACE.lg, gap: 4, borderRadius: RADIUS.lg, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    cardName: { fontFamily: 'Fraunces-SemiBold', fontSize: 19, lineHeight: 23 },
  }),
);
