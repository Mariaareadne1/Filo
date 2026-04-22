import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Animated,
  Pressable,
  Alert,
  ActivityIndicator,
  FlatList,
  TextInput,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { MapPin, CATEGORY_COLORS, CATEGORY_LABELS } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  pin: MapPin | null;
  onClose: () => void;
}

interface Board {
  id: string;
  name: string;
  pin_count: number;
}

function generateShareToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function PinDetailSheet({ pin, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const [showBoardPicker, setShowBoardPicker] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (pin) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      slideAnim.setValue(300);
      setShowBoardPicker(false);
      setShowCreate(false);
      setNewBoardName('');
    }
  }, [pin]);

  async function openBoardPicker() {
    setShowBoardPicker(true);
    setBoardsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBoardsLoading(false); return; }
    const { data } = await supabase
      .from('boards')
      .select('id, name, board_pins(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setBoards(
      (data ?? []).map((b: any) => ({
        id: b.id,
        name: b.name,
        pin_count: b.board_pins?.[0]?.count ?? 0,
      }))
    );
    setBoardsLoading(false);
  }

  async function addToBoard(boardId: string) {
    if (!pin) return;
    setSaving(true);
    const { count } = await supabase
      .from('board_pins')
      .select('*', { count: 'exact', head: true })
      .eq('board_id', boardId);
    const { error } = await supabase.from('board_pins').upsert({
      board_id: boardId,
      pin_id: pin.pin_id,
      position: count ?? 0,
    }, { onConflict: 'board_id,pin_id' });
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not add to board.');
      return;
    }
    setShowBoardPicker(false);
    Alert.alert('Added!', `${pin.place_name} added to board.`);
  }

  async function createAndAdd() {
    if (!newBoardName.trim() || !pin) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { data: board, error } = await supabase
      .from('boards')
      .insert({
        user_id: user.id,
        name: newBoardName.trim(),
        visibility: 'public',
        share_token: generateShareToken(),
      })
      .select('id')
      .single();
    if (error || !board) {
      Alert.alert('Error', 'Could not create board.');
      setSaving(false);
      return;
    }
    await addToBoard(board.id);
  }

  if (!pin) return null;

  const color = CATEGORY_COLORS[pin.category] ?? '#888';
  const label = CATEGORY_LABELS[pin.category] ?? pin.category;
  const initials = pin.display_name
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Modal transparent animationType="none" visible={!!pin} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />

        {!showBoardPicker ? (
          <>
            {/* Category badge */}
            <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color }]}>
              <View style={[styles.badgeDot, { backgroundColor: color }]} />
              <Text style={[styles.badgeText, { color }]}>{label}</Text>
            </View>

            <Text style={styles.placeName}>{pin.place_name}</Text>
            <Text style={styles.address}>{pin.address}</Text>

            {pin.impression ? (
              <View style={styles.impressionBox}>
                <Text style={styles.impressionText}>"{pin.impression}"</Text>
              </View>
            ) : null}

            <View style={[styles.statusPill, pin.status === 'visited' ? styles.visited : styles.wantToGo]}>
              <Text style={styles.statusText}>
                {pin.status === 'visited' ? '✓ Visited' : '♡ Want to go'}
              </Text>
            </View>

            {/* Pinned by */}
            <View style={styles.userRow}>
              {pin.avatar_url ? (
                <Image source={{ uri: pin.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              <View>
                <Text style={styles.pinnedBy}>Pinned by</Text>
                <Text style={styles.username}>@{pin.username}</Text>
              </View>
            </View>

            {/* Action buttons */}
            <TouchableOpacity style={styles.addToBoardBtn} onPress={openBoardPicker}>
              <Text style={styles.addToBoardText}>📋 Add to board</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Board picker */}
            <View style={styles.boardPickerHeader}>
              <Text style={styles.boardPickerTitle}>Add to board</Text>
              <TouchableOpacity onPress={() => setShowBoardPicker(false)}>
                <Text style={styles.boardPickerBack}>← Back</Text>
              </TouchableOpacity>
            </View>

            {boardsLoading ? (
              <ActivityIndicator color="#E63946" style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={boards}
                keyExtractor={(b) => b.id}
                style={styles.boardList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  !showCreate
                    ? <Text style={styles.emptyBoards}>No boards yet. Create one below.</Text>
                    : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.boardRow}
                    onPress={() => addToBoard(item.id)}
                    disabled={saving}
                  >
                    <Text style={styles.boardRowName}>{item.name}</Text>
                    <Text style={styles.boardRowCount}>{item.pin_count} pins</Text>
                    {saving
                      ? <ActivityIndicator size="small" color="#E63946" />
                      : <Text style={styles.boardRowAdd}>Add →</Text>
                    }
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
              />
            )}

            {showCreate ? (
              <View style={styles.createRow}>
                <TextInput
                  style={styles.createInput}
                  placeholder="New board name…"
                  placeholderTextColor="#bbb"
                  value={newBoardName}
                  onChangeText={setNewBoardName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={createAndAdd}
                />
                <TouchableOpacity
                  style={[styles.createBtn, !newBoardName.trim() && styles.createBtnDisabled]}
                  onPress={createAndAdd}
                  disabled={saving || !newBoardName.trim()}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.createBtnText}>Create</Text>
                  }
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.newBoardBtn} onPress={() => setShowCreate(true)}>
                <Text style={styles.newBoardBtnText}>+ Create new board</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 20,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    gap: 6, marginBottom: 10,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  placeName: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 4 },
  address: { fontSize: 13, color: '#888', marginBottom: 16 },
  impressionBox: {
    backgroundColor: '#fafafa', borderLeftWidth: 3, borderLeftColor: '#E63946',
    borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14,
  },
  impressionText: { fontSize: 14, color: '#444', fontStyle: 'italic', lineHeight: 20 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 20 },
  visited: { backgroundColor: '#d1fae5' },
  wantToGo: { backgroundColor: '#fef3c7' },
  statusText: { fontSize: 13, fontWeight: '600', color: '#333' },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 14, fontWeight: '700', color: '#666' },
  pinnedBy: { fontSize: 11, color: '#aaa' },
  username: { fontSize: 14, fontWeight: '700', color: '#111' },
  addToBoardBtn: {
    backgroundColor: '#f5f5f5', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', marginBottom: 10,
  },
  addToBoardText: { fontSize: 14, fontWeight: '700', color: '#333' },
  closeBtn: {
    borderRadius: 12, borderWidth: 1.5, borderColor: '#eee',
    paddingVertical: 14, alignItems: 'center',
  },
  closeBtnText: { fontSize: 15, fontWeight: '600', color: '#666' },

  // Board picker
  boardPickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  boardPickerTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  boardPickerBack: { fontSize: 14, color: '#E63946', fontWeight: '600' },
  boardList: { maxHeight: 220 },
  emptyBoards: { fontSize: 13, color: '#aaa', textAlign: 'center', marginVertical: 16 },
  boardRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 8,
  },
  boardRowName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111' },
  boardRowCount: { fontSize: 12, color: '#aaa' },
  boardRowAdd: { fontSize: 13, color: '#E63946', fontWeight: '700' },
  sep: { height: 1, backgroundColor: '#f5f5f5' },
  createRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  createInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111',
  },
  createBtn: {
    backgroundColor: '#E63946', borderRadius: 12,
    paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  newBoardBtn: {
    marginTop: 12, borderWidth: 1.5, borderColor: '#E63946',
    borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  newBoardBtnText: { color: '#E63946', fontWeight: '700', fontSize: 13 },
});
