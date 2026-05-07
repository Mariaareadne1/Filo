import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
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

export default function WelcomeScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  const logoAnim   = useRef(new Animated.Value(0)).current;
  const textAnim   = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { count } = await supabase
          .from('pins')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if ((count ?? 0) > 0) {
          router.replace('/onboarding/find-friends');
          return;
        }
      }
      setChecking(false);
      startAnimations();
    })();
  }, []);

  function startAnimations() {
    Animated.stagger(140, [
      Animated.spring(logoAnim,   { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }),
      Animated.spring(textAnim,   { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 160 }),
      Animated.spring(buttonAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 160 }),
    ]).start();
  }

  if (checking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={ACCENT.red} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.container}>
          {/* Brand */}
          <Animated.View
            style={[
              styles.brandWrap,
              {
                opacity: logoAnim,
                transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
              },
            ]}
          >
            <Text style={styles.metaLabel}>COLUMBIA · MORNINGSIDE</Text>
            <Text style={styles.wordmark}>
              filo<Text style={styles.wordmarkDot}>.</Text>
            </Text>
          </Animated.View>

          {/* Copy */}
          <Animated.View
            style={[
              styles.copyBlock,
              {
                opacity: textAnim,
                transform: [{ translateY: textAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              },
            ]}
          >
            <Text style={styles.headline}>
              the map your{'\n'}
              <Text style={styles.headlineItalic}>friends</Text> would draw.
            </Text>
            <Text style={styles.subtext}>
              you're now in the columbia circle.{'\n'}
              see what your campus has pinned.
            </Text>

            <View style={styles.stepRow}>
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <View style={styles.stepDot} />
              <View style={styles.stepDot} />
            </View>
          </Animated.View>

          {/* CTA */}
          <Animated.View
            style={[
              styles.ctaWrap,
              {
                opacity: buttonAnim,
                transform: [{ translateY: buttonAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => router.push('/onboarding/first-pin')}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaBtnText}>show me the map  →</Text>
            </TouchableOpacity>
            <Text style={styles.ctaCaption}>step 1 of 3</Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  loadingContainer: {
    flex: 1,
    backgroundColor: PALETTE.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    paddingHorizontal: SCREEN_PAD + 4,
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 44,
  },

  brandWrap: { alignItems: 'flex-start', gap: 8 },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
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

  copyBlock: { gap: 18 },
  headline: {
    fontFamily: FONTS.display,
    fontSize: 36,
    fontWeight: '400',
    color: PALETTE.ink,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  headlineItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  subtext: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: PALETTE.inkSoft,
    lineHeight: 22,
  },
  stepRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  stepDot: {
    width: 6,
    height: 6,
    backgroundColor: PALETTE.inkLine,
  },
  stepDotActive: {
    backgroundColor: ACCENT.red,
    width: 22,
  },

  ctaWrap: { gap: 10 },
  ctaBtn: {
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingVertical: 16,
    alignItems: 'center',
    ...STICKER_SHADOW_LG,
  },
  ctaBtnText: {
    fontFamily: FONTS.body,
    fontSize: 15,
    fontWeight: '700',
    color: PALETTE.surface,
    letterSpacing: 0.4,
  },
  ctaCaption: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: PALETTE.inkMute,
    textAlign: 'center',
  },
});
