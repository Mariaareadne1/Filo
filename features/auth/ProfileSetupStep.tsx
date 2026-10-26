import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { toUserMessage } from '../../lib/errors';
import { readFileBytes } from '../../lib/fileBytes';
import { useOnboarding } from '../../contexts/onboarding';
import { Button } from '../../design/controls';
import { Icon, PressableScale, Text } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/** Creates the profile row (server binds email + campus from the session). */
export function ProfileSetupStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, email } = useSession();
  const { markProfileCreated } = useOnboarding();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState<Availability>('idle');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onUsername = (raw: string) => {
    const v = raw.toLowerCase().replace(/\s/g, '');
    setUsername(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v) { setAvail('idle'); return; }
    if (!USERNAME_RE.test(v)) { setAvail('invalid'); return; }
    setAvail('checking');
    timer.current = setTimeout(async () => {
      const { data, error } = await supabase.from('users').select('id').eq('username', v).maybeSingle();
      setAvail(error ? 'idle' : data ? 'taken' : 'available');
    }, 400);
  };

  const pickAvatar = async () => {
    // System picker: no library permission needed.
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!r.canceled && r.assets[0]) setAvatar(r.assets[0].uri);
  };

  const uploadAvatar = async (uid: string): Promise<string | null> => {
    if (!avatar) return null;
    const small = await ImageManipulator.manipulateAsync(avatar, [{ resize: { width: 512 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
    const bytes = await readFileBytes(small.uri);
    const path = `${uid}/avatar.jpg`;
    const { error } = await supabase.storage.from('avatars').upload(path, bytes, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    return `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  };

  const canSubmit = name.trim().length > 0 && avail === 'available' && !busy;

  const submit = async () => {
    if (!userId || !email || !canSubmit) return;
    setBusy(true);
    try {
      let avatarUrl: string | null = null;
      try {
        avatarUrl = await uploadAvatar(userId);
      } catch {
        // Profile creation shouldn't fail because of a photo; they can add it later.
      }
      const { error } = await supabase.from('users').insert({
        id: userId, email, username, display_name: name.trim(), avatar_url: avatarUrl,
      });
      if (error) {
        if (error.code === '23505') { setAvail('taken'); return; }
        Alert.alert("Couldn't create your profile", toUserMessage(error));
        return;
      }
      markProfileCreated();
      router.replace('/onboarding/welcome');
    } finally {
      setBusy(false);
    }
  };

  const hint = {
    idle: '3–20 characters: letters, numbers, _ or .',
    checking: 'Checking…',
    available: `@${username} is yours.`,
    taken: 'That username is taken.',
    invalid: '3–20 characters: lowercase letters, numbers, _ or .',
  }[avail];

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + SPACE.xxl, paddingBottom: insets.bottom + SPACE.xl }]} keyboardShouldPersistTaps="handled">
        <Text variant="title" accessibilityRole="header">Make it <Text variant="title" italic tone="thread">yours</Text>.</Text>
        <Text variant="callout" tone="secondary">This is how friends find you. Your email stays private.</Text>

        <PressableScale onPress={pickAvatar} style={s.avatarWrap} accessibilityLabel={avatar ? 'Change profile photo' : 'Add a profile photo (optional)'}>
          {avatar ? <Image source={{ uri: avatar }} style={s.avatar} contentFit="cover" /> : (
            <View style={[s.avatar, s.avatarEmpty]}><Icon name="camera" fallback="◎" size={22} color={colors.inkSecondary} /></View>
          )}
          <Text variant="label" tone="thread">{avatar ? 'Change photo' : 'Add photo'}</Text>
        </PressableScale>

        <Text variant="label" tone="secondary">Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Ada Lovelace" placeholderTextColor={colors.inkTertiary}
          textContentType="name" autoComplete="name" style={s.input} accessibilityLabel="Display name" maxLength={40} testID="setup-name" />

        <Text variant="label" tone="secondary" style={{ marginTop: SPACE.md }}>Username</Text>
        <View style={[s.input, s.row, (avail === 'taken' || avail === 'invalid') && { borderColor: colors.danger }]}>
          <Text variant="body" tone="tertiary">@</Text>
          <TextInput value={username} onChangeText={onUsername} placeholder="ada" placeholderTextColor={colors.inkTertiary}
            autoCapitalize="none" autoCorrect={false} textContentType="username" style={s.inlineInput}
            accessibilityLabel="Username" maxLength={20} testID="setup-username" />
          {avail === 'available' ? <Icon name="checkmark.circle.fill" fallback="✓" size={18} color={colors.success} /> : null}
        </View>
        <Text variant="caption" tone={avail === 'taken' || avail === 'invalid' ? 'danger' : 'secondary'} accessibilityLiveRegion="polite">{hint}</Text>

        <Button label="Continue" onPress={submit} disabled={!canSubmit} busy={busy} style={{ marginTop: SPACE.xl }} testID="setup-continue" />
        <Button kind="quiet" label="Use a different email" onPress={() => supabase.auth.signOut()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { paddingHorizontal: GUTTER + 4, gap: SPACE.sm },
    avatarWrap: { alignSelf: 'flex-start', alignItems: 'center', gap: SPACE.xs, marginVertical: SPACE.lg },
    avatar: { width: 88, height: 88, borderRadius: 44 },
    avatarEmpty: { backgroundColor: c.surfaceSunk, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.hairline, borderStyle: 'dashed' },
    input: { minHeight: 52, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.surface, paddingHorizontal: SPACE.lg, fontSize: 17, color: c.ink },
    row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    inlineInput: { flex: 1, fontSize: 17, color: c.ink, minHeight: 50 },
  }),
);
