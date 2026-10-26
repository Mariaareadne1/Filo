import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { unwrap, toUserMessage } from '../../lib/errors';
import { useSession } from '../../lib/session';
import { CATEGORIES, CATEGORY_META, type Category } from '../../lib/categories';
import { tasteMatch, type TasteMatch } from '../../lib/tasteMatch';
import { Icon, PressableScale, Text } from '../../design/primitives';
import { StatusScrim } from '../../design/StatusScrim';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';

interface Twin { category: Category; userId: string; username: string; match: TasteMatch }

/** Best visible taste match per category; RLS hides private lists you can't see. */
async function fetchTwins(me: string): Promise<{ twins: Twin[]; myCounts: Record<string, number> }> {
  const rows = unwrap(
    await supabase.from('rankings').select('user_id, place_id, category, position, user:users!inner(username)').limit(5000),
  ) as unknown as { user_id: string; place_id: string; category: Category; position: number; user: { username: string } | { username: string }[] }[];
  const lists = new Map<string, Map<string, number>>();
  const names = new Map<string, string>();
  for (const r of rows) {
    const key = `${r.user_id}|${r.category}`;
    const m = lists.get(key) ?? new Map<string, number>();
    m.set(r.place_id, r.position);
    lists.set(key, m);
    names.set(r.user_id, (Array.isArray(r.user) ? r.user[0] : r.user)?.username ?? '');
  }
  const twins: Twin[] = [];
  const myCounts: Record<string, number> = {};
  for (const c of CATEGORIES) {
    const mine = lists.get(`${me}|${c}`);
    myCounts[c] = mine?.size ?? 0;
    if (!mine) continue;
    let best: Twin | null = null;
    for (const [key, theirs] of lists) {
      const [uid, cat] = key.split('|');
      if (uid === me || cat !== c) continue;
      const m = tasteMatch(mine, theirs);
      if (m.label === 'too_early' || m.similarity <= 0) continue;
      if (!best || m.similarity > best.match.similarity) best = { category: c, userId: uid, username: names.get(uid) ?? '', match: m };
    }
    if (best) twins.push(best);
  }
  return { twins, myCounts };
}

const LABEL = { strong: 'Strong match', promising: 'Promising — needs more shared places', different: 'Opposite taste', too_early: '' } as const;

export function TwinsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const { userId } = useSession();
  const q = useQuery({ queryKey: ['twins', userId], queryFn: () => fetchTwins(userId!), enabled: !!userId });

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={s.root} contentContainerStyle={{ paddingTop: insets.top + SPACE.sm, paddingBottom: clearance }}>
      <PressableScale onPress={() => router.back()} style={s.back} accessibilityLabel="Back">
        <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
        <Text variant="bodyStrong">Back</Text>
      </PressableScale>
      <View style={s.head}>
        <Text variant="title" accessibilityRole="header">Taste <Text variant="title" italic tone="thread">twins</Text></Text>
        <Text variant="callout" tone="secondary">
          People whose rankings line up with yours, list by list. We compare only places you've both ranked, and won't call it a match on thin evidence.
        </Text>
      </View>
      {q.isLoading ? <ActivityIndicator /> : q.isError ? <Text variant="callout" tone="danger" style={s.pad}>{toUserMessage(q.error)}</Text> : (
        CATEGORIES.map((c) => {
          const twin = q.data?.twins.find((t) => t.category === c);
          const mine = q.data?.myCounts[c] ?? 0;
          return (
            <View key={c} style={s.card}>
              <Text variant="caption" tone="secondary" style={s.kicker}>{CATEGORY_META[c].plural.toUpperCase()}</Text>
              {twin ? (
                <PressableScale onPress={() => router.push(`/(app)/user/${twin.userId}`)} accessibilityLabel={`@${twin.username}, ${LABEL[twin.match.label]}, ${twin.match.overlap} shared places`}>
                  <Text variant="heading">@{twin.username}</Text>
                  <Text variant="callout" tone={twin.match.label === 'strong' ? 'thread' : 'secondary'}>
                    {LABEL[twin.match.label]} · {twin.match.overlap} shared
                  </Text>
                </PressableScale>
              ) : (
                <Text variant="callout" tone="secondary">
                  {mine < 3 ? `Rank ${3 - mine} more to compare.` : 'No one with enough overlap yet.'}
                </Text>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
    <StatusScrim />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: GUTTER, minHeight: 44, alignSelf: 'flex-start' },
    head: { paddingHorizontal: GUTTER, gap: SPACE.sm, marginBottom: SPACE.lg },
    pad: { paddingHorizontal: GUTTER },
    kicker: { letterSpacing: 1 },
    card: { marginHorizontal: GUTTER, marginBottom: SPACE.sm, padding: SPACE.lg, gap: 4, borderRadius: RADIUS.lg, backgroundColor: c.surface },
  }),
);
