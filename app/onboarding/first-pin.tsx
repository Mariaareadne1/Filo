import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { usePins } from '../../hooks/usePins';
import { CATEGORY_COLORS, MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const MORNINGSIDE = [-73.9626, 40.8075];

function PinDot({ color, selected }: { color: string; selected: boolean }) {
  return (
    <View style={[styles.dot, {
      borderColor: color,
      width: selected ? 28 : 22,
      height: selected ? 28 : 22,
      borderRadius: selected ? 14 : 11,
    }]}>
      <View style={[styles.dotInner, {
        backgroundColor: color,
        width: selected ? 12 : 9,
        height: selected ? 12 : 9,
        borderRadius: selected ? 6 : 5,
      }]} />
    </View>
  );
}

export default function FirstPinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const { pins, loading } = usePins(userId, 'campus');

  // Tooltip bounce animation
  const bounceAnim = useRef(new Animated.Value(0)).current;
  // Tooltip fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setLocationGranted(status === 'granted');
    });

    // Fade in tooltip after a short delay
    setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 600);

    // Bounce loop
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 450, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0,  duration: 450, useNativeDriver: true }),
      ])
    );
    loop.start();

    return () => loop.stop();
  }, []);

  // When focus is restored (e.g. after pin creation dismisses its modal stack),
  // check if the user now has a pin. If so, advance.
  useFocusEffect(
    useCallback(() => {
      if (!userId || dismissed) return;
      supabase
        .from('pins')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .then(({ count }) => {
          if ((count ?? 0) > 0) {
            advance();
          }
        });
    }, [userId, dismissed])
  );

  function advance() {
    setDismissed(true);
    router.replace('/onboarding/find-friends');
  }

  const FAB_BOTTOM = insets.bottom + 24;
  const FAB_SIZE   = 58;
  const TOOLTIP_BOTTOM = FAB_BOTTOM + FAB_SIZE + 14;

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={MapboxGL.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapboxGL.Camera
          defaultSettings={{ centerCoordinate: MORNINGSIDE, zoomLevel: 14 }}
        />
        {locationGranted && <MapboxGL.UserLocation visible animated />}
        {pins.map((pin) => (
          <MapboxGL.MarkerView key={pin.pin_id} coordinate={[pin.lng, pin.lat]}>
            <TouchableOpacity onPress={() => setSelectedPin(pin)} activeOpacity={0.85}>
              <PinDot
                color={CATEGORY_COLORS[pin.category] ?? '#888'}
                selected={selectedPin?.pin_id === pin.pin_id}
              />
            </TouchableOpacity>
          </MapboxGL.MarkerView>
        ))}
      </MapboxGL.MapView>

      {/* Skip button — top left */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.skipBtn} onPress={advance}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>

        {/* Step indicator — top right */}
        <View style={styles.stepRow}>
          <View style={styles.stepDot} />
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={styles.stepDot} />
        </View>
      </SafeAreaView>

      {/* Animated tooltip above the FAB */}
      {!dismissed && (
        <Animated.View
          style={[
            styles.tooltip,
            {
              bottom: TOOLTIP_BOTTOM,
              opacity: fadeAnim,
              transform: [{ translateY: bounceAnim }],
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.tooltipText}>
            Pin your first place —{'\n'}somewhere you love near campus.
          </Text>
          {/* Triangle pointing down at the FAB */}
          <View style={styles.tooltipArrow} />
        </Animated.View>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: FAB_BOTTOM }]}
        onPress={() => router.push('/pin/search')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Loading spinner while campus pins load */}
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#E63946" size="small" />
        </View>
      )}

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  skipBtn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  skipText: { fontSize: 13, fontWeight: '600', color: '#555' },

  stepRow: {
    flexDirection: 'row', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ddd' },
  stepDotActive: { backgroundColor: '#E63946', width: 18 },

  tooltip: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#111',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: 260,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#111',
  },

  fab: {
    position: 'absolute',
    alignSelf: 'center',
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E63946',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E63946',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: { fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 32 },

  loadingOverlay: {
    position: 'absolute', top: '50%', alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20, padding: 12,
  },

  dot: {
    borderWidth: 2.5, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
  },
  dotInner: {},
});
