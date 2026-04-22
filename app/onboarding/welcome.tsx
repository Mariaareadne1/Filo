import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

// Dot cluster decoration — static positions baked in for performance
const DOTS = [
  { top: 60,  left: 30,  size: 5,  opacity: 0.18 },
  { top: 110, left: 80,  size: 3,  opacity: 0.12 },
  { top: 80,  left: 160, size: 7,  opacity: 0.15 },
  { top: 150, left: 40,  size: 4,  opacity: 0.10 },
  { top: 200, left: 120, size: 6,  opacity: 0.14 },
  { top: 60,  right: 40, size: 6,  opacity: 0.18 },
  { top: 130, right: 90, size: 4,  opacity: 0.12 },
  { top: 180, right: 30, size: 5,  opacity: 0.15 },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Entrance animations
  const logoAnim   = useRef(new Animated.Value(0)).current;
  const textAnim   = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // On mount: if the user already has pins they're re-entering after the
    // first-pin step — skip straight to find-friends.
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
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Background decorative dots */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {DOTS.map((d, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                top: d.top,
                left: (d as any).left,
                right: (d as any).right,
                width: d.size,
                height: d.size,
                borderRadius: d.size / 2,
                opacity: d.opacity,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.container}>
        {/* Logo */}
        <Animated.View
          style={[
            styles.logoWrap,
            {
              opacity: logoAnim,
              transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            },
          ]}
        >
          <Text style={styles.logoPin}>📍</Text>
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
            activeOpacity={0.88}
          >
            <Text style={styles.ctaBtnText}>Show me the map</Text>
          </TouchableOpacity>

          <View style={styles.stepRow}>
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <View style={styles.stepDot} />
            <View style={styles.stepDot} />
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#E63946' },
  loadingContainer: {
    flex: 1, backgroundColor: '#E63946',
    alignItems: 'center', justifyContent: 'center',
  },
  dot: { position: 'absolute', backgroundColor: '#fff' },

  container: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 48,
  },

  logoWrap: { alignItems: 'center', gap: 8 },
  logoPin: { fontSize: 52 },
  logoWord: {
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -2,
  },

  copyBlock: { gap: 16 },
  headline: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 24,
  },

  ctaWrap: { gap: 24, alignItems: 'center' },
  ctaBtn: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#E63946',
    letterSpacing: 0.2,
  },

  stepRow: { flexDirection: 'row', gap: 6 },
  stepDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  stepDotActive: { backgroundColor: '#fff', width: 18 },
});
