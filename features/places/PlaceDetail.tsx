import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useDeletePin, usePlaceDetail, useSavePin, useUpdatePin } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { CATEGORY_META } from '../../lib/categories';
import { placePhotoUrl } from '../../lib/search';
import { toUserMessage } from '../../lib/errors';
import type { PinRow, PinStatus } from '../../lib/api/pins';
import type { PlaceRank } from '../../lib/api/rankings';
import { useUploads } from '../../contexts/UploadContext';
import { Button } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { RADIUS, SPACE } from '../../design/tokens';
import { openDirections, sharePlace } from './placeLinks';

const MAX_NOTE = 150;

interface Props {
  placeId: string;
  onRemoved: () => void;
}

export function PlaceDetail({ placeId, onRemoved }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { userId } = useSession();
  const detail = usePlaceDetail(placeId);
  const save = useSavePin();
  const update = useUpdatePin(placeId);
  const remove = useDeletePin(placeId);
  const { startUpload, uploads } = useUploads();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const place = detail.data?.place ?? null;
  const pins = useMemo(() => detail.data?.pins ?? [], [detail.data]);
  const mine = pins.find((p) => p.user_id === userId) ?? null;
  const others = pins.filter((p) => p.user_id !== userId);
  const ranks = useMemo(() => detail.data?.ranks ?? [], [detail.data]);
  const myRank = ranks.find((r) => r.userId === userId) ?? null;
  const rankByUser = useMemo(() => new Map(ranks.map((r) => [r.userId, r])), [ranks]);
  const photos = useMemo(() => {
    const list = pins.map((p) => p.photo_url).filter((u): u is string => !!u);
    if (place?.photo_url) list.push(place.photo_url);
    return Array.from(new Set(list)).slice(0, 8);
  }, [pins, place]);

  if (detail.isLoading) {
    return <View style={s.center}><ActivityIndicator color={colors.thread} /></View>;
  }
  if (detail.isError || !place) {
    return (
      <View style={s.center}>
        <Text variant="callout" tone="secondary">{toUserMessage(detail.error, "Couldn't load this place.")}</Text>
        <Button kind="secondary" label="Try again" onPress={() => detail.refetch()} style={{ marginTop: SPACE.md }} />
      </View>
    );
  }

  const meta = CATEGORY_META[place.category];
  const busy = save.isPending || update.isPending;

  const setStatus = (status: PinStatus) => {
    haptic.commit();
    const onError = (e: unknown) => Alert.alert("Couldn't save", toUserMessage(e));
    if (!mine) save.mutate({ place, status, impression: null }, { onError });
    else if (mine.status !== status) update.mutate({ pinId: mine.id, status }, { onError });
  };

  const saveNote = () => {
    if (!mine) return;
    update.mutate(
      { pinId: mine.id, impression: draft },
      { onSuccess: () => setEditing(false), onError: (e) => Alert.alert("Couldn't save note", toUserMessage(e)) },
    );
  };

  const addPhoto = async () => {
    if (!mine || !userId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos are off', 'Allow photo access in Settings to add your own photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.85 });
    if (!res.canceled && res.assets[0]) startUpload(mine.id, userId, res.assets[0].uri);
  };

  const confirmRemove = () => {
    if (!mine) return;
    Alert.alert('Remove from your map?', `${place.name} will leave your map, rankings and boards.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => remove.mutate(mine.id, {
          onSuccess: () => { haptic.warn(); onRemoved(); },
          onError: (e) => Alert.alert("Couldn't remove", toUserMessage(e)),
        }),
      },
    ]);
  };

  const uploading = mine ? uploads.get(mine.id)?.status === 'uploading' : false;

  return (
    <View style={s.root}>
      {/* Preview detent: who/what/where + your relationship */}
      <View style={s.kickerRow}>
        <Icon name={meta.symbol} fallback={meta.glyph} size={13} color={colors.inkSecondary} />
        <Text variant="caption" tone="secondary" style={s.kicker}>
          {meta.label.toUpperCase()}{place.neighborhood ? ` · ${place.neighborhood}` : ''}
        </Text>
      </View>
      <Text variant="placeName" accessibilityRole="header">{place.name}</Text>
      <Text variant="callout" tone="secondary" numberOfLines={1}>{place.address}</Text>

      <View style={s.relation}>
        <RelationPill status={mine?.status ?? null} />
        <SocialSummary others={others} />
      </View>

      {/* Primary actions */}
      <View style={s.statusRow}>
        <Button
          label={mine?.status === 'want_to_go' ? 'Want to go ✓' : 'Want to go'}
          kind={mine?.status === 'want_to_go' ? 'primary' : 'secondary'}
          symbol="bookmark" fallback="◇"
          onPress={() => setStatus('want_to_go')}
          busy={busy && !mine}
          style={s.flex}
          testID="sheet-want"
        />
        <Button
          label={mine?.status === 'visited' ? 'Been ✓' : 'Been here'}
          kind={mine?.status === 'visited' ? 'primary' : 'secondary'}
          symbol="checkmark.circle" fallback="✓"
          onPress={() => setStatus('visited')}
          style={s.flex}
          testID="sheet-been"
        />
      </View>

      <View style={s.tools}>
        <Tool symbol="list.number" fallback="#" label={myRank ? `#${myRank.position}` : 'Rank'} disabled={!mine}
          onPress={() => router.push({ pathname: '/pin/rank', params: { placeId: place.id, category: place.category, name: place.name } })} />
        <Tool symbol="square.stack" fallback="▤" label="Board" disabled={!mine}
          onPress={() => mine && router.push({ pathname: '/pin/add-to-board', params: { pinId: mine.id, placeName: place.name } })} />
        <Tool symbol="arrow.triangle.turn.up.right.diamond" fallback="➤" label="Go" onPress={() => openDirections(place)} />
        <Tool symbol="square.and.arrow.up" fallback="↑" label="Share" onPress={() => sharePlace(place, mine?.impression)} />
      </View>

      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
          {photos.map((u) => (
            <Image key={u} source={{ uri: placePhotoUrl(u, 480) ?? undefined }} style={s.photo} contentFit="cover"
              transition={150} accessibilityIgnoresInvertColors accessible accessibilityLabel={`Photo of ${place.name}`} />
          ))}
        </ScrollView>
      ) : null}

      {/* Your note */}
      {mine ? (
        <Section title="Your take">
          {editing ? (
            <View style={s.noteEdit}>
              <BottomSheetTextInput
                value={draft}
                onChangeText={(t) => setDraft(t.slice(0, MAX_NOTE))}
                placeholder="What should a friend know?"
                placeholderTextColor={colors.inkTertiary}
                multiline
                autoFocus
                style={s.noteInput}
                accessibilityLabel="Your note about this place"
              />
              <View style={s.noteBar}>
                <Text variant="caption" tone="tertiary">{MAX_NOTE - draft.length} left</Text>
                <View style={s.noteButtons}>
                  <Button kind="quiet" label="Cancel" onPress={() => setEditing(false)} />
                  <Button label="Save" onPress={saveNote} busy={update.isPending} />
                </View>
              </View>
            </View>
          ) : (
            <PressableScale
              style={s.noteCard}
              pressedScale={0.99}
              onPress={() => { setDraft(mine.impression ?? ''); setEditing(true); }}
              accessibilityLabel={mine.impression ? `Your note: ${mine.impression}. Edit` : 'Add a note'}
            >
              <Text variant="body" tone={mine.impression ? 'primary' : 'tertiary'}>
                {mine.impression ? `“${mine.impression}”` : 'Add a note for your friends…'}
              </Text>
            </PressableScale>
          )}
          <View style={s.inlineActions}>
            <Button kind="quiet" symbol="camera" fallback="◎" label={uploading ? 'Uploading…' : mine.photo_url ? 'Replace photo' : 'Add photo'}
              onPress={addPhoto} disabled={uploading} />
            {myRank ? <RankLine rank={myRank} label="Your" /> : null}
          </View>
        </Section>
      ) : null}

      {/* Friends' takes — only real pins, never padded */}
      {others.length > 0 ? (
        <Section title={others.length === 1 ? 'From 1 person you follow' : `From ${others.length} people`}>
          {others.map((p) => (
            <FriendTake key={p.id} pin={p} rank={rankByUser.get(p.user_id) ?? null}
              onPress={() => router.push(`/(app)/user/${p.user_id}`)} />
          ))}
        </Section>
      ) : null}

      {mine ? (
        <Button kind="danger" label="Remove from my map" onPress={confirmRemove} busy={remove.isPending} style={s.remove} testID="sheet-remove" />
      ) : null}
    </View>
  );
}

