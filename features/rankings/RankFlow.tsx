import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useRankings } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { CATEGORY_META, normalizeCategory } from '../../lib/categories';
import { nextCompareState, type CompareAnswer } from '../../lib/rankInsert';
import { rerankPlace, type RankedPlace } from '../../lib/api/rankings';
import { toUserMessage } from '../../lib/errors';
import { parseIdParam } from '../../lib/params';
import { qk } from '../../lib/queryClient';
import { Button } from '../../design/controls';
import { PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { FONT, GUTTER, RADIUS, SPACE } from '../../design/tokens';

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
        <Text variant="label" tone="secondary">
          {params.fresh ? 'Saved · ' : ''}Your {meta.plural}
        </Text>
        <Text variant="title" accessibilityRole="header">
          Where does {name} <Text variant="title" italic tone="thread">land</Text>?
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
        <RankReveal rank={rank} name={name} pool={pool} singular={meta.singular} plural={meta.plural} animate={!reduceMotion} />
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
            {steps === 1 ? 'One question' : `About ${steps} questions`}
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

const REVEAL_RISE = 8;
const reveal = (delay: number) => FadeInDown.duration(320).delay(delay).easing(Easing.out(Easing.cubic))
  .withInitialValues({ opacity: 0, transform: [{ translateY: REVEAL_RISE }] });

/** The payoff of ranking: your number, set large, and where it landed in your list. */
function RankReveal({ rank, name, pool, singular, plural, animate }: {
  rank: number; name: string; pool: RankedPlace[]; singular: string; plural: string; animate: boolean;
}) {
  const s = useStyles();
  const total = pool.length + 1;
  const above = rank > 1 ? pool[rank - 2] : null;
  const below = rank <= pool.length ? pool[rank - 1] : null;
  const caption = total === 1
    ? `Your first ranked ${singular}`
    : rank === 1 ? `Your new favorite of ${total} ${plural}` : `of ${total} ${plural}`;
  return (
    <View style={s.result}>
      <Animated.View entering={animate ? reveal(0) : undefined} accessible accessibilityLabel={`Number ${rank}. ${caption}`}>
        <Text tone="thread" style={s.numeral} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1}>{rank}</Text>
        <Text variant="callout" tone="secondary">{caption}</Text>
      </Animated.View>
      <Animated.View entering={animate ? reveal(100) : undefined} style={s.ledger}>
        {above ? <LedgerRow position={rank - 1} name={above.name} /> : null}
        <LedgerRow position={rank} name={name} mine />
        {below ? <LedgerRow position={rank + 1} name={below.name} /> : null}
      </Animated.View>
    </View>
  );
}

function LedgerRow({ position, name, mine }: { position: number; name: string; mine?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.ledgerRow}>
      {mine ? <View style={s.ledgerMark} /> : null}
      <Text variant="count" tone={mine ? 'thread' : 'tertiary'} style={s.ledgerPosition}>{position}</Text>
      <Text variant={mine ? 'bodyStrong' : 'callout'} tone={mine ? 'primary' : 'secondary'} numberOfLines={1} style={{ flex: 1 }}>{name}</Text>
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
    compare: { flex: 1, justifyContent: 'center', gap: SPACE.md },
    choice: {
      minHeight: 120, borderRadius: RADIUS.lg, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
      padding: SPACE.lg, gap: SPACE.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline,
    },
    minor: { alignItems: 'center' },
    result: { flex: 1, justifyContent: 'center', gap: SPACE.xl },
    numeral: { fontFamily: FONT.display, fontSize: 136, lineHeight: 144, letterSpacing: -4, fontVariant: ['tabular-nums'] },
    ledger: { borderRadius: RADIUS.md, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline, overflow: 'hidden' },
    ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 52, paddingHorizontal: SPACE.lg },
    ledgerMark: { position: 'absolute', left: 0, top: SPACE.md, bottom: SPACE.md, width: 2, backgroundColor: c.thread },
    ledgerPosition: { width: 24, fontVariant: ['tabular-nums'] },
    footer: { gap: SPACE.xs },
  }),
);
