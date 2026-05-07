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
import { COLORS, GLASS, GLASS_SM } from '../../constants/theme';

interface Board {
  id: string;
  name: string;
  pin_count: number;
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
            <View style={[styles.successHeader, GLASS]}>
              <View style={styles.successDot}>
                <Text style={styles.successDotText}>✓</Text>
              </View>
              <Text style={styles.successTitle}>{isUpdate ? 'Pin updated!' : 'Pinned!'}</Text>
              <Text style={styles.successSub}>
                <Text style={styles.bold}>{place_name}</Text> is on your map.
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Add to a board?</Text>

            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={boards}
                keyExtractor={(b) => b.id}
                style={styles.list}
                ListEmptyComponent={
                  !showCreate ? (
                    <Text style={styles.emptyText}>You don't have any boards yet.</Text>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.boardRow, GLASS_SM]}
                    onPress={() => addToBoard(item.id)}
                    disabled={saving}
                    activeOpacity={0.75}
                  >
                    <View style={styles.boardIconWrap}>
                      <Text style={styles.boardIconLetter}>{item.name[0].toUpperCase()}</Text>
                    </View>
                    <View style={styles.boardInfo}>
                      <Text style={styles.boardName}>{item.name}</Text>
                      <Text style={styles.boardCount}>{item.pin_count} pins</Text>
                    </View>
                    {saving ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Text style={styles.addText}>Add →</Text>
                    )}
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            )}

            {/* Create new board */}
            {showCreate ? (
              <View style={styles.createRow}>
                <TextInput
                  style={styles.createInput}
                  placeholder="Board name…"
                  placeholderTextColor="rgba(26,26,26,0.35)"
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
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.createBtnText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.newBoardBtn} onPress={() => setShowCreate(true)}>
                <Text style={styles.newBoardBtnText}>+ Create new board</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.skipBtn} onPress={goToMap}>
              <Text style={styles.skipText}>Skip — take me to my map</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },

  successHeader: {
    alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20,
    gap: 8, marginBottom: 8,
  },
  successDot: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary + '22',
    borderWidth: 2, borderColor: COLORS.primary + '55',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  successDotText: { fontSize: 24, color: COLORS.primary, fontWeight: '700' },
  successTitle: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
  successSub: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center' },
  bold: { fontWeight: '700', color: COLORS.textPrimary },

  sectionLabel: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10, marginTop: 8 },

  list: { flex: 1, marginBottom: 8 },
  boardRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 12,
  },
  boardIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  boardIconLetter: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  boardInfo: { flex: 1 },
  boardName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  boardCount: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  addText: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 16 },

  createRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  createInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: COLORS.textPrimary,
  },
  createBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  newBoardBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.primary + '55',
    borderRadius: 14, borderStyle: 'dashed',
    paddingVertical: 14, alignItems: 'center', marginBottom: 12,
  },
  newBoardBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  skipBtn: { paddingVertical: 16, alignItems: 'center' },
  skipText: { fontSize: 14, color: COLORS.textMuted },
});
