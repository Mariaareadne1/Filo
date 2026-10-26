import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { usePeopleSearch } from '../../lib/hooks';
import { follow, unfollow } from '../../lib/api/social';
import type { PersonRef } from '../../lib/api/pins';
import { toUserMessage, unwrap } from '../../lib/errors';
import { useOnboarding } from '../../contexts/onboarding';
import { Button } from '../../design/controls';
import { PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

/** People who actually have places on Filo, most active first. Real users only. */
async function fetchSuggestedPeople(me: string): Promise<(PersonRef & { pins: number })[]> {
  const rows = unwrap(
    await supabase.from('users').select('id, username, display_name, avatar_url, pins(count)').neq('id', me).limit(40),
  ) as unknown as (PersonRef & { pins: { count: number }[] })[];
  return rows
    .map((r) => ({ ...r, pins: r.pins?.[0]?.count ?? 0 }))
    .filter((r) => r.pins > 0)
    .sort((a, b) => b.pins - a.pins)
    .slice(0, 20);
}

/** Step 3/3: follow people, opt in to notifications, finish. */
export function FindFriendsStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useSession();
  const { setOnboardingComplete } = useOnboarding();
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState<Record<string, 'active' | 'pending'>>({});
  const [finishing, setFinishing] = useState(false);

  const suggested = useQuery({ queryKey: ['onboarding-people'], queryFn: () => fetchSuggestedPeople(userId!), enabled: !!userId });
  // Reflect follows that already exist (e.g. returning to this step).
  const existing = useQuery({
    queryKey: ['onboarding-existing-follows', userId],
    enabled: !!userId,
    queryFn: async () => unwrap(await supabase.from('follows').select('following_id, status').eq('follower_id', userId!)) as { following_id: string; status: 'active' | 'pending' }[],
  });
  useEffect(() => {
    if (!existing.data) return;
    setFollowing((m) => ({ ...Object.fromEntries(existing.data.map((f) => [f.following_id, f.status])), ...m }));
  }, [existing.data]);
  const search = usePeopleSearch(query);
  const data: PersonRef[] = query.trim().length >= 2 ? search.data ?? [] : suggested.data ?? [];

  const toggle = async (p: PersonRef) => {
    if (!userId) return;
    haptic.select();
    try {
      if (following[p.id]) {
        await unfollow(userId, p.id);
        setFollowing((m) => { const n = { ...m }; delete n[p.id]; return n; });
      } else {
        const state = await follow(userId, p.id);
        if (state !== 'none') setFollowing((m) => ({ ...m, [p.id]: state }));
      }
    } catch (e) {
      Alert.alert("Couldn't update", toUserMessage(e));
    }
  };

  const finish = async () => {
    if (!userId) return;
    setFinishing(true);
    try {
      // Contextual permission ask: they now have people whose activity matters.
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status === 'undetermined' && Object.keys(following).length > 0) {
        await Notifications.requestPermissionsAsync().catch(() => undefined);
      }
      unwrap(await supabase.from('users').update({ onboarding_complete: true }).eq('id', userId).select('id').single());
      setOnboardingComplete(true);
      router.replace('/(app)/map');
    } catch (e) {
      Alert.alert("Couldn't finish setup", toUserMessage(e));
    } finally {
      setFinishing(false);
    }
  };

  const count = Object.keys(following).length;

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.xl }]}>
      <View style={s.head}>
        <Text variant="caption" tone="secondary" style={s.kicker}>STEP 3 OF 3</Text>
        <Text variant="title" accessibilityRole="header">Follow your <Text variant="title" italic tone="thread">people</Text>.</Text>
        <Text variant="callout" tone="secondary">Their places show up on your map. Private accounts approve requests first.</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or @username"
          placeholderTextColor={colors.inkTertiary} autoCapitalize="none" autoCorrect={false}
          style={s.input} accessibilityLabel="Search people" />
      </View>
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          suggested.isLoading || search.isFetching ? <ActivityIndicator style={{ marginTop: SPACE.xl }} /> : (
            <Text variant="callout" tone="secondary" style={{ marginTop: SPACE.lg }}>
              {query.trim().length >= 2
                ? 'No one by that name yet.'
                : "You're early — no one else has places here yet. Invite a friend, and their map will appear on yours."}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const state = following[item.id];
          return (
            <View style={s.row}>
              <View style={s.avatar}><Text variant="label">{item.display_name.slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{item.display_name}</Text>
                <Text variant="caption" tone="secondary">@{item.username}</Text>
              </View>
              <PressableScale onPress={() => toggle(item)}
                accessibilityLabel={state ? `Unfollow @${item.username}` : `Follow @${item.username}`}
                style={[s.follow, !state && { backgroundColor: colors.thread, borderColor: colors.thread }]}>
                <Text variant="label" style={{ color: state ? colors.ink : colors.onThread }}>
                  {state === 'pending' ? 'Requested' : state ? 'Following' : 'Follow'}
                </Text>
              </PressableScale>
            </View>
          );
        }}
      />
      <View style={[s.footer, { paddingBottom: insets.bottom + SPACE.md }]}>
        <Button label={count > 0 ? 'Open my map' : 'Skip — open my map'} onPress={finish} busy={finishing} testID="onboarding-finish" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    head: { paddingHorizontal: GUTTER, gap: SPACE.sm },
    kicker: { letterSpacing: 1 },
    input: { marginTop: SPACE.md, height: 46, borderRadius: RADIUS.md, backgroundColor: c.surfaceSunk, paddingHorizontal: SPACE.lg, fontSize: 16, color: c.ink },
    list: { paddingHorizontal: GUTTER, paddingTop: SPACE.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 64 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
    follow: { minHeight: 36, paddingHorizontal: SPACE.lg, borderRadius: RADIUS.capsule, borderWidth: 1, borderColor: c.hairline, alignItems: 'center', justifyContent: 'center' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: GUTTER, paddingTop: SPACE.md, backgroundColor: c.bg },
  }),
);
