import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { COLORS, GLASS, GLASS_SM } from '../../constants/theme';

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export default function ProfileSetupScreen() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameError, setUsernameError] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const checkUsername = useCallback(async (value: string) => {
    const lower = value.trim().toLowerCase();
    if (!lower) { setUsernameStatus('idle'); return; }
    if (!USERNAME_REGEX.test(lower)) {
      setUsernameStatus('invalid');
      setUsernameError('3–20 chars: lowercase letters, numbers, underscores only.');
      return;
    }
    setUsernameStatus('checking');
    setUsernameError('');
    const { data } = await supabase.from('users').select('id').eq('username', lower).single();
    if (data) {
      setUsernameStatus('taken');
      setUsernameError('That username is already taken.');
    } else {
      setUsernameStatus('available');
      setUsernameError('');
    }
  }, []);

  let usernameDebounce: ReturnType<typeof setTimeout>;
  function handleUsernameChange(value: string) {
    const lower = value.toLowerCase();
    setUsername(lower);
    setUsernameStatus('idle');
    setUsernameError('');
    clearTimeout(usernameDebounce);
    usernameDebounce = setTimeout(() => checkUsername(lower), 500);
  }

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  }

  async function uploadAvatar(userId: string): Promise<string | null> {
    if (!avatarUri) return null;
    try {
      const ext = avatarUri.split('.').pop() ?? 'jpg';
      const path = `avatars/${userId}.${ext}`;
      const response = await fetch(avatarUri);
      const blob = await response.blob();
      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: `image/${ext}` });
      if (error) return null;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      return data.publicUrl;
    } catch {
      return null;
    }
  }

  async function handleFinish() {
    setDisplayNameError('');
    let valid = true;
    const trimmedDisplay = displayName.trim();
    if (!trimmedDisplay) { setDisplayNameError('Please enter a display name.'); valid = false; }
    if (!USERNAME_REGEX.test(username)) {
      setUsernameStatus('invalid');
      setUsernameError('3–20 chars: lowercase letters, numbers, underscores only.');
      valid = false;
    }
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') valid = false;
    if (!valid) return;

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setLoading(false);
      Alert.alert('Error', 'Could not retrieve your email. Please sign in again.');
      return;
    }

    const avatarUrl = await uploadAvatar(user.id);

    const { error: insertError } = await supabase.from('users').insert({
      id: user.id,
      email: user.email,
      username,
      display_name: trimmedDisplay,
      avatar_url: avatarUrl,
      campus: 'columbia',
      onboarding_complete: false,
      is_verified: true,
    });

    setLoading(false);

    if (insertError) {
      console.error('[profile-setup] insert error:', JSON.stringify(insertError));
      if (insertError.message.includes('unique') && insertError.message.includes('username')) {
        setUsernameStatus('taken');
        setUsernameError('That username is already taken.');
      } else {
        Alert.alert(
          'Profile creation failed',
          `code: ${insertError.code ?? '—'}\nmessage: ${insertError.message ?? '—'}\ndetails: ${insertError.details ?? '—'}\nhint: ${insertError.hint ?? '—'}`,
        );
      }
      return;
    }

    router.replace('/onboarding/welcome');
  }

  const canSubmit =
    username.length >= 3 &&
    displayName.trim().length > 0 &&
    (usernameStatus === 'available' || usernameStatus === 'idle') &&
    !loading;

  const usernameIndicator =
    usernameStatus === 'checking' ? '…' :
    usernameStatus === 'available' ? '✓' :
    (usernameStatus === 'taken' || usernameStatus === 'invalid') ? '✕' : '';

  const usernameIndicatorColor =
    usernameStatus === 'available' ? '#22c55e' : COLORS.primary;

  const initials = displayName.trim().split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={styles.safe}>

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Set up your profile</Text>
            <Text style={styles.subtitle}>How friends find you — Filo started at Columbia & Barnard.</Text>

            {/* Avatar */}
            <TouchableOpacity style={styles.avatarContainer} onPress={pickAvatar} activeOpacity={0.8}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  {initials ? (
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  ) : (
                    <Text style={styles.avatarPlaceholderText}>+</Text>
                  )}
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Text style={styles.avatarEditIcon}>✎</Text>
              </View>
              <Text style={styles.avatarLabel}>
                {avatarUri ? 'Change photo' : 'Add photo'}
              </Text>
            </TouchableOpacity>

            {/* Display name */}
            <View style={[styles.fieldCard, GLASS_SM]}>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                style={[styles.input, displayNameError ? styles.inputError : null]}
                placeholder="Your name"
                placeholderTextColor="rgba(26,26,26,0.35)"
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setDisplayNameError(''); }}
                autoCapitalize="words"
                returnKeyType="next"
              />
              {displayNameError ? <Text style={styles.errorText}>{displayNameError}</Text> : null}
            </View>

            {/* Username */}
            <View style={[styles.fieldCard, GLASS_SM]}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.usernameRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.usernameInput,
                    (usernameStatus === 'taken' || usernameStatus === 'invalid') ? styles.inputError : null,
                    usernameStatus === 'available' ? styles.inputValid : null,
                  ]}
                  placeholder="lowercase_only"
                  placeholderTextColor="rgba(26,26,26,0.35)"
                  value={username}
                  onChangeText={handleUsernameChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
                {usernameStatus !== 'idle' && (
                  <Text style={[styles.usernameIndicator, { color: usernameIndicatorColor }]}>
                    {usernameIndicator}
                  </Text>
                )}
              </View>
              {usernameError ? (
                <Text style={styles.errorText}>{usernameError}</Text>
              ) : (
                <Text style={styles.hint}>Letters, numbers, underscores · 3–20 chars</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleFinish}
              disabled={!canSubmit}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create my profile →</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48, gap: 20 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, marginTop: -12 },

  avatarContainer: { alignItems: 'center', gap: 10, position: 'relative', paddingVertical: 4 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(230,57,70,0.15)',
    borderWidth: 1.5, borderColor: COLORS.primary + '44',
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: COLORS.primary },
  avatarPlaceholderText: { fontSize: 28, color: COLORS.primary },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 32, right: '31%',
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditIcon: { fontSize: 12, color: COLORS.textPrimary },
  avatarLabel: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },

  fieldCard: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.2 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, color: COLORS.textPrimary,
  },
  inputError: { borderColor: COLORS.primary },
  inputValid: { borderColor: '#22c55e' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  usernameInput: { flex: 1 },
  usernameIndicator: { fontSize: 20, fontWeight: '700', width: 24, textAlign: 'center' },
  errorText: { fontSize: 13, color: COLORS.primary },
  hint: { fontSize: 12, color: COLORS.textMuted },

  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 14, paddingVertical: 17,
    alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
