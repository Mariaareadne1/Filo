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
import { COLORS, GLASS } from '../../constants/theme';

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
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      {/* Red thread decorations */}
      <View style={styles.thread1} pointerEvents="none" />
      <View style={styles.thread2} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.container}>
          {/* Logo */}
          <Animated.View
            style={[
              styles.logoWrap,
              {
                opacity: logoAnim,
                transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
              },
            ]}
          >
            <View style={styles.logoRing}>
              <Text style={styles.logoPin}>◉</Text>
            </View>
            <Text style={styles.logoWord}>Filo</Text>
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
            <Text style={styles.headline}>The map your{'\n'}friends would draw.</Text>
            <Text style={styles.subtext}>
              You're now in the Columbia circle.{'\n'}See what your campus has pinned.
            </Text>

            {/* Step indicators */}
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
              style={[styles.ctaBtn, GLASS]}
              onPress={() => router.push('/onboarding/first-pin')}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaBtnText}>Show me the map  →</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: {
    flex: 1, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  thread1: {
    position: 'absolute', width: 180, height: 60, borderRadius: 60,
    borderTopWidth: 1.5, borderColor: 'rgba(230,57,70,0.4)',
    borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
    bottom: 180, right: 20,
  },
  thread2: {
    position: 'absolute', width: 140, height: 50, borderRadius: 50,
    borderBottomWidth: 1.5, borderColor: 'rgba(67,97,238,0.3)',
    borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
    top: 200, left: 20,
  },
  container: {
    flex: 1, paddingHorizontal: 32,
    justifyContent: 'space-between',
    paddingTop: 60, paddingBottom: 48,
  },

  logoWrap: { alignItems: 'center', gap: 12 },
  logoRing: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: COLORS.primary + '55',
    backgroundColor: COLORS.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  logoPin: { fontSize: 32, color: COLORS.primary },
  logoWord: {
    fontSize: 58, fontWeight: '900', color: COLORS.textPrimary, letterSpacing: -2,
  },

  copyBlock: { gap: 18 },
  headline: {
    fontSize: 38, fontWeight: '800',
    color: COLORS.textPrimary, lineHeight: 46, letterSpacing: -0.8,
  },
  subtext: {
    fontSize: 17, color: COLORS.textSecondary, lineHeight: 25,
  },
  stepRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  stepDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(26,26,26,0.18)',
  },
  stepDotActive: { backgroundColor: COLORS.primary, width: 20, borderRadius: 3 },

  ctaWrap: {},
  ctaBtn: {
    paddingVertical: 18, alignItems: 'center',
    borderRadius: 50,
  },
  ctaBtnText: {
    fontSize: 17, fontWeight: '800',
    color: COLORS.textPrimary, letterSpacing: 0.2,
  },
});
