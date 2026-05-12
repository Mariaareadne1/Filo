import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
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
  STICKER_SHADOW_LG,
  SCREEN_PAD,
} from '../../constants/theme';

/** Loose format check — any real inbox works for demo / OTP (no campus-only gate). */
function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export default function EmailScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleContinue() {
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError('please enter your email address.'); return; }
    if (!isValidEmailFormat(trimmed)) {
      setError('please enter a valid email address.');
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpError) { setError(otpError.message.toLowerCase()); return; }
    router.push({ pathname: '/auth/otp', params: { email: trimmed } });
  }

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Brand */}
          <View style={styles.brand}>
            <Text style={styles.metaLabel}>COLUMBIA · BARNARD</Text>
            <Text style={styles.wordmark}>
              filo<Text style={styles.wordmarkDot}>.</Text>
            </Text>
            <Text style={styles.tagline}>
              the map your <Text style={styles.taglineItalic}>friends</Text> would draw.
            </Text>
          </View>

          {/* Form card */}
          <View style={styles.formCard}>
            <Text style={styles.fieldKicker}>EMAIL</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              placeholder="you@email.com"
              placeholderTextColor={PALETTE.inkMute}
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={handleContinue}
              returnKeyType="done"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={PALETTE.surface} />
              ) : (
                <Text style={styles.buttonText}>continue →</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.fine}>
            built at columbia & barnard — sign in with any email for this demo.
          </Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  container: {
    flex: 1,
    paddingHorizontal: SCREEN_PAD + 4,
    justifyContent: 'center',
    gap: 28,
  },

  brand: { alignItems: 'center', gap: 8 },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginBottom: 2,
  },
  wordmark: {
    fontFamily: FONTS.display,
    fontSize: 64,
    color: PALETTE.ink,
    fontWeight: '400',
    fontStyle: 'italic',
    letterSpacing: -2,
    lineHeight: 64,
  },
  wordmarkDot: { color: ACCENT.red },
  tagline: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: PALETTE.inkSoft,
    textAlign: 'center',
    marginTop: 6,
  },
  taglineItalic: {
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    color: ACCENT.red,
  },

  formCard: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    padding: 22,
    gap: 12,
    ...STICKER_SHADOW_LG,
  },
  fieldKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  input: {
    backgroundColor: PALETTE.bg,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: FONTS.body,
    fontSize: 15,
    color: PALETTE.ink,
  },
  inputError: { borderColor: ACCENT.red },
  errorText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: ACCENT.red,
    marginTop: -4,
  },
  button: {
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    ...STICKER_SHADOW,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  fine: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: PALETTE.inkMute,
    textAlign: 'center',
  },
});
