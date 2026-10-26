import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  useBoards, useFollowRequests, useFollowState, useProfile, useRankingSummary, useSetPrivacy, useToggleFollow, useUserPins,
} from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { CATEGORY_META } from '../../lib/categories';
import { computeStreak } from '../../lib/streak';
import { toUserMessage } from '../../lib/errors';
import type { PinRow } from '../../lib/api/pins';
import { Button, GlassIconButton, GlassSegmented } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { StatusScrim } from '../../design/StatusScrim';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';
import { BoardCover } from '../boards/BoardCover';

type PlacesTab = 'visited' | 'want_to_go';

/** One profile view for yourself and for others; privacy gates everything server-side. */
export function ProfileView({ userId }: { userId: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const clearance = useDockClearance();
  const { userId: me } = useSession();
  const isOwn = userId === me;

  const profile = useProfile(userId);
  const pins = useUserPins(userId);
  const ranks = useRankingSummary(userId);
  const boards = useBoards(isOwn ? userId : null);
  const requests = useFollowRequests();
  const followState = useFollowState(isOwn ? null : userId);
  const toggleFollow = useToggleFollow(userId);
  const setPrivacy = useSetPrivacy();
  const [tab, setTab] = useState<PlacesTab>('visited');

  const p = profile.data;
  const list = useMemo(() => (pins.data ?? []).filter((x) => x.status === tab), [pins.data, tab]);
  const streak = useMemo(() => computeStreak(pins.data ?? []), [pins.data]);
  const pendingCount = isOwn ? requests.data?.length ?? 0 : 0;
  const state = followState.data ?? 'none';
  // RLS hides a private account's pins from non-followers; reflect that honestly.
  const locked = !isOwn && !!p?.is_private && state !== 'active';

  if (profile.isLoading) return <View style={[s.root, s.center]}><ActivityIndicator color={colors.thread} /></View>;
  if (!p) {
    return (
      <View style={[s.root, s.center]}>
        <Text variant="heading">{profile.isError ? toUserMessage(profile.error) : 'This profile isn’t available.'}</Text>
      </View>
    );
  }

  const refresh = () => Promise.all([profile.refetch(), pins.refetch(), ranks.refetch(), boards.refetch(), requests.refetch()]);

  const onFollow = () => {
    haptic.select();
    toggleFollow.mutate(state, { onError: (e) => Alert.alert("Couldn't update", toUserMessage(e)) });
  };

  const signOut = () =>
    Alert.alert('Sign out of Filo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top + SPACE.md, paddingBottom: clearance + SPACE.lg }}
      refreshControl={<RefreshControl refreshing={profile.isRefetching} onRefresh={refresh} tintColor={colors.thread} />}
    >
      <View style={s.topBar}>
        {!isOwn ? (
          <PressableScale onPress={() => router.back()} style={s.back} accessibilityLabel="Back">
            <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
            <Text variant="bodyStrong">Back</Text>
          </PressableScale>
        ) : <View />}
        <GlassIconButton symbol="square.and.arrow.up" fallback="↑" label="Share profile"
          onPress={() => Share.share({ message: `@${p.username} on Filo — the map their friends would draw.` })} />
      </View>

      {/* Header */}
      <View style={s.header}>
        {p.avatar_url ? (
          <Image source={{ uri: p.avatar_url }} style={s.avatar} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}><Text variant="title" tone="thread">{p.display_name.slice(0, 1).toUpperCase()}</Text></View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" numberOfLines={2} accessibilityRole="header">{p.display_name}</Text>
          <View style={s.handleRow}>
            <Text variant="callout" tone="secondary">@{p.username}</Text>
            {p.is_private ? <Icon name="lock.fill" fallback="🔒" size={12} color={colors.inkTertiary} /> : null}
          </View>
        </View>
      </View>

      <View style={s.stats}>
        <Stat value={p.pins} label="places" />
        <Stat value={p.followers} label="followers" onPress={locked ? undefined : () => router.push({ pathname: '/(app)/follow-list', params: { userId, mode: 'followers' } })} />
        <Stat value={p.following} label="following" onPress={locked ? undefined : () => router.push({ pathname: '/(app)/follow-list', params: { userId, mode: 'following' } })} />
        {isOwn && streak > 0 ? <Stat value={streak} label="week streak" /> : null}
      </View>

      {!isOwn ? (
        <View style={s.section}>
          <Button
            label={state === 'active' ? 'Following' : state === 'pending' ? 'Requested' : p.is_private ? 'Request to follow' : 'Follow'}
            kind={state === 'none' ? 'primary' : 'secondary'}
            onPress={onFollow}
            busy={toggleFollow.isPending}
            accessibilityHint={state !== 'none' ? 'Tap to unfollow or cancel the request' : undefined}
            testID="profile-follow"
          />
        </View>
      ) : null}

      {pendingCount > 0 ? (
        <PressableScale style={s.banner} onPress={() => router.push('/(app)/requests')} accessibilityLabel={`${pendingCount} follow requests`}>
          <Icon name="person.badge.plus" fallback="+" size={18} color={colors.thread} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>{pendingCount} follow {pendingCount === 1 ? 'request' : 'requests'}</Text>
          <Icon name="chevron.right" fallback="›" size={14} color={colors.inkTertiary} />
        </PressableScale>
      ) : null}

      {locked ? (
        <View style={s.locked}>
          <Icon name="lock" fallback="🔒" size={26} color={colors.inkTertiary} />
          <Text variant="heading">This account is private</Text>
          <Text variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            {state === 'pending' ? 'Your request is waiting for approval.' : 'Follow to request access to their places and rankings.'}
          </Text>
        </View>
      ) : (
        <>
          {/* Rankings */}
          <SectionHead title="Rankings" action={isOwn ? 'Taste twins' : undefined} onAction={isOwn ? () => router.push('/(app)/twins') : undefined} />
          {ranks.data && ranks.data.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rankRow}>
              {ranks.data.map((r) => (
                <PressableScale key={r.category} style={s.rankCard}
                  onPress={() => router.push({ pathname: '/(app)/rankings', params: { userId, category: r.category } })}
                  accessibilityLabel={`${CATEGORY_META[r.category].plural}, ${r.count} ranked. Top: ${r.top[0] ?? ''}`}>
                  <View style={s.rankHead}>
                    <Icon name={CATEGORY_META[r.category].symbol} fallback={CATEGORY_META[r.category].glyph} size={14} color={colors.thread} />
                    <Text variant="label" tone="secondary">{CATEGORY_META[r.category].plural} · {r.count}</Text>
                  </View>
                  {r.top.map((name, i) => (
                    <Text key={`${name}${i}`} variant="callout" numberOfLines={1}>
                      <Text variant="count" tone={i === 0 ? 'thread' : 'tertiary'}>{i + 1} </Text>{name}
                    </Text>
                  ))}
                </PressableScale>
              ))}
            </ScrollView>
          ) : (
            <Text variant="callout" tone="secondary" style={s.pad}>
              {isOwn ? 'Rank places you’ve been and your lists appear here.' : 'No rankings yet.'}
            </Text>
          )}

          {/* Boards (own) */}
          {isOwn ? (
            <>
              <SectionHead title="Boards" action="See all" onAction={() => router.navigate('/(app)/boards')} />
              {boards.data && boards.data.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rankRow}>
                  {boards.data.slice(0, 8).map((b) => (
                    <PressableScale key={b.id} style={s.boardCard} onPress={() => router.push(`/(app)/board/${b.id}`)} accessibilityLabel={`${b.name}, ${b.pinCount} places`}>
                      <BoardCover covers={b.covers} categories={b.categories} name={b.name} height={96} />
                      <Text variant="label" numberOfLines={1} style={s.boardName}>{b.name}</Text>
                    </PressableScale>
                  ))}
                </ScrollView>
              ) : (
                <Text variant="callout" tone="secondary" style={s.pad}>No boards yet.</Text>
              )}
            </>
          ) : null}

          {/* Places */}
          <SectionHead title="Places" />
          <View style={s.pad}>
            <GlassSegmented value={tab} onChange={setTab} accessibilityLabel="Which places"
              options={[{ value: 'visited', label: 'Been' }, { value: 'want_to_go', label: 'Want to go' }]} />
          </View>
          <View style={s.places}>
            {pins.isLoading ? <ActivityIndicator /> : list.length === 0 ? (
              <Text variant="callout" tone="secondary">{tab === 'visited' ? 'Nothing marked as been yet.' : 'No saved places yet.'}</Text>
            ) : list.slice(0, 40).map((pin) => <PlaceRow key={pin.id} pin={pin} />)}
          </View>
        </>
      )}

      {isOwn ? (
        <>
          <SectionHead title="Settings" />
          <View style={s.settings}>
            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Private account</Text>
                <Text variant="caption" tone="secondary">Only approved followers see your places and rankings.</Text>
              </View>
              <Switch value={p.is_private} trackColor={{ true: colors.thread }} disabled={setPrivacy.isPending}
                accessibilityLabel="Private account"
                onValueChange={(v) => setPrivacy.mutate(v, { onError: (e) => Alert.alert("Couldn't update", toUserMessage(e)) })} />
            </View>
            <PressableScale style={s.settingRow} onPress={() => router.push('/(app)/wrapped')} accessibilityLabel="Your year in Filo">
              <Text variant="bodyStrong" style={{ flex: 1 }}>Your year in Filo</Text>
              <Icon name="chevron.right" fallback="›" size={14} color={colors.inkTertiary} />
            </PressableScale>
            <PressableScale style={s.settingRow} onPress={signOut} accessibilityLabel="Sign out">
              <Text variant="bodyStrong" tone="danger" style={{ flex: 1 }}>Sign out</Text>
            </PressableScale>
          </View>
        </>
      ) : null}
    </ScrollView>
    <StatusScrim />
    </View>
  );
}

