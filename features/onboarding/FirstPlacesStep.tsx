import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { CATEGORIES, CATEGORY_META, type Category } from '../../lib/categories';
import { browseNearby, type PlaceCandidate } from '../../lib/search';
import { useSavePin } from '../../lib/hooks';
import { toUserMessage } from '../../lib/errors';
import type { PinStatus } from '../../lib/api/pins';
import { Button, GlassChip } from '../../design/controls';
import { PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

const CAMPUS = { lat: 40.8075, lng: -73.9626 };

/**
 * Step 2/3: build a meaningful first map in under a minute. Pick the kinds
 * of places you care about; we list REAL venues near campus (Mapbox
 * Search Box) and you mark each one "been" or "want to go".
 */
export function FirstPlacesStep() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [picked, setPicked] = useState<Category[]>(['cafe', 'food']);
  const [saved, setSaved] = useState<Record<string, PinStatus>>({});
  const save = useSavePin();

  const suggestions = useQuery({
    queryKey: ['onboarding-nearby', picked.join(',')],
    enabled: picked.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const lists = await Promise.all(picked.map((c) => browseNearby(c, CAMPUS, 5, signal).catch(() => [])));
      return lists.flat();
    },
  });

  const toggle = (c: Category) =>
    setPicked((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const mark = (place: PlaceCandidate, status: PinStatus) => {
    if (saved[place.providerId] === status) return;
    haptic.commit();
    setSaved((m) => ({ ...m, [place.providerId]: status }));
    save.mutate(
      { place, status, impression: null },
      {
        onError: (e) => {
          setSaved((m) => {
            const next = { ...m };
            delete next[place.providerId];
            return next;
          });
          Alert.alert("Couldn't save", toUserMessage(e));
        },
      },
    );
  };

  const count = Object.keys(saved).length;

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.xl }]}>
      <View style={s.head}>
        <Text variant="caption" tone="secondary" style={s.kicker}>STEP 2 OF 3</Text>
        <Text variant="title" accessibilityRole="header">Start with places you <Text variant="title" italic tone="thread">know</Text>.</Text>
        <Text variant="callout" tone="secondary">Real spots near campus. Mark a few — you can search for anything later.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flexGrow: 0 }}>
        {CATEGORIES.map((c) => (
          <GlassChip key={c} label={CATEGORY_META[c].short} symbol={CATEGORY_META[c].symbol} fallback={CATEGORY_META[c].glyph}
            selected={picked.includes(c)} onPress={() => toggle(c)} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 120 }]}>
        {suggestions.isLoading ? <ActivityIndicator style={{ marginTop: SPACE.xl }} /> : null}
        {suggestions.isError || (suggestions.isSuccess && suggestions.data.length === 0 && picked.length > 0) ? (
          <Text variant="callout" tone="secondary" style={{ marginTop: SPACE.lg }}>
            Suggestions aren't available right now. You can skip and search for places from the map.
          </Text>
        ) : null}
        {(suggestions.data ?? []).map((p) => (
          <SuggestionRow key={p.providerId} place={p} status={saved[p.providerId] ?? null} onMark={(st) => mark(p, st)} />
        ))}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + SPACE.md }]}>
        <Button
          label={count > 0 ? `Continue · ${count} saved` : 'Skip for now'}
          kind={count > 0 ? 'primary' : 'secondary'}
          onPress={() => router.push('/onboarding/find-friends')}
          testID="onboarding-places-next"
        />
      </View>
    </View>
  );
}

function SuggestionRow({ place, status, onMark }: { place: PlaceCandidate; status: PinStatus | null; onMark: (s: PinStatus) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const opt = (value: PinStatus, label: string) => {
    const on = status === value;
    return (
      <PressableScale onPress={() => onMark(value)} accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={`${label}: ${place.name}`}
        style={[s.opt, on && { backgroundColor: colors.thread, borderColor: colors.thread }]}>
        <Text variant="label" style={{ color: on ? colors.onThread : colors.ink }}>{label}</Text>
      </PressableScale>
    );
  };
  return (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{place.name}</Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {[CATEGORY_META[place.category].short, place.neighborhood].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {opt('visited', 'Been')}
      {opt('want_to_go', 'Want')}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    head: { paddingHorizontal: GUTTER, gap: SPACE.sm, marginBottom: SPACE.md },
    kicker: { letterSpacing: 1 },
    chips: { paddingHorizontal: GUTTER, gap: SPACE.sm },
    list: { paddingHorizontal: GUTTER, paddingTop: SPACE.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
    opt: { minHeight: 36, minWidth: 58, paddingHorizontal: SPACE.md, borderRadius: RADIUS.capsule, borderWidth: 1, borderColor: c.hairline, alignItems: 'center', justifyContent: 'center' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: GUTTER, paddingTop: SPACE.md, backgroundColor: c.bg },
  }),
);
