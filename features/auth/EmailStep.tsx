import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errors';
import { EMAIL_RE, normalizeEmail } from '../../lib/validation';
import { Button } from '../../design/controls';
import { Text } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

/**
 * Early UX check against the server allowlist (the users trigger is the
 * real gate). Fails open on lookup errors so the server stays authoritative.
 */
async function isAllowedDomain(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  const { data, error } = await supabase.from('auth_allowed_domains').select('domain').eq('domain', domain).maybeSingle();
  if (error) return true;
  return !!data;
}

export function EmailStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    const value = normalizeEmail(email);
    if (!EMAIL_RE.test(value)) { setError('Enter a valid email address.'); return; }
    setLoading(true);
    try {
      if (!(await isAllowedDomain(value))) {
        setError('Filo is invite-only for Columbia and Barnard emails.');
        return;
      }
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: value, options: { shouldCreateUser: true } });
      if (otpError) { setError(toUserMessage(otpError, "Couldn't send a code. Try again in a minute.")); return; }
      router.push({ pathname: '/auth/otp', params: { email: value } });
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.inner, { paddingTop: insets.top + SPACE.xxxl, paddingBottom: insets.bottom + SPACE.lg }]}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="secondary" style={s.kicker}>COLUMBIA · BARNARD</Text>
          <Text variant="hero" style={s.wordmark} accessibilityRole="header" accessibilityLabel="Filo">
            filo<Text variant="hero" tone="thread" style={s.wordmark}>.</Text>
          </Text>
          <Text variant="title" style={s.tagline}>
            The map your <Text variant="title" italic tone="thread" style={s.tagline}>friends</Text> would draw.
          </Text>
        </View>

        <View style={s.form}>
          <Text variant="label" tone="secondary">Your campus email</Text>
          <TextInput
            value={email}
            onChangeText={(t) => { setEmail(t); setError(''); }}
            placeholder="uni@columbia.edu"
            placeholderTextColor={colors.inkTertiary}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={submit}
            style={[s.input, !!error && { borderColor: colors.danger }]}
            accessibilityLabel="Campus email"
            testID="auth-email"
          />
          {error ? <Text variant="callout" tone="danger" accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button label="Send me a code" onPress={submit} busy={loading} disabled={!email.trim()} testID="auth-continue" />
          <Text variant="caption" tone="tertiary" style={s.fine}>
            We'll email a 6-digit code. No passwords. Your email is never shown to other people.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    inner: { flex: 1, paddingHorizontal: GUTTER + 4 },
    kicker: { letterSpacing: 1.2 },
    wordmark: { fontSize: 72, lineHeight: 80, letterSpacing: -2 },
    tagline: { marginTop: SPACE.sm, maxWidth: 320 },
    form: { gap: SPACE.md },
    input: {
      height: 54, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.surface,
      paddingHorizontal: SPACE.lg, fontSize: 17, color: c.ink,
    },
    fine: { textAlign: 'center' },
  }),
);
