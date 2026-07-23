import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FONTS,
  STICKER_SHADOW,
  SCREEN_PAD,
  VISIBILITY_COLOR,
} from '../../constants/theme';

type Visibility = 'private' | 'friends' | 'public';

const VISIBILITY_OPTIONS: { key: Visibility; label: string; desc: string }[] = [
  { key: 'public',  label: 'public',  desc: 'anyone can view. shareable link works.' },
  { key: 'friends', label: 'friends', desc: 'only people you follow can see it.' },
  { key: 'private', label: 'private', desc: 'only you.' },
];

function generateShareToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function CreateBoardScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  async function handleCreate() {
    if (!name.trim()) { setNameError('board name is required.'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const shareToken = visibility === 'public' ? generateShareToken() : null;
      const { error } = await supabase.from('boards').insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        share_token: shareToken,
      });
      if (error) throw error;
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.safe} accessibilityViewIsModal>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
                <Text style={styles.cancelText}>cancel</Text>
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.headerKicker}>NEW</Text>
                <Text style={styles.headerTitle}>
                  <Text style={styles.headerTitleItalic}>board.</Text>
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={saving}
                style={[styles.createBtn, saving && styles.createBtnDisabled]}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color={PALETTE.surface} size="small" />
                  : <Text style={styles.createBtnText}>create</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>BOARD NAME *</Text>
              <TextInput
                style={[styles.input, nameError ? styles.inputError : null]}
                placeholder="e.g. late night eats"
                placeholderTextColor={PALETTE.inkMute}
                value={name}
                onChangeText={(t) => { setName(t); setNameError(''); }}
                autoFocus
                returnKeyType="next"
              />
              {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>
                DESCRIPTION <Text style={styles.optional}>· optional</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="what's this board for?"
                placeholderTextColor={PALETTE.inkMute}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Visibility */}
            <View style={styles.field}>
              <Text style={styles.label}>VISIBILITY</Text>
              <View style={styles.visOptions}>
                {VISIBILITY_OPTIONS.map((opt) => {
                  const active = visibility === opt.key;
                  const dotColor = VISIBILITY_COLOR[opt.key];
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.visOption, active && styles.visOptionActive]}
                      onPress={() => setVisibility(opt.key)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.visOptionTop}>
                        <View style={[styles.radio, active && styles.radioActive]}>
                          {active && <View style={styles.radioDot} />}
                        </View>
                        <View style={[styles.visDot, { backgroundColor: dotColor }]} />
                        <Text style={styles.visLabel}>{opt.label}</Text>
                      </View>
                      <Text style={styles.visDesc}>{opt.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {visibility === 'public' && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  a shareable link will be generated. anyone with the link can view this board.
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  container: { paddingBottom: 48 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.inkLine,
    gap: 12,
  },
  cancelText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerKicker: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  headerTitle: {
    fontFamily: FONTS.display,
    fontSize: 18,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  headerTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  createBtn: {
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 70,
    alignItems: 'center',
    ...STICKER_SHADOW,
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
  },

  field: { paddingHorizontal: SCREEN_PAD, paddingTop: 22, gap: 8 },
  label: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  optional: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.inkMute,
    textTransform: 'lowercase',
  },
  input: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: FONTS.body,
    fontSize: 15,
    color: PALETTE.ink,
  },
  textArea: { minHeight: 88, paddingTop: 12 },
  inputError: { borderColor: ACCENT.red },
  errorText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: ACCENT.red,
  },

  visOptions: { gap: 8 },
  visOption: {
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    padding: 14,
    gap: 6,
  },
  visOptionActive: {
    ...STICKER_SHADOW,
  },
  visOptionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: ACCENT.red,
  },
  radioDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ACCENT.red,
  },
  visDot: { width: 8, height: 8, borderRadius: 4 },
  visLabel: {
    fontFamily: FONTS.display,
    fontSize: 17,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  visDesc: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    marginLeft: 26 + 8 + 8,
    lineHeight: 17,
  },

  infoBox: {
    marginHorizontal: SCREEN_PAD,
    marginTop: 18,
    padding: 14,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW,
  },
  infoText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    lineHeight: 17,
  },
});
