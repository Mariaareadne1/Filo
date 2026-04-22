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

    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }

    if (!isValidCampusEmail(trimmed)) {
      setError('You must sign up with a @columbia.edu or @barnard.edu email.');
      return;
    }

    setLoading(true);
    // Omitting emailRedirectTo is what tells Supabase to send a 6-digit OTP
    // code rather than a magic link URL. The dashboard email template must use
    // {{ .Token }} (not {{ .ConfirmationURL }}) for this to show a code.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    router.push({ pathname: '/auth/otp', params: { email: trimmed } });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Filo</Text>
          <Text style={styles.tagline}>The map your friends would draw.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Enter your Columbia or Barnard email</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="you@columbia.edu"
            placeholderTextColor="#999"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError('');
            }}
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
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.fine}>
          Filo is currently invite-only for Columbia and Barnard students.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  header: { marginBottom: 48, alignItems: 'center' },
  logo: { fontSize: 42, fontWeight: '800', color: '#E63946', letterSpacing: -1 },
  tagline: { fontSize: 15, color: '#666', marginTop: 6 },
  form: { gap: 12 },
  label: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 4 },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  inputError: { borderColor: '#E63946' },
  errorText: { fontSize: 13, color: '#E63946', marginTop: -4 },
  button: {
    backgroundColor: '#E63946',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  fine: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 32 },
});
