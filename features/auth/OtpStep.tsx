import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errors';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

const LENGTH = 6;
const RESEND_SECONDS = 60;

function emailParam(raw: unknown): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/**
 * 6-digit code entry. One real TextInput (iOS one-time-code autofill,
 * paste, VoiceOver) drawn as six boxes. Verifies automatically on the 6th
 * digit; where to go next is decided by the root auth gate.
 */
export function OtpStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = useMemo(() => emailParam(params.email), [params.email]);
  const input = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/auth/email'));

  const verify = async (token: string) => {
    if (!email) { setError('Missing email — go back and try again.'); return; }
    setBusy(true);
    setError('');
    const { error: e } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (e) {
      haptic.warn();
      setError(/expired/i.test(e.message) ? 'That code expired. Send a new one.' : "That code didn't work. Check it and try again.");
      setCode('');
      input.current?.focus();
      return;
    }
    haptic.commit();
    // Session change → root gate routes to profile setup, onboarding or map.
  };

  const onChange = (t: string) => {
    const digits = t.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    setError('');
    if (digits.length === LENGTH) verify(digits);
  };

  const resend = async () => {
    if (cooldown > 0 || !email) return;
    const { error: e } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (e) { setError(toUserMessage(e, "Couldn't resend. Try again shortly.")); return; }
    setCooldown(RESEND_SECONDS);
  };

  // Reached without an email (stale history, bad deep link): never a dead end.
  if (!email) return <Redirect href="/auth/email" />;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.inner, { paddingTop: insets.top + SPACE.sm }]}>
        <PressableScale onPress={goBack} style={s.back} accessibilityLabel="Change email">
          <Icon name="chevron.left" fallback="‹" size={18} color={colors.ink} />
          <Text variant="bodyStrong">Email</Text>
        </PressableScale>
        <Text variant="title" accessibilityRole="header">Check your <Text variant="title" italic tone="thread">inbox</Text>.</Text>
        <Text variant="callout" tone="secondary">We sent a 6-digit code to <Text variant="callout">{email}</Text></Text>

        <Pressable onPress={() => input.current?.focus()} style={s.boxes} accessibilityRole="none">
          {Array.from({ length: LENGTH }).map((_, i) => {
            const active = i === code.length && !busy;
            return (
              <View key={i} style={[s.box, active && { borderColor: colors.thread, borderWidth: 2 }, !!error && { borderColor: colors.danger }]}>
                <Text variant="title" style={s.digit}>{code[i] ?? ''}</Text>
              </View>
            );
          })}
          <TextInput
            ref={input}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoFocus
            maxLength={LENGTH}
            style={s.hidden}
            accessibilityLabel="6-digit sign-in code"
            testID="auth-otp"
          />
        </Pressable>

        {busy ? <ActivityIndicator color={colors.thread} /> : null}
        {error ? <Text variant="callout" tone="danger" accessibilityLiveRegion="polite">{error}</Text> : null}

        <PressableScale onPress={resend} disabled={cooldown > 0} style={s.resend} accessibilityLabel={cooldown > 0 ? `Resend available in ${cooldown} seconds` : 'Resend code'}>
          <Text variant="label" tone={cooldown > 0 ? 'tertiary' : 'thread'}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    inner: { flex: 1, paddingHorizontal: GUTTER + 4, gap: SPACE.md },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start', marginBottom: SPACE.lg },
    boxes: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xl },
    box: {
      flex: 1, aspectRatio: 0.82, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.hairline,
      backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
    },
    digit: { fontFamily: 'DMMono-Medium', fontSize: 26 },
    hidden: { position: 'absolute', opacity: 0.011, width: 1, height: 1 },
    resend: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: SPACE.lg },
  }),
);
