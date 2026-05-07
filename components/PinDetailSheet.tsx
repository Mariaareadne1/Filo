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
  ScrollView,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { MapPin, CATEGORY_LABELS } from '../types';
import { supabase } from '../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FRIEND_COLORS,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  SCREEN_PAD,
  TAB_CLEARANCE,
} from '../constants/theme';

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
  const router = useRouter();
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
    Alert.alert('saved', `${pin.place_name} added to board.`);
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

  function openReview() {
    if (!pin) return;
    onClose();
    router.push({
      pathname: '/pin/review',
      params: {
        placeId: pin.place_id,
        placeName: pin.place_name,
        category: pin.category,
      },
    });
  }

  if (!pin) return null;

  const p = pin as MapPin & {
    myRank?: number;
    myCategoryTotal?: number;
    friendRanks?: { username: string; rank: number; total: number; categoryLabel?: string }[];
  };

  const label = CATEGORY_LABELS[pin.category] ?? pin.category;
  const initials = pin.display_name
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const hasMyRank = typeof p.myRank === 'number' && typeof p.myCategoryTotal === 'number';
  const friendRanks = p.friendRanks ?? [];

  return (
    <Modal transparent animationType="none" visible={!!pin} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />

        {!showBoardPicker ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.metaRow}>
              <Text style={styles.metaCategory}>{label.toUpperCase()}</Text>
              <View style={styles.metaDivider} />
              <Text style={styles.metaPin}>n° {pin.pin_id.slice(0, 4)}</Text>
            </View>

            <Text style={styles.placeName}>{pin.place_name}</Text>
            <Text style={styles.address}>{pin.address}</Text>

            {hasMyRank ? (
              <Pressable onPress={openReview} style={styles.rankCard}>
                <View style={styles.rankCardLeft}>
                  <Text style={styles.rankCardKicker}>YOUR RANK</Text>
                  <Text style={styles.rankCardNum}>
                    #{p.myRank}
                    <Text style={styles.rankCardTotal}> / {p.myCategoryTotal}</Text>
                  </Text>
                  <Text style={styles.rankCardCat}>{label.toLowerCase()}</Text>
                </View>
                <View style={styles.rankCardRight}>
                  <Text style={styles.rankCardEdit}>edit →</Text>
                </View>
              </Pressable>
            ) : (
              <TouchableOpacity onPress={openReview} style={styles.rankCardEmpty}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankCardKicker}>UNRANKED</Text>
                  <Text style={styles.rankCardEmptyTitle}>rank it</Text>
                </View>
                <Text style={styles.rankCardArrow}>→</Text>
              </TouchableOpacity>
            )}

            {friendRanks.length > 0 && (
              <View style={styles.friendStripWrap}>
                <Text style={styles.friendStripKicker}>FRIENDS' RANKS</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.friendStrip}
                >
                  {friendRanks.map((f, i) => {
                    const color = FRIEND_COLORS[i % FRIEND_COLORS.length];
                    return (
                      <View key={f.username + i} style={styles.friendChip}>
                        <View style={[styles.friendDot, { backgroundColor: color }]} />
                        <View style={{ gap: 2 }}>
                          <Text style={styles.friendName}>@{f.username}</Text>
                          <Text style={styles.friendRank}>
                            #{f.rank}/{f.total} {f.categoryLabel ?? label.toLowerCase()}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {pin.impression ? (
              <View style={styles.impressionBox}>
                <Text style={styles.impressionMark}>"</Text>
                <Text style={styles.impressionText}>{pin.impression}</Text>
              </View>
            ) : null}

            <View style={[styles.statusPill, pin.status === 'visited' ? styles.visited : styles.wantToGo]}>
              <Text style={styles.statusText}>
                {pin.status === 'visited' ? '✓ visited' : '○ want to go'}
              </Text>
            </View>

            <View style={styles.userRow}>
              {pin.avatar_url ? (
                <Image source={{ uri: pin.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.pinnedBy}>PINNED BY</Text>
                <Text style={styles.username}>@{pin.username}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.addToBoardBtn} onPress={openBoardPicker} activeOpacity={0.85}>
              <Text style={styles.addToBoardText}>+ add to board</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>close</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <>
            <View style={styles.boardPickerHeader}>
              <Text style={styles.boardPickerTitle}>add to board</Text>
              <TouchableOpacity onPress={() => setShowBoardPicker(false)}>
                <Text style={styles.boardPickerBack}>← back</Text>
              </TouchableOpacity>
            </View>

            {boardsLoading ? (
              <ActivityIndicator color={ACCENT.red} style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={boards}
                keyExtractor={(b) => b.id}
                style={styles.boardList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  !showCreate
                    ? <Text style={styles.emptyBoards}>no boards yet. create one below.</Text>
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
                      ? <ActivityIndicator size="small" color={ACCENT.red} />
                      : <Text style={styles.boardRowAdd}>add →</Text>
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
                  placeholder="new board name…"
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
                  disabled={saving || !newBoardName.trim()}
                >
                  {saving
                    ? <ActivityIndicator color={PALETTE.surface} size="small" />
                    : <Text style={styles.createBtnText}>create</Text>
                  }
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.newBoardBtn} onPress={() => setShowCreate(true)}>
                <Text style={styles.newBoardBtnText}>+ create new board</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </Animated.View>
    </Modal>
  );
}const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 15, 0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '78%',
    backgroundColor: PALETTE.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: PALETTE.inkLine,
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 12,
    paddingBottom: TAB_CLEARANCE,
    ...STICKER_SHADOW_LG,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: PALETTE.inkLine,
    marginBottom: 14,
  },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  metaCategory: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  metaDivider: {
    width: 1,
    height: 9,
    backgroundColor: PALETTE.inkLine,
  },
  metaPin: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
  },

  placeName: {
    fontFamily: FONTS.display,
    fontSize: 28,
    lineHeight: 32,
    color: PALETTE.ink,
    fontWeight: '400',
    marginBottom: 4,
  },
  address: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    marginBottom: 18,
  },

  // Rank card (filled)
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: ACCENT.red,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    ...STICKER_SHADOW_LG,
  },
  rankCardLeft: { flex: 1, gap: 2 },
  rankCardKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  rankCardNum: {
    fontFamily: FONTS.display,
    fontSize: 36,
    lineHeight: 38,
    color: ACCENT.red,
    fontStyle: 'italic',
    fontWeight: '400',
  },
  rankCardTotal: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: PALETTE.inkSoft,
    fontStyle: 'normal',
  },
  rankCardCat: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },
  rankCardRight: {
    paddingLeft: 12,
  },
  rankCardEdit: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: ACCENT.red,
    textTransform: 'lowercase',
  },

  // Rank card (empty / CTA)
  rankCardEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: ACCENT.red,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 14,
    ...STICKER_SHADOW_LG,
  },
  rankCardEmptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.surface,
    fontStyle: 'italic',
    fontWeight: '400',
    marginTop: 2,
  },
  rankCardArrow: {
    fontFamily: FONTS.body,
    fontSize: 22,
    color: PALETTE.surface,
  },

  // Friend ranks strip
  friendStripWrap: {
    marginBottom: 14,
  },
  friendStripKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginBottom: 8,
  },
  friendStrip: {
    gap: 8,
  },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...STICKER_SHADOW,
  },
  friendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  friendName: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.ink,
  },
  friendRank: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: PALETTE.inkSoft,
  },

  // Impression
  impressionBox: {
    backgroundColor: PALETTE.zone1,
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    position: 'relative',
  },
  impressionMark: {
    position: 'absolute',
    top: -4,
    left: 8,
    fontFamily: FONTS.display,
    fontSize: 36,
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  impressionText: {
    fontFamily: FONTS.body,
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.ink,
    paddingLeft: 16,
    fontStyle: 'italic',
  },

  // Status pill
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADII.pill,
    borderWidth: 1,
    marginBottom: 16,
  },
  visited: {
    backgroundColor: PALETTE.surface,
    borderColor: PALETTE.ink,
  },
  wantToGo: {
    backgroundColor: 'transparent',
    borderColor: PALETTE.inkLine,
  },
  statusText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '600',
    color: PALETTE.ink,
  },

  // User row
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: PALETTE.inkLine,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PALETTE.zone2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
  },
  avatarInitials: {
    fontFamily: FONTS.display,
    fontSize: 14,
    color: PALETTE.ink,
  },
  pinnedBy: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  username: {
    fontFamily: FONTS.body,
    fontSize: 14,
    fontWeight: '700',
    color: PALETTE.ink,
    marginTop: 2,
  },

  // Add to board
  addToBoardBtn: {
    backgroundColor: PALETTE.ink,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  addToBoardText: {
    fontFamily: FONTS.display,
    fontSize: 16,
    color: PALETTE.bg,
    fontWeight: '400',
  },

  closeBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },

  // Board picker
  boardPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  boardPickerTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  boardPickerBack: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
  },
  boardList: {
    maxHeight: 280,
    marginBottom: 12,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  boardRowName: {
    flex: 1,
    fontFamily: FONTS.display,
    fontSize: 16,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  boardRowCount: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
  },
  boardRowAdd: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: ACCENT.red,
  },
  sep: {
    height: 1,
    backgroundColor: PALETTE.inkLine,
  },
  emptyBoards: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
    paddingVertical: 24,
  },

  newBoardBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
    borderStyle: 'dashed',
  },
  newBoardBtnText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.ink,
  },
  createRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  createInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: PALETTE.ink,
    backgroundColor: PALETTE.surface,
  },
  createBtn: {
    backgroundColor: ACCENT.red,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: ACCENT.red,
    ...STICKER_SHADOW,
  },
  createBtnDisabled: {
    opacity: 0.4,
  },
  createBtnText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: '700',
    color: PALETTE.surface,
  },
});