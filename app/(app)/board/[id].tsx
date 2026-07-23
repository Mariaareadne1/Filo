import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../../../lib/supabase';
import { fetchBoardPins, BoardPin } from '../../../hooks/useBoards';
import { CATEGORY_LABELS } from '../../../types';
import { parseIdParam } from '../../../lib/params';
import { useCurrentUserId } from '../../../hooks/useCurrentUserId';
import {
  PALETTE,
  ACCENT,
  FONTS,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  SCREEN_PAD,
  TAB_CLEARANCE,
  VISIBILITY_COLOR,
  VISIBILITY_LABEL,
} from '../../../constants/theme';

interface BoardMeta {
  name: string;
  description: string | null;
  visibility: string;
  share_token: string | null;
  user_id: string;
}

const CATEGORY_GLYPH: Record<string, string> = {
  food: '◆', bar: '○', beauty: '◇', experience: '✦', retail: '◉',
};

export default function BoardDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = parseIdParam(params.id);
  const router = useRouter();
  const currentUserId = useCurrentUserId() ?? null;

  const [board, setBoard] = useState<BoardMeta | null>(null);
  const [pins, setPins] = useState<BoardPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const [{ data: boardData }, boardPins] = await Promise.all([
      supabase
        .from('boards')
        .select('name, description, visibility, share_token, user_id')
        .eq('id', id)
        .single(),
      fetchBoardPins(id),
    ]);
    if (reqIdRef.current !== myReq) return;
    setBoard(boardData);
    setPins(boardPins);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleReorder(newPins: BoardPin[]) {
    setPins(newPins);
    setSavingOrder(true);
    await Promise.all(
      newPins.map((pin, index) =>
        supabase.from('board_pins').update({ position: index }).eq('id', pin.id)
      )
    );
    setSavingOrder(false);
  }

  async function handleRemovePin(boardPinId: string) {
    Alert.alert('remove pin', 'remove this place from the board?', [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'remove',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('board_pins').delete().eq('id', boardPinId);
          setPins((prev) => prev.filter((p) => p.id !== boardPinId));
        },
      },
    ]);
  }

  async function handleShare() {
    if (!board?.share_token) {
      Alert.alert(
        'not shareable',
        'set this board to public to generate a shareable link.',
        [{ text: 'ok' }]
      );
      return;
    }
    const url = `https://filo.app/b/${board.share_token}?from=app`;
    await Share.share({ message: url, url });
  }

  const isOwner = currentUserId && board?.user_id === currentUserId;

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<BoardPin>) => {
      const glyph = CATEGORY_GLYPH[item.category] ?? '◉';
      const label = CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category;

      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={isOwner ? drag : undefined}
            delayLongPress={200}
            activeOpacity={0.92}
            style={[styles.pinRow, isActive && styles.pinRowActive]}
            accessibilityLabel={`${item.place_name}, ${label}`}
            accessibilityHint={isOwner ? 'Long press to reorder' : undefined}
          >
            <View style={styles.pinIcon}>
              <Text style={styles.pinGlyph}>{glyph}</Text>
            </View>
            <View style={styles.pinInfo}>
              <View style={styles.pinNameRow}>
                <Text style={styles.pinName} numberOfLines={1}>{item.place_name}</Text>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: item.status === 'visited' ? PALETTE.ink : PALETTE.surface },
                  item.status !== 'visited' && { borderWidth: 1, borderColor: PALETTE.ink },
                ]} />
              </View>
              <Text style={styles.catBadgeText}>{label.toLowerCase()}</Text>
              {item.impression ? (
                <Text style={styles.impression} numberOfLines={2}>"{item.impression}"</Text>
              ) : null}
              <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
            </View>
            <View style={styles.pinRight}>
              {isOwner && (
                <TouchableOpacity
                  onPress={() => handleRemovePin(item.id)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.place_name} from board`}
                >
                  <Text style={styles.removeText}>×</Text>
                </TouchableOpacity>
              )}
              {isOwner && (
                <Text style={styles.dragHandle} accessibilityElementsHidden importantForAccessibility="no">⠿</Text>
              )}
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [isOwner]
  );

  // Malformed/duplicated deep link — redirect cleanly instead of querying
  // with a bad id. All hooks above run unconditionally first.
  if (!id) return <Redirect href="/(app)/discover" />;

  if (loading) {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1 }}>
          <ActivityIndicator color={ACCENT.red} style={{ marginTop: 60 }} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
              <Text style={styles.backText}>← back</Text>
            </TouchableOpacity>

            <View style={styles.headerBlock}>
              <Text style={styles.metaLabel}>BOARD · {pins.length} PIN{pins.length !== 1 ? 'S' : ''}</Text>
              <Text style={styles.boardName} numberOfLines={2}>{board?.name}</Text>
              {board?.description ? (
                <Text style={styles.boardDesc} numberOfLines={2}>{board.description}</Text>
              ) : null}

              {/* Visibility + share row */}
              <View style={styles.metaRow}>
                <View style={[
                  styles.visBadge,
                  { borderColor: VISIBILITY_COLOR[board?.visibility ?? 'private'] }
                ]}>
                  <View style={[
                    styles.visDot,
                    { backgroundColor: VISIBILITY_COLOR[board?.visibility ?? 'private'] }
                  ]} />
                  <Text style={styles.visBadgeText}>
                    {(VISIBILITY_LABEL[board?.visibility ?? 'private'] ?? 'private').toLowerCase()}
                  </Text>
                </View>
                {savingOrder && <Text style={styles.saving}>saving…</Text>}
                {isOwner && (
                  <TouchableOpacity onPress={handleShare} style={styles.shareBtn} activeOpacity={0.85}>
                    <Text style={styles.shareBtnText}>share →</Text>
                  </TouchableOpacity>
                )}
              </View>

              {isOwner && pins.length > 1 && (
                <Text style={styles.reorderHint}>hold any pin to reorder.</Text>
              )}
            </View>
          </View>

          {/* Pin list */}
          {pins.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyRing} />
              <Text style={styles.emptyTitle}>
                no pins <Text style={styles.emptyTitleItalic}>yet.</Text>
              </Text>
              <Text style={styles.emptySub}>
                pin a place on the map, then tap "add to board" to drop it here.
              </Text>
            </View>
          ) : (
            <DraggableFlatList
              data={pins}
              keyExtractor={(item) => item.id}
              onDragEnd={({ data }) => handleReorder(data)}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </SafeAreaView>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },

  // Header
  header: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 4,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.inkLine,
  },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
  },
  headerBlock: { gap: 6, paddingTop: 4 },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  boardName: {
    fontFamily: FONTS.display,
    fontSize: 30,
    lineHeight: 33,
    color: PALETTE.ink,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  boardDesc: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    lineHeight: 18,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  visBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: PALETTE.surface,
  },
  visDot: { width: 6, height: 6, borderRadius: 3 },
  visBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.ink,
    fontWeight: '600',
  },
  saving: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: PALETTE.inkSoft,
    letterSpacing: 0.5,
  },
  shareBtn: {
    marginLeft: 'auto',
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: ACCENT.red,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...STICKER_SHADOW,
  },
  shareBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontWeight: '700',
    fontSize: 12,
  },
  reorderHint: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.inkMute,
    marginTop: 4,
  },

  // List
  list: { paddingTop: 8, paddingBottom: TAB_CLEARANCE },
  separator: { height: 1, backgroundColor: PALETTE.inkLine, marginLeft: SCREEN_PAD + 50 },

  pinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: PALETTE.bg,
  },
  pinRowActive: {
    backgroundColor: PALETTE.surface,
    ...STICKER_SHADOW_LG,
  },
  pinIcon: {
    width: 38,
    height: 38,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...STICKER_SHADOW,
  },
  pinGlyph: {
    fontSize: 16,
    color: ACCENT.red,
  },

  pinInfo: { flex: 1, gap: 4 },
  pinNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinName: {
    flex: 1,
    fontFamily: FONTS.display,
    fontSize: 17,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
  impression: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.ink,
    fontStyle: 'italic',
    lineHeight: 17,
    marginTop: 2,
  },
  address: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: PALETTE.inkMute,
    marginTop: 2,
  },

  pinRight: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  removeText: {
    fontSize: 18,
    color: PALETTE.inkMute,
    fontWeight: '400',
    lineHeight: 18,
  },
  dragHandle: {
    fontSize: 16,
    color: PALETTE.inkMute,
    letterSpacing: -1,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: ACCENT.red,
    opacity: 0.4,
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
    textAlign: 'center',
  },
  emptyTitleItalic: { fontStyle: 'italic', color: ACCENT.red },
  emptySub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
    lineHeight: 19,
  },
});
