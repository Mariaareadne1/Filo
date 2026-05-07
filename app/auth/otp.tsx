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
import { useState, useRef, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { COLORS, GLASS } from '../../constants/theme';

const OTP_LENGTH = 6;

export default function OTPScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleVerify() {
    setError('');
    if (otp.length !== OTP_LENGTH) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message.toLowerCase().includes('expired')
        ? 'This code has expired. Please request a new one.'
        : 'Invalid code. Please try again.');
      setOtp('');
      return;
    }
    const userId = data.user?.id;
    if (!userId) { setError('Something went wrong. Please try again.'); return; }
    const { data: profile } = await supabase.from('users').select('id').eq('id', userId).single();
    if (profile) router.replace('/(app)'); else router.replace('/auth/profile-setup');
  }

  async function handleVerifyWithValue(value: string) {
    setError('');
    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: value, type: 'email' });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message.toLowerCase().includes('expired')
        ? 'This code has expired. Please request a new one.'
        : 'Invalid code. Please try again.');
      setOtp('');
      return;
    }
    const userId = data.user?.id;
    if (!userId) { setError('Something went wrong. Please try again.'); return; }
    const { data: profile } = await supabase.from('users').select('id').eq('id', userId).single();
    if (profile) router.replace('/(app)'); else router.replace('/auth/profile-setup');
  }

  async function handleResend() {
    setError('');
    setOtp('');
    const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (otpError) setError(otpError.message); else setResendCooldown(60);
  }

  return (
    <View style={styles.safe}>

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.emailBold}>{email}</Text>
            </Text>
          </View>

          <TouchableOpacity
            style={styles.otpContainer}
            onPress={() => inputRef.current?.focus()}
            activeOpacity={1}
          >
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.otpBox,
                  otp.length === i && styles.otpBoxActive,
                  error && styles.otpBoxError,
                ]}
              >
                <Text style={styles.otpChar}>{otp[i] ?? ''}</Text>
              </View>
            ))}
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            value={otp}
            onChangeText={(t) => {
              setError('');
              const digits = t.replace(/\D/g, '').slice(0, OTP_LENGTH);
              setOtp(digits);
              if (digits.length === OTP_LENGTH) {
                setTimeout(() => { setOtp(digits); handleVerifyWithValue(digits); }, 100);
              }
            }}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            style={styles.hiddenInput}
            autoFocus
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (loading || otp.length !== OTP_LENGTH) && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading || otp.length !== OTP_LENGTH}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't get a code? </Text>
            {resendCooldown > 0 ? (
              <Text style={styles.resendCooldown}>Resend in {resendCooldown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendLink}>Resend</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  back: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },
  header: { marginTop: 32, marginBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 10, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22 },
  emailBold: { fontWeight: '700', color: COLORS.textPrimary },

  otpContainer: {
    flexDirection: 'row', gap: 10,
    justifyContent: 'center', marginBottom: 28,
  },
  otpBox: {
    width: 48, height: 58, borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  otpBoxActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  otpBoxError: { borderColor: COLORS.primary },
  otpChar: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },

  errorText: { fontSize: 13, color: COLORS.primary, textAlign: 'center', marginBottom: 16 },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  resendLabel: { fontSize: 14, color: COLORS.textSecondary },
  resendCooldown: { fontSize: 14, color: COLORS.textMuted },
  resendLink: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
});