function Stat({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  const s = useStyles();
  const body = (
    <>
      <Text variant="heading">{value}</Text>
      <Text variant="caption" tone="secondary">{label}</Text>
    </>
  );
  if (!onPress) {
    return <View style={s.stat} accessible accessibilityLabel={`${value} ${label}`}>{body}</View>;
  }
  return (
    <PressableScale onPress={onPress} style={s.stat} accessibilityLabel={`${value} ${label}`}>{body}</PressableScale>
  );
}

function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const s = useStyles();
  return (
    <View style={s.sectionHead}>
      <Text variant="caption" tone="secondary" style={s.sectionTitle} accessibilityRole="header">{title.toUpperCase()}</Text>
      {action && onAction ? (
        <PressableScale onPress={onAction} accessibilityLabel={action}><Text variant="label" tone="thread">{action}</Text></PressableScale>
      ) : null}
    </View>
  );
}

function PlaceRow({ pin }: { pin: PinRow }) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const meta = CATEGORY_META[pin.place.category];
  return (
    <PressableScale style={s.placeRow} onPress={() => router.navigate({ pathname: '/(app)/map', params: { place: pin.place_id } })}
      accessibilityLabel={`${pin.place.name}, ${meta.short}`} accessibilityHint="Shows it on the map">
      <View style={s.placeIcon}><Icon name={meta.symbol} fallback={meta.glyph} size={15} color={colors.ink} /></View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{pin.place.name}</Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {pin.impression ? `“${pin.impression}”` : pin.place.neighborhood ?? pin.place.address}
        </Text>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    pad: { paddingHorizontal: GUTTER },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: GUTTER },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
    header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: GUTTER, marginTop: SPACE.md },
    avatar: { width: 72, height: 72, borderRadius: 36 },
    avatarFallback: { backgroundColor: c.threadSoft, alignItems: 'center', justifyContent: 'center' },
    handleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stats: { flexDirection: 'row', paddingHorizontal: GUTTER, marginTop: SPACE.lg, gap: SPACE.xl },
    stat: { alignItems: 'flex-start', minHeight: 44, justifyContent: 'center' },
    section: { paddingHorizontal: GUTTER, marginTop: SPACE.lg },
    banner: {
      marginHorizontal: GUTTER, marginTop: SPACE.lg, flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
      padding: SPACE.lg, borderRadius: RADIUS.md, backgroundColor: c.threadSoft,
    },
    locked: { alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xxxl, paddingHorizontal: SPACE.xxl },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: GUTTER, marginTop: SPACE.xxl, marginBottom: SPACE.sm },
    sectionTitle: { letterSpacing: 0.8 },
    rankRow: { paddingHorizontal: GUTTER, gap: SPACE.md },
    rankCard: { width: 210, padding: SPACE.lg, gap: 4, borderRadius: RADIUS.lg, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    rankHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    boardCard: { width: 150, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: c.surface },
    boardName: { padding: SPACE.sm },
    places: { paddingHorizontal: GUTTER, marginTop: SPACE.md, gap: 2 },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 56 },
    placeIcon: { width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
    settings: { marginHorizontal: GUTTER, borderRadius: RADIUS.lg, backgroundColor: c.surface, overflow: 'hidden' },
    settingRow: {
      flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 56, paddingHorizontal: SPACE.lg,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline,
    },
  }),
);
