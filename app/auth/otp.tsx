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

const OTP_LENGTH = 6;

export default function OTPScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();

  // Countdown for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleVerify() {
    setError('');
    if (otp.length !== OTP_LENGTH) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });
    setLoading(false);

    if (verifyError) {
      if (verifyError.message.toLowerCase().includes('expired')) {
        setError('This code has expired. Please request a new one.');
      } else {
        setError('Invalid code. Please try again.');
      }
      setOtp('');
      return;
    }

    // Check if the user already has a profile row
    const userId = data.user?.id;
    if (!userId) {
      setError('Something went wrong. Please try again.');
      return;
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (profile) {
      // Existing user — go straight to the app
      router.replace('/(app)');
    } else {
      // New user — go to profile setup
      router.replace('/auth/profile-setup');
    }
  }

  async function handleResend() {
    setError('');
    setOtp('');
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (otpError) {
      setError(otpError.message);
    } else {
      setResendCooldown(60);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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

        {/* Hidden native input, boxes are visual only */}
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
              // Auto-submit when all 6 digits entered
              setTimeout(() => {
                setOtp(digits);
                handleVerifyWithValue(digits);
              }, 100);
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
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
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
  );

  async function handleVerifyWithValue(value: string) {
    setError('');
    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: value,
      type: 'email',
    });
    setLoading(false);

    if (verifyError) {
      if (verifyError.message.toLowerCase().includes('expired')) {
        setError('This code has expired. Please request a new one.');
      } else {
        setError('Invalid code. Please try again.');
      }
      setOtp('');
      return;
    }

    const userId = data.user?.id;
    if (!userId) { setError('Something went wrong. Please try again.'); return; }

    const { data: profile } = await supabase.from('users').select('id').eq('id', userId).single();
    if (profile) {
      router.replace('/(app)');
    } else {
      router.replace('/auth/profile-setup');
    }
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  back: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { fontSize: 15, color: '#E63946', fontWeight: '600' },
  header: { marginTop: 32, marginBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 10 },
  subtitle: { fontSize: 15, color: '#666', lineHeight: 22 },
  emailBold: { fontWeight: '700', color: '#111' },
  otpContainer: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 24,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: { borderColor: '#E63946', backgroundColor: '#fff' },
  otpBoxError: { borderColor: '#E63946' },
  otpChar: { fontSize: 22, fontWeight: '700', color: '#111' },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorText: { fontSize: 13, color: '#E63946', textAlign: 'center', marginBottom: 16 },
  button: {
    backgroundColor: '#E63946',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  resendLabel: { fontSize: 14, color: '#666' },
  resendCooldown: { fontSize: 14, color: '#aaa' },
  resendLink: { fontSize: 14, color: '#E63946', fontWeight: '600' },
});
