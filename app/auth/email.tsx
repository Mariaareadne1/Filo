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
import { COLORS, GLASS, GLASS_SM } from '../../constants/theme';

const ALLOWED_DOMAINS = ['columbia.edu', 'barnard.edu'];

function isValidCampusEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return ALLOWED_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

export default function EmailScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleContinue() {
    setError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError('Please enter your email address.'); return; }
    if (!isValidCampusEmail(trimmed)) {
      setError('You must sign up with a @columbia.edu or @barnard.edu email.');
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpError) { setError(otpError.message); return; }
    router.push({ pathname: '/auth/otp', params: { email: trimmed } });
  }

  return (
    <View style={styles.safe}>
      {/* Orbs */}
      {/* Red thread */}
      <View style={styles.thread1} pointerEvents="none" />
      <View style={styles.thread2} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Brand */}
          <View style={styles.brand}>
            <View style={styles.logoRing}>
              <Text style={styles.logoPin}>◉</Text>
            </View>
            <Text style={styles.logoWord}>Filo</Text>
            <Text style={styles.tagline}>The map your friends would draw.</Text>
          </View>

          {/* Form */}
          <View style={[styles.formCard, GLASS]}>
            <Text style={styles.label}>Columbia or Barnard email</Text>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              placeholder="you@columbia.edu"
              placeholderTextColor="rgba(26,26,26,0.35)"
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
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continue →</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.fine}>
            Filo is invite-only for Columbia and Barnard students.
          </Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  thread1: {
    position: 'absolute', width: 200, height: 80, borderRadius: 80,
    borderTopWidth: 1.5, borderColor: 'rgba(230,57,70,0.3)',
    borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
    bottom: 160, right: 0,
  },
  thread2: {
    position: 'absolute', width: 140, height: 60, borderRadius: 60,
    borderBottomWidth: 1.5, borderColor: 'rgba(67,97,238,0.25)',
    borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
    top: 120, left: 0,
  },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 32 },
  brand: { alignItems: 'center', gap: 10 },
  logoRing: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: COLORS.primary + '55',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary + '15',
  },
  logoPin: { fontSize: 28, color: COLORS.primary },
  logoWord: {
    fontSize: 44, fontWeight: '900', color: COLORS.textPrimary,
    letterSpacing: -1.5,
  },
  tagline: { fontSize: 15, color: COLORS.textSecondary },

  formCard: { padding: 24, gap: 14 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 2 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 15,
    fontSize: 16, color: COLORS.textPrimary,
  },
  inputError: { borderColor: COLORS.primary },
  errorText: { fontSize: 13, color: COLORS.primary, marginTop: -6 },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  fine: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
});
