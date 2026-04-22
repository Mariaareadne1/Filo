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
type Visibility = 'private' | 'friends' | 'public';

const VISIBILITY_OPTIONS: { key: Visibility; label: string; desc: string; color: string }[] = [
  { key: 'public',  label: 'Public',  desc: 'Anyone can view. Shareable link works.',  color: '#22c55e' },
  { key: 'friends', label: 'Friends', desc: 'Only people you follow can see it.',       color: '#3b82f6' },
  { key: 'private', label: 'Private', desc: 'Only you.',                                color: '#aaa' },
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
    if (!name.trim()) {
      setNameError('Board name is required.');
      return;
    }
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
    <SafeAreaView style={styles.safe}>
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
              style={[styles.input, nameError && styles.inputError]}
              placeholder="e.g. Late Night Eats"
              placeholderTextColor="#bbb"
              value={name}
              onChangeText={(t) => { setName(t); setNameError(''); }}
              autoFocus
              returnKeyType="next"
            />
            {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="What's this board for?"
              placeholderTextColor="#bbb"
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
                    visibility === opt.key && { borderColor: opt.color, backgroundColor: opt.color + '10' },
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
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                📎 A shareable link will be generated. Anyone with the link can view this board without an account.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cancelText: { fontSize: 15, color: '#888', fontWeight: '500' },
  title: { fontSize: 17, fontWeight: '800', color: '#111' },
  createBtn: {
    backgroundColor: '#E63946',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  field: { paddingHorizontal: 20, paddingTop: 24, gap: 8 },
  label: { fontSize: 14, fontWeight: '700', color: '#111' },
  optional: { color: '#aaa', fontWeight: '400' },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  textArea: { minHeight: 80, paddingTop: 13 },
  inputError: { borderColor: '#E63946' },
  errorText: { fontSize: 13, color: '#E63946' },

  visOptions: { gap: 10 },
  visOption: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  visOptionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  visLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
  visDesc: { fontSize: 12, color: '#888', marginLeft: 28 },

  infoBox: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    padding: 14,
  },
  infoText: { fontSize: 13, color: '#4361EE', lineHeight: 18 },
});
