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
import { COLORS, GLASS, GLASS_SM } from '../../constants/theme';

type Visibility = 'private' | 'friends' | 'public';

const VISIBILITY_OPTIONS: { key: Visibility; label: string; desc: string; color: string }[] = [
  { key: 'public',  label: 'Public',  desc: 'Anyone can view. Shareable link works.',  color: '#22c55e' },
  { key: 'friends', label: 'Friends', desc: 'Only people you follow can see it.',       color: '#3b82f6' },
  { key: 'private', label: 'Private', desc: 'Only you.',                                color: 'rgba(255,255,255,0.4)' },
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
    if (!name.trim()) { setNameError('Board name is required.'); return; }
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
    <View style={styles.safe}>
      <View style={styles.orbRed} pointerEvents="none" />
      <View style={styles.orbBlue} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.title}>New board</Text>
              <TouchableOpacity
                onPress={handleCreate}
                disabled={saving}
                style={[styles.createBtn, saving && styles.createBtnDisabled]}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.createBtnText}>Create</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Board name *</Text>
              <TextInput
                style={[styles.input, nameError ? styles.inputError : null]}
                placeholder="e.g. Late Night Eats"
                placeholderTextColor="rgba(26,26,26,0.35)"
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
                Description <Text style={styles.optional}>(optional)</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="What's this board for?"
                placeholderTextColor="rgba(26,26,26,0.35)"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Visibility */}
            <View style={styles.field}>
              <Text style={styles.label}>Visibility</Text>
              <View style={styles.visOptions}>
                {VISIBILITY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.visOption,
                      visibility === opt.key && { borderColor: opt.color + '66', backgroundColor: opt.color + '10' },
                    ]}
                    onPress={() => setVisibility(opt.key)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.visOptionTop}>
                      <View style={[styles.radio, visibility === opt.key && { borderColor: opt.color }]}>
                        {visibility === opt.key && <View style={[styles.radioDot, { backgroundColor: opt.color }]} />}
                      </View>
                      <Text style={[styles.visLabel, visibility === opt.key && { color: opt.color }]}>
                        {opt.label}
                      </Text>
                    </View>
                    <Text style={styles.visDesc}>{opt.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {visibility === 'public' && (
              <View style={[styles.infoBox, GLASS_SM]}>
                <Text style={styles.infoText}>
                  A shareable link will be generated. Anyone with the link can view this board.
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
  safe: { flex: 1, backgroundColor: COLORS.bg },
  orbRed: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(230,57,70,0.13)', top: -50, right: -60,
  },
  orbBlue: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(67,97,238,0.09)', bottom: 80, left: -60,
  },
  container: { paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26,26,26,0.08)',
  },
  cancelText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '500' },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  createBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8,
    minWidth: 70, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 },

  field: { paddingHorizontal: 20, paddingTop: 24, gap: 8 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  optional: { color: COLORS.textMuted, fontWeight: '400' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(26,26,26,0.14)',
    borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: COLORS.textPrimary,
  },
  textArea: { minHeight: 80, paddingTop: 13 },
  inputError: { borderColor: COLORS.primary },
  errorText: { fontSize: 13, color: COLORS.primary },

  visOptions: { gap: 10 },
  visOption: {
    borderWidth: 1.5,
    borderColor: 'rgba(26,26,26,0.12)',
    borderRadius: 14, padding: 14, gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  visOptionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: 'rgba(26,26,26,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  visLabel: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  visDesc: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 28 },

  infoBox: { marginHorizontal: 20, marginTop: 16, padding: 14 },
  infoText: { fontSize: 13, color: '#7B93FF', lineHeight: 18 },
});