function RelationPill({ status }: { status: PinStatus | null }) {
  const s = useStyles();
  const { colors } = useTheme();
  const label = status === 'visited' ? 'Been' : status === 'want_to_go' ? 'Want to go' : 'Not on your map';
  const on = status !== null;
  return (
    <View style={[s.pill, { backgroundColor: on ? colors.threadSoft : colors.surfaceSunk }]}>
      <View style={[s.pillDot, { backgroundColor: on ? colors.thread : colors.inkTertiary }]} />
      <Text variant="label" tone={on ? 'thread' : 'secondary'}>{label}</Text>
    </View>
  );
}

function SocialSummary({ others }: { others: PinRow[] }) {
  if (others.length === 0) return null;
  const names = others.slice(0, 2).map((p) => `@${p.user.username}`);
  const rest = others.length - names.length;
  const text = rest > 0 ? `${names.join(', ')} +${rest}` : names.join(' & ');
  return <Text variant="callout" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{text}</Text>;
}

function RankLine({ rank, label }: { rank: PlaceRank; label: string }) {
  return (
    <Text variant="count" tone="thread">
      {label} #{rank.position} of {rank.total} {CATEGORY_META[rank.category].plural}
    </Text>
  );
}

function FriendTake({ pin, rank, onPress }: { pin: PinRow; rank: PlaceRank | null; onPress: () => void }) {
  const s = useStyles();
  return (
    <PressableScale style={s.take} pressedScale={0.99} onPress={onPress}
      accessibilityLabel={`@${pin.user.username}, ${pin.status === 'visited' ? 'has been' : 'wants to go'}${pin.impression ? `: ${pin.impression}` : ''}`}>
      <View style={s.avatar}><Text variant="label">{(pin.user.display_name || pin.user.username).slice(0, 1).toUpperCase()}</Text></View>
      <View style={s.flex}>
        <View style={s.takeHead}>
          <Text variant="bodyStrong">@{pin.user.username}</Text>
          <Text variant="caption" tone="tertiary">{pin.status === 'visited' ? 'been' : 'wants to go'}</Text>
        </View>
        {pin.impression ? <Text variant="callout">“{pin.impression}”</Text> : null}
        {rank ? <RankLine rank={rank} label={`Their`} /> : null}
      </View>
    </PressableScale>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.section}>
      <Text variant="caption" tone="secondary" style={s.sectionTitle} accessibilityRole="header">{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Tool({ symbol, fallback, label, onPress, disabled }: { symbol: string; fallback: string; label: string; onPress: () => void; disabled?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale style={s.tool} onPress={onPress} disabled={disabled} accessibilityLabel={label}
      accessibilityHint={disabled ? 'Save this place first' : undefined}>
      <View style={s.toolIcon}><Icon name={symbol} fallback={fallback} size={19} color={colors.ink} /></View>
      <Text variant="caption" tone="secondary">{label}</Text>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { gap: SPACE.sm },
    center: { paddingVertical: SPACE.xxl, alignItems: 'center' },
    flex: { flex: 1 },
    kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    kicker: { letterSpacing: 0.8 },
    relation: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.xs },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.capsule },
    pillDot: { width: 7, height: 7, borderRadius: 4 },
    statusRow: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
    tools: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.sm },
    tool: { alignItems: 'center', gap: 4, minWidth: 64, paddingVertical: SPACE.xs },
    toolIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceSunk },
    photos: { gap: SPACE.sm, paddingVertical: SPACE.sm },
    photo: { width: 148, height: 108, borderRadius: RADIUS.md, backgroundColor: c.surfaceSunk },
    section: { marginTop: SPACE.lg, gap: SPACE.sm },
    sectionTitle: { letterSpacing: 0.8 },
    noteCard: { backgroundColor: c.surface, borderRadius: RADIUS.md, padding: SPACE.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    noteEdit: { backgroundColor: c.surface, borderRadius: RADIUS.md, padding: SPACE.md, gap: SPACE.sm },
    noteInput: { minHeight: 72, fontSize: 16, color: c.ink, textAlignVertical: 'top' },
    noteBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    noteButtons: { flexDirection: 'row', gap: SPACE.sm },
    inlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    take: { flexDirection: 'row', gap: SPACE.md, backgroundColor: c.surface, borderRadius: RADIUS.md, padding: SPACE.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline },
    takeHead: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center' },
    remove: { marginTop: SPACE.xl },
  }),
);
