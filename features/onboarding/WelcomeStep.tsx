import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { toUserMessage } from '../../lib/errors';
import { Button } from '../../design/controls';
import { Icon, Text } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';

const PRINCIPLES = [
  { symbol: 'mappin.and.ellipse', fallback: '◉', text: 'Save places you love, and places you want to try.' },
  { symbol: 'list.number', fallback: '#', text: 'Rank them against each other. No stars, no scores.' },
  { symbol: 'person.2', fallback: '◎', text: "See the map your friends would draw — never ads or sponsored spots." },
];

/** Step 1/3: what Filo is, and an explicit privacy choice before any pin exists. */
export function WelcomeStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useSession();
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const next = async () => {
    if (!userId) return;
    setBusy(true);
    const { error } = await supabase.from('users').update({ is_private: isPrivate }).eq('id', userId);
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't save your privacy setting", toUserMessage(error));
      return;
    }
    router.push('/onboarding/first-pin');
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + SPACE.xxxl, paddingBottom: insets.bottom + SPACE.lg }]}>
      <Text variant="caption" tone="secondary" style={s.kicker}>STEP 1 OF 3</Text>
      <Text variant="hero" accessibilityRole="header">
        The map your <Text variant="hero" italic tone="thread">friends</Text> would draw.
      </Text>

      <View style={s.list}>
        {PRINCIPLES.map((p) => (
          <View key={p.text} style={s.item}>
            <View style={s.icon}><Icon name={p.symbol} fallback={p.fallback} size={18} color={colors.thread} /></View>
            <Text variant="body" style={{ flex: 1 }}>{p.text}</Text>
          </View>
        ))}
      </View>

      <View style={s.privacy}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">Private account</Text>
          <Text variant="callout" tone="secondary">
            {isPrivate
              ? 'Only people you approve see your places and rankings.'
              : 'Anyone at Columbia & Barnard can see your places. You can change this later.'}
          </Text>
        </View>
        <Switch value={isPrivate} onValueChange={setPrivate} trackColor={{ true: colors.thread }}
          accessibilityLabel="Private account" testID="onboarding-private" />
      </View>

      <View style={{ flex: 1 }} />
      <Button label="Start my map" onPress={next} busy={busy} testID="onboarding-next" />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, paddingHorizontal: GUTTER + 4, gap: SPACE.lg },
    kicker: { letterSpacing: 1 },
    list: { gap: SPACE.lg, marginTop: SPACE.lg },
    item: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
    icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.threadSoft, alignItems: 'center', justifyContent: 'center' },
    privacy: {
      marginTop: SPACE.lg, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg,
      backgroundColor: c.surface, borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline,
    },
  }),
);
