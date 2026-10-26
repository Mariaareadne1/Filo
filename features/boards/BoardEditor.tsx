import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAddToBoard, useBoard, useCreateBoard, useUpdateBoard } from '../../lib/hooks';
import { parseIdParam } from '../../lib/params';
import { toUserMessage } from '../../lib/errors';
import type { BoardVisibility } from '../../lib/api/boards';
import { Button } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

const MAX_NAME = 60;
const VIS: { value: BoardVisibility; label: string; hint: string; symbol: string }[] = [
  { value: 'private', label: 'Only me', hint: 'A private list.', symbol: 'lock.fill' },
  { value: 'friends', label: 'Followers', hint: 'People you’ve approved can open it.', symbol: 'person.2.fill' },
  { value: 'public', label: 'Anyone with the link', hint: 'Share it anywhere — no account needed to view.', symbol: 'link' },
];

/**
 * Create (no `boardId`) or edit a board's name, note and visibility.
 * `pinId` (optional) is added right after creation — used from the place sheet.
 */
export function BoardEditor() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ boardId?: string; pinId?: string }>();
  const boardId = parseIdParam(params.boardId);
  const pinId = parseIdParam(params.pinId);
  const existing = useBoard(boardId);
  const create = useCreateBoard();
  const update = useUpdateBoard(boardId ?? '');
  const add = useAddToBoard();
  const b = existing.data?.board;

  const [name, setName] = useState(b?.name ?? '');
  const [note, setNote] = useState(b?.description ?? '');
  const [vis, setVis] = useState<BoardVisibility>(b?.visibility ?? 'friends');
  const [hydrated, setHydrated] = useState(!boardId);
  if (!hydrated && b) {
    setName(b.name); setNote(b.description ?? ''); setVis(b.visibility); setHydrated(true);
  }

  const busy = create.isPending || update.isPending || add.isPending;
  const valid = name.trim().length >= 1;

  const submit = async () => {
    if (!valid || busy) return;
    try {
      if (boardId) {
        await update.mutateAsync({ name, description: note, visibility: vis });
      } else {
        const id = await create.mutateAsync({ name, description: note, visibility: vis });
        if (pinId) await add.mutateAsync({ boardId: id, pinId });
        haptic.commit();
        router.back();
        if (!pinId) router.push(`/(app)/board/${id}`);
        return;
      }
      haptic.commit();
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save the board", toUserMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text variant="title" accessibilityRole="header">{boardId ? 'Edit board' : 'New board'}</Text>
        <TextInput
          value={name}
          onChangeText={(t) => setName(t.slice(0, MAX_NAME))}
          placeholder="Late night eats"
          placeholderTextColor={colors.inkTertiary}
          style={s.name}
          autoFocus={!boardId}
          accessibilityLabel="Board name"
          returnKeyType="next"
          testID="board-name"
        />
        <TextInput
          value={note}
          onChangeText={(t) => setNote(t.slice(0, 200))}
          placeholder="A line about it (optional)"
          placeholderTextColor={colors.inkTertiary}
          style={s.note}
          multiline
          accessibilityLabel="Board description"
        />
        <Text variant="caption" tone="secondary" style={s.label}>WHO CAN SEE IT</Text>
        <View style={s.options}>
          {VIS.map((v) => {
            const on = v.value === vis;
            return (
              <PressableScale key={v.value} style={[s.option, on && { borderColor: colors.thread, backgroundColor: colors.threadSoft }]}
                onPress={() => { haptic.select(); setVis(v.value); }}
                accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${v.label}. ${v.hint}`}>
                <Icon name={v.symbol} fallback="·" size={16} color={on ? colors.thread : colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{v.label}</Text>
                  <Text variant="caption" tone="secondary">{v.hint}</Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Button label={boardId ? 'Save' : pinId ? 'Create & add place' : 'Create board'} onPress={submit} disabled={!valid} busy={busy} testID="board-save" />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: GUTTER, paddingTop: SPACE.xl, gap: SPACE.md },
    name: { fontFamily: 'Fraunces-SemiBold', fontSize: 26, color: c.ink, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: c.hairline },
    note: { fontSize: 16, color: c.ink, minHeight: 48 },
    label: { letterSpacing: 0.8, marginTop: SPACE.md },
    options: { gap: SPACE.sm },
    option: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.surface },
    footer: { padding: GUTTER, paddingBottom: SPACE.xxl },
  }),
);
