import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FONTS,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  SCREEN_PAD,
} from '../../constants/theme';

interface Board {
  id: string;
  name: string;
  pin_count: number;
}

const BOARD_ACCENTS = [ACCENT.red, ACCENT.electric, '#f4c542', '#2ec27e', '#7d5fff', '#e6739f'];

function boardAccent(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return BOARD_ACCENTS[Math.abs(hash) % BOARD_ACCENTS.length];
}

export default function AddToBoardScreen() {
  const router = useRouter();
  const { pin_id, place_name, is_update } = useLocalSearchParams<{
    pin_id: string; place_name: string; is_update: string;
  }>();

  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const isUpdate = is_update === 'true';

  useEffect(() => { loadBoards(); }, []);

  async function loadBoards() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('boards')
      .select('id, name, board_pins(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setBoards((data ?? []).map((b: any) => ({
      id: b.id, name: b.name, pin_count: b.board_pins?.[0]?.count ?? 0,
    })));
    setLoading(false);
  }

  async function addToBoard(boardId: string) {
    setSaving(true);
    const { count } = await supabase
      .from('board_pins')
      .select('*', { count: 'exact', head: true })
      .eq('board_id', boardId);
    const { error } = await supabase.from('board_pins').upsert(
      { board_id: boardId, pin_id, position: count ?? 0 },
      { onConflict: 'board_id,pin_id' }
    );
    setSaving(false);
    if (error) { Alert.alert('Error', 'Could not add to board. Please try again.'); return; }
    goToMap();
  }

  async function createAndAdd() {
    if (!newBoardName.trim()) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreating(false); return; }
    const shareToken = Math.random().toString(36).slice(2, 12);
    const { data: board, error } = await supabase
      .from('boards')
      .insert({ user_id: user.id, name: newBoardName.trim(), visibility: 'public', share_token: shareToken })
      .select('id').single();
    if (error || !board) {
      Alert.alert('Error', 'Could not create board. Please try again.');
      setCreating(false);
      return;
    }
    setCreating(false);
    await addToBoard(board.id);
  }

  function goToMap() { router.dismissAll(); }

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.container}>
            {/* Success header */}
            <View style={styles.successCard}>
              <View style={styles.successDot}>
                <Text style={styles.successDotText}>✓</Text>
              </View>
              <Text style={styles.successKicker}>{isUpdate ? 'PIN UPDATED' : 'PINNED'}</Text>
              <Text style={styles.successTitle}>
                <Text style={styles.successTitleItalic}>{place_name}</Text>
              </Text>
              <Text style={styles.successSub}>is on your map.</Text>
            </View>

            <Text style={styles.sectionLabel}>ADD TO A BOARD?</Text>

            {loading ? (
              <ActivityIndicator color={ACCENT.red} style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={boards}
                keyExtractor={(b) => b.id}
                style={styles.list}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={
                  !showCreate ? (
                    <Text style={styles.emptyText}>no boards yet — create your first below.</Text>
                  ) : null
                }
                renderItem={({ item }) => {
                  const accent = boardAccent(item.name);
                  return (
                    <TouchableOpacity
                      style={styles.boardRow}
                      onPress={() => addToBoard(item.id)}
                      disabled={saving}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.boardIconWrap, { backgroundColor: PALETTE.zone1 }]}>
                        <View style={[styles.boardIconHalo, { backgroundColor: accent, opacity: 0.18 }]} />
                        <Text style={[styles.boardIconLetter, { color: accent }]}>
                          {item.name[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.boardInfo}>
                        <Text style={styles.boardName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.boardCount}>{item.pin_count} pins</Text>
                      </View>
                      {saving ? (
                        <ActivityIndicator size="small" color={ACCENT.red} />
                      ) : (
                        <Text style={styles.addText}>add →</Text>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            {/* Create new board */}
            {showCreate ? (
              <View style={styles.createRow}>
                <TextInput
                  style={styles.createInput}
                  placeholder="board name…"
                  placeholderTextColor={PALETTE.inkMute}
                  value={newBoardName}
                  onChangeText={setNewBoardName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={createAndAdd}
                />
                <TouchableOpacity
                  style={[styles.createBtn, !newBoardName.trim() && styles.createBtnDisabled]}
                  onPress={createAndAdd}
                  disabled={creating || !newBoardName.trim()}
                  activeOpacity={0.85}
                >
                  {creating ? (
                    <ActivityIndicator color={PALETTE.surface} size="small" />
                  ) : (
                    <Text style={styles.createBtnText}>create</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.newBoardBtn}
                onPress={() => setShowCreate(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.newBoardBtnText}>+ create new board</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.skipBtn} onPress={goToMap} hitSlop={8}>
              <Text style={styles.skipText}>skip — take me to my map</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  container: {
    flex: 1,
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 12,
    paddingBottom: 24,
  },

  successCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    gap: 6,
    marginBottom: 18,
    ...STICKER_SHADOW_LG,
  },
  successDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    ...STICKER_SHADOW,
  },
  successDotText: {
    fontSize: 22,
    color: PALETTE.surface,
    fontWeight: '700',
    lineHeight: 24,
  },
  successKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  successTitle: {
    fontFamily: FONTS.display,
    fontSize: 24,
    color: PALETTE.ink,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 4,
  },
  successTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  successSub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
  },

  sectionLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginBottom: 10,
    marginTop: 4,
  },

  list: { flex: 1, marginBottom: 10 },
  separator: { height: 8 },

  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW,
  },
  boardIconWrap: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  boardIconHalo: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  boardIconLetter: {
    fontFamily: FONTS.display,
    fontSize: 22,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  boardInfo: { flex: 1, gap: 2 },
  boardName: {
    fontFamily: FONTS.display,
    fontSize: 16,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  boardCount: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: PALETTE.inkSoft,
  },
  addText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: ACCENT.red,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  emptyText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 20,
  },

  createRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  createInput: {
    flex: 1,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: PALETTE.ink,
  },
  createBtn: {
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 16,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    ...STICKER_SHADOW,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  newBoardBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: PALETTE.ink,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    marginBottom: 8,
  },
  newBoardBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.ink,
    fontWeight: '600',
    fontSize: 13,
  },

  skipBtn: { paddingVertical: 14, alignItems: 'center' },
  skipText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
});
