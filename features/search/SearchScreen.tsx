import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { isPlaceSearchAvailable, newSearchSession, resolvePlace, suggestPlaces, type PlaceSuggestion } from '../../lib/search';
import { searchKnownPlaces, type PersonRef, type PlaceRow } from '../../lib/api/pins';
import { usePeopleSearch } from '../../lib/hooks';
import { CATEGORY_META } from '../../lib/categories';
import { toUserMessage } from '../../lib/errors';
import { clearRecentSearches, loadRecentSearches, rememberSearch } from '../../lib/recentSearches';
import { Glass } from '../../design/Glass';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

type Row =
  | { kind: 'known'; place: PlaceRow }
  | { kind: 'person'; person: PersonRef }
  | { kind: 'new'; s: PlaceSuggestion }
  | { kind: 'recent'; term: string };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * One search for the whole app: places already on Filo (with your friends'
 * context), people, and new venues from the place provider. Picking a known
 * place opens it on the map; picking a new venue opens the save screen.
 */
export function SearchScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const input = useRef<TextInput>(null);
  const session = useRef(newSearchSession());
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const q = useDebounced(query.trim(), 250);

  useEffect(() => { loadRecentSearches().then(setRecent); }, []);

  const known = useQuery({ queryKey: ['search-known', q], queryFn: () => searchKnownPlaces(q), enabled: q.length >= 2, staleTime: 30_000 });
  const people = usePeopleSearch(q);
  const fresh = useQuery({
    queryKey: ['search-new', q],
    queryFn: ({ signal }) => suggestPlaces(q, session.current, signal),
    enabled: q.length >= 2 && isPlaceSearchAvailable(),
    staleTime: 60_000,
    retry: 1,
  });

  const sections = useMemo(() => {
    if (q.length < 2) {
      return recent.length ? [{ key: 'recent', title: 'Recent', data: recent.map((term): Row => ({ kind: 'recent', term })) }] : [];
    }
    const knownIds = new Set((known.data ?? []).map((p) => p.google_place_id));
    const out: { key: string; title: string; data: Row[] }[] = [];
    if (known.data?.length) out.push({ key: 'known', title: 'On Filo', data: known.data.map((place) => ({ kind: 'known', place })) });
    if (people.data?.length) out.push({ key: 'people', title: 'People', data: people.data.slice(0, 5).map((person) => ({ kind: 'person', person })) });
    const newOnes = (fresh.data ?? []).filter((x) => !knownIds.has(x.providerId));
    if (newOnes.length) out.push({ key: 'new', title: 'Add a new place', data: newOnes.map((x) => ({ kind: 'new', s: x })) });
    return out;
  }, [q, recent, known.data, people.data, fresh.data]);

  const loading = q.length >= 2 && (known.isFetching || fresh.isFetching || people.isFetching);
  const providerError = fresh.isError ? toUserMessage(fresh.error, 'New-place search is unavailable right now.') : null;
  const empty = q.length >= 2 && !loading && sections.length === 0;

  const choose = async (row: Row) => {
    haptic.select();
    if (row.kind === 'recent') { setQuery(row.term); return; }
    setRecent(await rememberSearch(q));
    if (row.kind === 'known') {
      Keyboard.dismiss();
      router.dismissTo({ pathname: '/(app)/map', params: { place: row.place.id } });
      return;
    }
    if (row.kind === 'person') {
      router.dismissTo(`/(app)/user/${row.person.id}`);
      return;
    }
    setResolving(row.s.providerId);
    setResolveError(null);
    try {
      const candidate = await resolvePlace(row.s, session.current);
      if (!candidate) throw new Error('not found');
      session.current = newSearchSession(); // session ends at retrieve
      router.push({ pathname: '/pin/save', params: { candidate: JSON.stringify(candidate) } });
    } catch (e) {
      setResolveError(toUserMessage(e, "Couldn't open that place. Try again."));
    } finally {
      setResolving(null);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.sm }]}>
      <View style={s.bar}>
        <Glass style={s.field}>
          <Icon name="magnifyingglass" fallback="⌕" size={17} color={colors.inkSecondary} />
          <TextInput
            ref={input}
            autoFocus
            value={query}
            onChangeText={(t) => { setQuery(t); setResolveError(null); }}
            placeholder="Places, vibes, friends"
            placeholderTextColor={colors.inkTertiary}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={s.input}
            accessibilityLabel="Search"
            testID="search-input"
          />
          {loading ? <ActivityIndicator size="small" color={colors.inkSecondary} /> : null}
        </Glass>
        <PressableScale onPress={() => router.back()} accessibilityLabel="Cancel search" hitSlop={8} testID="search-cancel">
          <Text variant="bodyStrong" tone="thread">Cancel</Text>
        </PressableScale>
      </View>

      {resolveError || providerError ? (
        <Text variant="callout" tone="danger" style={s.error} accessibilityLiveRegion="polite">{resolveError ?? providerError}</Text>
      ) : null}

      <SectionList
        sections={sections}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.list}
        stickySectionHeadersEnabled={false}
        keyExtractor={(row, i) => (row.kind === 'known' ? row.place.id : row.kind === 'person' ? row.person.id : row.kind === 'new' ? row.s.providerId : `r${i}`)}
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHead}>
            <Text variant="caption" tone="secondary" style={s.sectionTitle}>{section.title.toUpperCase()}</Text>
            {section.key === 'recent' ? (
              <PressableScale onPress={async () => { await clearRecentSearches(); setRecent([]); }} accessibilityLabel="Clear recent searches">
                <Text variant="caption" tone="thread">Clear</Text>
              </PressableScale>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => <ResultRow row={item} busy={item.kind === 'new' && resolving === item.s.providerId} onPress={() => choose(item)} />}
        ListEmptyComponent={
          empty ? (
            <View style={s.empty}>
              <Text variant="heading">No matches for “{q}”</Text>
              <Text variant="callout" tone="secondary">Try the venue's name, or a neighborhood like “Morningside”.</Text>
            </View>
          ) : q.length < 2 && recent.length === 0 ? (
            <View style={s.empty}>
              <Text variant="callout" tone="secondary">Search for a cafe, a bar, a friend — or a neighborhood.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function ResultRow({ row, onPress, busy }: { row: Row; onPress: () => void; busy: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  if (row.kind === 'recent') {
    return (
      <PressableScale style={s.row} onPress={onPress} accessibilityLabel={`Search ${row.term}`}>
        <Icon name="clock.arrow.circlepath" fallback="↺" size={16} color={colors.inkTertiary} />
        <Text variant="body" style={s.rowMain}>{row.term}</Text>
      </PressableScale>
    );
  }
  if (row.kind === 'person') {
    return (
      <PressableScale style={s.row} onPress={onPress} accessibilityLabel={`@${row.person.username}, ${row.person.display_name}`}>
        <View style={s.badge}><Text variant="label">{row.person.display_name.slice(0, 1).toUpperCase()}</Text></View>
        <View style={s.rowMain}>
          <Text variant="bodyStrong">{row.person.display_name}</Text>
          <Text variant="caption" tone="secondary">@{row.person.username}</Text>
        </View>
      </PressableScale>
    );
  }
  const name = row.kind === 'known' ? row.place.name : row.s.name;
  const sub = row.kind === 'known'
    ? [row.place.neighborhood, row.place.address].filter(Boolean).join(' · ')
    : [row.s.neighborhood, row.s.address].filter(Boolean).join(' · ');
  const cat = row.kind === 'known' ? row.place.category : row.s.category;
  const meta = cat ? CATEGORY_META[cat] : null;
  return (
    <PressableScale style={s.row} onPress={onPress} disabled={busy} accessibilityLabel={`${name}, ${sub}`}
      accessibilityHint={row.kind === 'new' ? 'Opens a screen to save this place' : 'Shows this place on the map'}>
      <View style={[s.badge, row.kind === 'known' && { backgroundColor: colors.threadSoft }]}>
        <Icon name={meta?.symbol ?? 'mappin'} fallback={meta?.glyph ?? '•'} size={15} color={row.kind === 'known' ? colors.thread : colors.ink} />
      </View>
      <View style={s.rowMain}>
        <Text variant="bodyStrong" numberOfLines={1}>{name}</Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>{sub}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.thread} /> : <Icon name={row.kind === 'new' ? 'plus.circle' : 'chevron.right'} fallback="›" size={16} color={colors.inkTertiary} />}
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    bar: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: GUTTER },
    field: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg },
    input: { flex: 1, fontSize: 17, color: c.ink, height: '100%' },
    error: { paddingHorizontal: GUTTER, paddingTop: SPACE.sm },
    list: { paddingHorizontal: GUTTER, paddingBottom: 60 },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: SPACE.xl, paddingBottom: SPACE.sm },
    sectionTitle: { letterSpacing: 0.8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 56, paddingVertical: SPACE.sm },
    rowMain: { flex: 1, gap: 1 },
    badge: { width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
    empty: { paddingTop: SPACE.xxl, gap: SPACE.sm },
  }),
);
