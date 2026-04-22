import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../../../lib/supabase';
import { fetchBoardPins, BoardPin } from '../../../hooks/useBoards';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../../types';

interface BoardMeta {
  name: string;
  description: string | null;
  visibility: string;
  share_token: string | null;
  user_id: string;
}

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️', bar: '🍸', beauty: '✂️', experience: '🎯', retail: '🛍️',
};

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [board, setBoard] = useState<BoardMeta | null>(null);
  const [pins, setPins] = useState<BoardPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    const [{ data: boardData }, boardPins] = await Promise.all([
      supabase
        .from('boards')
        .select('name, description, visibility, share_token, user_id')
        .eq('id', id)
        .single(),
      fetchBoardPins(id),
    ]);
    setBoard(boardData);
    setPins(boardPins);
    setLoading(false);
  }

  async function handleReorder(newPins: BoardPin[]) {
    setPins(newPins);
    setSavingOrder(true);
    // Persist new positions
    await Promise.all(
      newPins.map((pin, index) =>
        supabase
          .from('board_pins')
          .update({ position: index })
          .eq('id', pin.id)
      )
    );
    setSavingOrder(false);
  }

  async function handleRemovePin(boardPinId: string) {
    Alert.alert('Remove pin', 'Remove this place from the board?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
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
        'Not shareable',
        'Set this board to Public to generate a shareable link.',
        [{ text: 'OK' }]
      );
      return;
    }
    const url = `https://filo.app/b/${board.share_token}?from=app`;
    await Share.share({ message: url, url });
  }

  const isOwner = currentUserId && board?.user_id === currentUserId;

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<BoardPin>) => {
      const color = CATEGORY_COLORS[item.category as keyof typeof CATEGORY_COLORS] ?? '#888';
      const emoji = CATEGORY_EMOJI[item.category] ?? '📍';
      const label = CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category;

      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={isOwner ? drag : undefined}
            delayLongPress={200}
            activeOpacity={0.85}
            style={[styles.pinRow, isActive && styles.pinRowActive]}
          >
            <View style={[styles.pinIcon, { backgroundColor: color + '18' }]}>
              <Text style={styles.pinEmoji}>{emoji}</Text>
            </View>
            <View style={styles.pinInfo}>
              <Text style={styles.pinName}>{item.place_name}</Text>
              <View style={[styles.catBadge, { borderColor: color }]}>
                <Text style={[styles.catBadgeText, { color }]}>{label}</Text>
              </View>
              {item.impression ? (
                <Text style={styles.impression} numberOfLines={2}>"{item.impression}"</Text>
              ) : null}
              <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
            </View>
            <View style={styles.pinRight}>
              <View style={[styles.statusDot, { backgroundColor: item.status === 'visited' ? '#22c55e' : '#f59e0b' }]} />
              {isOwner && (
                <TouchableOpacity onPress={() => handleRemovePin(item.id)} hitSlop={12}>
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              )}
              {isOwner && <Text style={styles.dragHandle}>⠿</Text>}
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    },
    [isOwner]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color="#E63946" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.boardName} numberOfLines={1}>{board?.name}</Text>
            {board?.description ? (
              <Text style={styles.boardDesc} numberOfLines={1}>{board.description}</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <Text style={styles.pinCount}>{pins.length} pin{pins.length !== 1 ? 's' : ''}</Text>
          {savingOrder && <Text style={styles.saving}>Saving…</Text>}
          {board?.visibility === 'public' && board.share_token && (
            <View style={styles.publicBadge}>
              <Text style={styles.publicBadgeText}>🔗 Shareable</Text>
            </View>
          )}
          {isOwner && pins.length > 1 && (
            <Text style={styles.reorderHint}>Hold to reorder</Text>
          )}
        </View>

        {/* Pin list */}
        {pins.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📍</Text>
            <Text style={styles.emptyTitle}>No pins yet</Text>
            <Text style={styles.emptySub}>
              Pin a place on the map, then tap "Add to board" to add it here.
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 28, color: '#E63946', fontWeight: '300', lineHeight: 32 },
  headerCenter: { flex: 1 },
  boardName: { fontSize: 17, fontWeight: '800', color: '#111' },
  boardDesc: { fontSize: 12, color: '#aaa', marginTop: 2 },
  shareBtn: {
    backgroundColor: '#E63946',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  shareBtnText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 13 },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  pinCount: { fontSize: 13, color: '#888', fontWeight: '600' },
  saving: { fontSize: 12, color: '#aaa' },
  publicBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  publicBadgeText: { fontSize: 11, color: '#22c55e', fontWeight: '600' },
  reorderHint: { fontSize: 11, color: '#bbb', marginLeft: 'auto' },

  list: { paddingBottom: 40 },
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 74 },

  pinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: '#fff',
  },
  pinRowActive: { backgroundColor: '#fef2f2', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  pinIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinEmoji: { fontSize: 22 },
  pinInfo: { flex: 1, gap: 4 },
  pinName: { fontSize: 15, fontWeight: '700', color: '#111' },
  catBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catBadgeText: { fontSize: 11, fontWeight: '600' },
  impression: { fontSize: 13, color: '#555', fontStyle: 'italic', lineHeight: 18 },
  address: { fontSize: 12, color: '#aaa' },
  pinRight: { alignItems: 'center', gap: 8, paddingTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  removeText: { fontSize: 14, color: '#ccc', fontWeight: '600' },
  dragHandle: { fontSize: 18, color: '#ccc' },

  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  emptySub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});
