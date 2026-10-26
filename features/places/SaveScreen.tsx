import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { z } from 'zod';
import { CATEGORIES, CATEGORY_META, type Category } from '../../lib/categories';
import { useSavePin } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { toUserMessage } from '../../lib/errors';
import type { PinStatus } from '../../lib/api/pins';
import type { PlaceCandidate } from '../../lib/search';
import { useUploads } from '../../contexts/UploadContext';
import { Button, GlassChip } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

const MAX_NOTE = 150;

const candidateSchema = z.object({
  provider: z.enum(['mapbox', 'google']),
  providerId: z.string().min(10).max(300),
  name: z.string().min(1).max(200),
  address: z.string().max(300),
  category: z.enum(CATEGORIES),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  tags: z.array(z.string()).max(20),
  neighborhood: z.string().nullable(),
  photoUrl: z.string().url().nullable(),
});

function parseCandidate(raw: string | string[] | undefined): PlaceCandidate | null {
  try {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    const parsed = candidateSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function SaveScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ candidate?: string }>();
  const candidate = useMemo(() => parseCandidate(params.candidate), [params.candidate]);
  const { userId } = useSession();
  const { startUpload } = useUploads();
  const save = useSavePin();

  const [status, setStatus] = useState<PinStatus | null>(null);
  const [category, setCategory] = useState<Category>(candidate?.category ?? 'experience');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  if (!candidate) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <Text variant="heading">That place couldn't be opened.</Text>
        <Button kind="secondary" label="Back to search" onPress={() => router.back()} style={{ marginTop: SPACE.lg }} />
      </View>
    );
  }

  const pickPhoto = async () => {
    // System picker: no library permission needed, only the chosen photo is shared.
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.85 });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0].uri);
  };

  const submit = () => {
    if (!status || save.isPending) return;
    save.mutate(
      { place: { ...candidate, category }, status, impression: note },
      {
        onSuccess: (r) => {
          haptic.commit();
          if (photo && userId) startUpload(r.pinId, userId, photo);
          if (status === 'visited') {
            router.replace({ pathname: '/pin/rank', params: { placeId: r.placeId, category, name: candidate.name, fresh: '1' } });
          } else {
            router.dismissTo({ pathname: '/(app)/map', params: { place: r.placeId } });
          }
        },
        onError: (e) => Alert.alert("Couldn't save this place", toUserMessage(e)),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + SPACE.md, paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled">
        <PressableScale onPress={() => router.back()} accessibilityLabel="Back" style={s.back} hitSlop={10}>
          <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
          <Text variant="bodyStrong">Search</Text>
        </PressableScale>

        <Text variant="caption" tone="secondary" style={s.kicker}>
          {[CATEGORY_META[category].label.toUpperCase(), candidate.neighborhood].filter(Boolean).join(' · ')}
        </Text>
        <Text variant="title" accessibilityRole="header">{candidate.name}</Text>
        <Text variant="callout" tone="secondary">{candidate.address}</Text>
        {candidate.tags.length > 0 ? (
          <Text variant="caption" tone="tertiary" style={{ marginTop: SPACE.xs }}>{candidate.tags.join(' · ')}</Text>
        ) : null}

        <Text variant="caption" tone="secondary" style={s.label}>HAVE YOU BEEN?</Text>
        <View style={s.statusRow}>
          {(['want_to_go', 'visited'] as const).map((v) => {
            const on = status === v;
            return (
              <PressableScale key={v} style={[s.status, on && { backgroundColor: colors.thread, borderColor: colors.thread }]}
                onPress={() => { haptic.select(); setStatus(v); }}
                accessibilityRole="radio" accessibilityState={{ checked: on }}
                accessibilityLabel={v === 'visited' ? "I've been" : 'I want to go'} testID={`save-${v}`}>
                <Icon name={v === 'visited' ? 'checkmark.circle.fill' : 'bookmark.fill'} fallback={v === 'visited' ? '✓' : '◇'}
                  size={20} color={on ? colors.onThread : colors.ink} />
                <Text variant="bodyStrong" style={{ color: on ? colors.onThread : colors.ink }}>
                  {v === 'visited' ? "I've been" : 'Want to go'}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        <Text variant="caption" tone="secondary" style={s.label}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {CATEGORIES.map((c) => (
            <GlassChip key={c} label={CATEGORY_META[c].short} symbol={CATEGORY_META[c].symbol} fallback={CATEGORY_META[c].glyph}
              selected={c === category} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>

        <Text variant="caption" tone="secondary" style={s.label}>YOUR TAKE · OPTIONAL</Text>
        <View style={s.noteBox}>
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, MAX_NOTE))}
            placeholder="What should a friend know? (“get the cardamom bun”)"
            placeholderTextColor={colors.inkTertiary}
            multiline
            style={s.note}
            accessibilityLabel="Your note"
            testID="save-note"
          />
          <Text variant="caption" tone="tertiary" style={s.count}>{MAX_NOTE - note.length}</Text>
        </View>

        <Text variant="caption" tone="secondary" style={s.label}>PHOTO · OPTIONAL</Text>
        {photo ? (
          <PressableScale onPress={pickPhoto} accessibilityLabel="Change photo">
            <Image source={{ uri: photo }} style={s.photo} contentFit="cover" />
          </PressableScale>
        ) : (
          <Button kind="secondary" symbol="camera" fallback="◎" label="Add a photo" onPress={pickPhoto} />
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + SPACE.md }]}>
        <Button
          label={status === 'visited' ? 'Save & rank it' : 'Save to my map'}
          onPress={submit}
          disabled={!status}
          busy={save.isPending}
          accessibilityHint={!status ? 'Choose whether you have been first' : undefined}
          testID="save-submit"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER },
    content: { paddingHorizontal: GUTTER, gap: SPACE.xs },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACE.lg, alignSelf: 'flex-start', minHeight: 44 },
    kicker: { letterSpacing: 0.8 },
    label: { letterSpacing: 0.8, marginTop: SPACE.xl, marginBottom: SPACE.sm },
    statusRow: { flexDirection: 'row', gap: SPACE.sm },
    status: {
      flex: 1, minHeight: 64, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.hairline,
      backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: 4,
    },
    chips: { gap: SPACE.sm, paddingVertical: 2 },
    noteBox: { backgroundColor: c.surface, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline, padding: SPACE.md },
    note: { minHeight: 80, fontSize: 16, color: c.ink, textAlignVertical: 'top' },
    count: { alignSelf: 'flex-end' },
    photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: RADIUS.md },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: SPACE.md, backgroundColor: c.bg },
  }),
);
