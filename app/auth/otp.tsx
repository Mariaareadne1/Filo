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
import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
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

const OTP_LENGTH = 6;

function normalizeEmailParam(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim().toLowerCase();
  if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim().toLowerCase();
  return '';
}

/** After OTP success: profile missing → setup; else honour onboarding flag. */
async function routeAfterSignIn(userId: string, router: { replace: (href: string) => void }) {
  const { data: row } = await supabase
    .from('users')
    .select('id, onboarding_complete')
    .eq('id', userId)
    .maybeSingle();

  if (!row) {
    router.replace('/auth/profile-setup');
    return;
  }
  if (!row.onboarding_complete) {
    router.replace('/onboarding/welcome');
    return;
  }
  router.replace('/(app)/discover');
}

export default function OTPScreen() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = useMemo(() => normalizeEmailParam(params.email), [params.email]);

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
    if (!email) {
      setError('missing email. go back and sign in again.');
      return;
    }
    if (otp.length !== OTP_LENGTH) { setError('enter the 6-digit code.'); return; }
    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message.toLowerCase().includes('expired')
        ? 'this code has expired. request a new one.'
        : 'invalid code. try again.');
      setOtp('');
      return;
    }
    const userId = data.user?.id;
    if (!userId) { setError('something went wrong. try again.'); return; }
    await routeAfterSignIn(userId, router);
  }

  async function handleVerifyWithValue(value: string) {
    setError('');
    if (!email) {
      setError('missing email. go back and sign in again.');
      return;
    }
    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: value, type: 'email' });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message.toLowerCase().includes('expired')
        ? 'this code has expired. request a new one.'
        : 'invalid code. try again.');
      setOtp('');
      return;
    }
    const userId = data.user?.id;
    if (!userId) { setError('something went wrong. try again.'); return; }
    await routeAfterSignIn(userId, router);
  }

  async function handleResend() {
    setError('');
    setOtp('');
    if (!email) {
      setError('missing email. go back and sign in again.');
      return;
    }
    const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (otpError) setError(otpError.message.toLowerCase()); else setResendCooldown(60);
  }

  if (!email) {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={[styles.container, { justifyContent: 'center', gap: 16 }]}>
            <Text style={styles.title}>something went wrong</Text>
            <Text style={styles.subtitle}>go back and enter your email again.</Text>
            <TouchableOpacity style={styles.button} onPress={() => router.back()} activeOpacity={0.85}>
              <Text style={styles.buttonText}>← back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>← back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.metaLabel}>VERIFY</Text>
            <Text style={styles.title}>
              check your <Text style={styles.titleItalic}>email.</Text>
            </Text>
            <Text style={styles.subtitle}>
              we sent a 6-digit code to{'\n'}
              <Text style={styles.emailBold}>{email}</Text>
            </Text>
          </View>

          {/* OTP card */}
          <View style={styles.otpCard}>
            <TouchableOpacity
              style={styles.otpRow}
              onPress={() => inputRef.current?.focus()}
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel="Enter 6-digit verification code"
              importantForAccessibility="no-hide-descendants"
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
              accessibilityLabel="6-digit verification code"
              accessibilityValue={{ text: `${otp.length} of ${OTP_LENGTH} digits entered` }}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, (loading || otp.length !== OTP_LENGTH) && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading || otp.length !== OTP_LENGTH}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={PALETTE.surface} accessibilityLabel="Verifying code" />
              ) : (
                <Text style={styles.buttonText}>verify →</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>didn't get a code? </Text>
            {resendCooldown > 0 ? (
              <Text style={styles.resendCooldown}>resend in {resendCooldown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend} hitSlop={6}>
                <Text style={styles.resendLink}>resend</Text>
              </TouchableOpacity>
            )}
          </View>
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
    paddingTop: 12,
  },
  back: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },

  header: { marginTop: 24, marginBottom: 28, gap: 8 },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 32,
    lineHeight: 34,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  titleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    lineHeight: 19,
    marginTop: 4,
  },
  emailBold: {
    fontFamily: FONTS.body,
    fontWeight: '700',
    color: PALETTE.ink,
  },

  otpCard: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    padding: 18,
    gap: 14,
    ...STICKER_SHADOW_LG,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  otpBox: {
    width: 44,
    height: 56,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: ACCENT.red,
    borderWidth: 2,
    backgroundColor: PALETTE.surface,
  },
  otpBoxError: { borderColor: ACCENT.red },
  otpChar: {
    fontFamily: FONTS.display,
    fontSize: 24,
    fontWeight: '400',
    color: PALETTE.ink,
  },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },

  errorText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: ACCENT.red,
    textAlign: 'center',
  },
  button: {
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingVertical: 14,
    alignItems: 'center',
    ...STICKER_SHADOW,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  resendLabel: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
  },
  resendCooldown: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: PALETTE.inkMute,
  },
  resendLink: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: ACCENT.red,
    fontWeight: '700',
  },
});
