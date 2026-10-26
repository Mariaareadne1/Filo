import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useRankings } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { CATEGORY_META, normalizeCategory } from '../../lib/categories';
import { nextCompareState, type CompareAnswer } from '../../lib/rankInsert';
import { rerankPlace } from '../../lib/api/rankings';
import { toUserMessage } from '../../lib/errors';
import { parseIdParam } from '../../lib/params';
import { qk } from '../../lib/queryClient';
import { Button } from '../../design/controls';
import { PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

/**
 * Rank a place inside one of your lists by answering "which did you like
 * more?" against a midpoint item — binary search, ~log2(n) taps
 * (lib/rankInsert, unit-tested). The place itself is excluded from the pool,
 * so re-ranking never compares a place against itself.
 */
export function RankFlow() {
  const s = useStyles();
  const { reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ placeId?: string; category?: string; name?: string; fresh?: string }>();
  const placeId = parseIdParam(params.placeId);
  const category = normalizeCategory(params.category) ?? 'food';
  const name = typeof params.name === 'string' ? params.name : 'this place';
  const { userId } = useSession();
  const list = useRankings(userId, category);

  const pool = useMemo(() => (list.data ?? []).filter((r) => r.placeId !== placeId), [list.data, placeId]);
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!list.isSuccess || hi !== null) return;
    if (pool.length === 0) setRank(1);
    else setHi(pool.length);
  }, [list.isSuccess, pool.length, hi]);

  const meta = CATEGORY_META[category];
  const steps = Math.max(1, Math.ceil(Math.log2(pool.length + 1)));
  const done = rank !== null;
  const mid = hi !== null ? Math.floor((lo + hi) / 2) : 0;
  const rival = pool[mid];

  const finish = () => router.dismissTo({ pathname: '/(app)/map', params: placeId ? { place: placeId } : {} });

  if (!placeId) {
    return <View style={[s.root, s.center]}><Text variant="heading">Nothing to rank.</Text></View>;
  }

  const answer = (a: CompareAnswer) => {
    if (hi === null) return;
    haptic.select();
    const res = nextCompareState(lo, hi, a);
    if (res.done) setRank(res.rank);
    else { setLo(res.window.lo); setHi(res.window.hi); }
  };

  const save = async () => {
    if (rank === null) return;
    setSaving(true);
    try {
      await rerankPlace(placeId, category, rank);
      haptic.commit();
      qc.invalidateQueries({ queryKey: qk.rankingsAll });
      qc.invalidateQueries({ queryKey: qk.place(placeId) });
      qc.invalidateQueries({ queryKey: qk.pinsAll });
      finish();
    } catch (e) {
      Alert.alert("Couldn't save your ranking", toUserMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const entering = reduceMotion ? undefined : FadeIn.duration(220);
  const exiting = reduceMotion ? undefined : FadeOut.duration(120);

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.lg, paddingBottom: insets.bottom + SPACE.lg }]}>
      <View style={s.header}>
        <Text variant="caption" tone="secondary" style={s.kicker}>
          {params.fresh ? 'SAVED · ' : ''}RANK IN YOUR {meta.plural.toUpperCase()}
        </Text>
        <Text variant="title" accessibilityRole="header">
          Where does <Text variant="title" italic tone="thread">{name}</Text> land?
        </Text>
      </View>

      {list.isLoading ? (
        <View style={s.center}><ActivityIndicator /></View>
      ) : list.isError ? (
        <View style={s.center}>
          <Text variant="callout" tone="secondary">{toUserMessage(list.error)}</Text>
          <Button kind="secondary" label="Try again" onPress={() => list.refetch()} style={{ marginTop: SPACE.md }} />
        </View>
      ) : done ? (
        <Animated.View entering={entering} style={s.result}>
          <Text variant="count" tone="secondary">YOUR {meta.plural.toUpperCase()}</Text>
          <Text variant="hero" tone="thread" accessibilityLabel={`Number ${rank} of ${pool.length + 1}`}>
            #{rank}<Text variant="title" tone="tertiary"> / {pool.length + 1}</Text>
          </Text>
          <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            {pool.length === 0
              ? `Your first ranked ${meta.singular}. The list starts here.`
              : rank === 1
                ? `Above ${pool[0].name} — your new favorite.`
                : `Just below ${pool[rank - 2].name}.`}
          </Text>
        </Animated.View>
      ) : rival ? (
        <Animated.View key={rival.placeId} entering={entering} exiting={exiting} style={s.compare}>
          <Text variant="heading" style={{ textAlign: 'center' }}>Which did you like more?</Text>
          <Choice title={name} subtitle="the one you're ranking" onPress={() => answer('better')} accent testID="rank-better" />
          <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>or</Text>
          <Choice title={rival.name} subtitle={`#${rival.position} · ${rival.neighborhood ?? rival.address}`} onPress={() => answer('worse')} testID="rank-worse" />
          <View style={s.minor}>
            <Button kind="quiet" label="Too close to call" onPress={() => answer('tie')} />
          </View>
          <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
            About {steps} {steps === 1 ? 'question' : 'questions'} in total
          </Text>
        </Animated.View>
      ) : null}

      <View style={s.footer}>
        {done ? (
          <>
            <Button label="Save ranking" onPress={save} busy={saving} testID="rank-save" />
            {pool.length > 0 ? (
              <Button kind="quiet" label="Start over" onPress={() => { setRank(null); setLo(0); setHi(pool.length); }} />
            ) : null}
          </>
        ) : (
          <Button kind="quiet" label="Skip for now" onPress={finish} />
        )}
      </View>
    </View>
  );
}

function Choice({ title, subtitle, onPress, accent, testID }: { title: string; subtitle: string; onPress: () => void; accent?: boolean; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} testID={testID} accessibilityLabel={`${title}, ${subtitle}`}
      style={[s.choice, accent && { borderColor: colors.thread, borderWidth: 1.5 }]}>
      <Text variant="placeName" numberOfLines={2} style={{ textAlign: 'center' }}>{title}</Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>{subtitle}</Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, paddingHorizontal: GUTTER },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { gap: SPACE.sm },
    kicker: { letterSpacing: 0.8 },
    compare: { flex: 1, justifyContent: 'center', gap: SPACE.md },
    choice: {
      minHeight: 120, borderRadius: RADIUS.lg, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
      padding: SPACE.lg, gap: SPACE.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline,
    },
    minor: { alignItems: 'center' },
    result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg },
    footer: { gap: SPACE.xs },
  }),
);
