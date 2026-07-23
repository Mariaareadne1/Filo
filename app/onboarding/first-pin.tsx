import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
 Image } from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { usePins } from '../../hooks/usePins';
import { CATEGORY_COLORS, MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { COLORS } from '../../constants/theme';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const MORNINGSIDE = [-73.9626, 40.8075];

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️', bar: '🍸', beauty: '✂️', experience: '🎯', retail: '🛍️',
};

function PhotoPin({ pin, color, selected }: { pin: MapPin; color: string; selected: boolean }) {
  const size = selected ? 56 : 46;
  const borderWidth = selected ? 3 : 2.5;

  if (pin.photo_url) {
    return (
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth, borderColor: color, overflow: 'hidden',
        shadowColor: color, shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5, shadowRadius: 4, elevation: 5,
      }}>
        <Image source={{ uri: pin.photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  }

  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      borderWidth, borderColor: color,
      backgroundColor: color + '2A',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: color, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.5, shadowRadius: 4, elevation: 5,
    }}>
      <Text style={{ fontSize: selected ? 20 : 16 }}>{CATEGORY_EMOJI[pin.category] ?? '📍'}</Text>
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

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUserId(data.user?.id ?? null); });
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      setLocationGranted(status === 'granted');
    });

    setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }, 600);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 450, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0,  duration: 450, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!userId || dismissed) return;
      supabase.from('pins').select('id', { count: 'exact', head: true }).eq('user_id', userId)
        .then(({ count }) => { if ((count ?? 0) > 0) advance(); });
    }, [userId, dismissed])
  );

  function advance() {
    setDismissed(true);
    router.replace('/onboarding/find-friends');
  }

  const FAB_BOTTOM    = insets.bottom + 24;
  const FAB_SIZE      = 58;
  const TOOLTIP_BOTTOM = FAB_BOTTOM + FAB_SIZE + 14;

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={MapboxGL.StyleURL.Dark}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <MapboxGL.Camera defaultSettings={{ centerCoordinate: MORNINGSIDE, zoomLevel: 14 }} />
        {locationGranted && <MapboxGL.UserLocation visible animated />}
        {pins.map((pin) => (
          <MapboxGL.MarkerView key={pin.pin_id} coordinate={[pin.lng, pin.lat]}>
            <TouchableOpacity onPress={() => setSelectedPin(pin)} activeOpacity={0.85}>
              <PhotoPin
                pin={pin}
                color={CATEGORY_COLORS[pin.category] ?? '#888'}
                selected={selectedPin?.pin_id === pin.pin_id}
              />
            </TouchableOpacity>
          </MapboxGL.MarkerView>
        ))}
      </MapboxGL.MapView>

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.skipBtn} onPress={advance}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
        <View style={styles.stepRow}>
          <View style={styles.stepDot} />
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={styles.stepDot} />
        </View>
      </SafeAreaView>

      {/* Tooltip */}
      {!dismissed && (
        <Animated.View
          style={[
            styles.tooltip,
            { bottom: TOOLTIP_BOTTOM, opacity: fadeAnim, transform: [{ translateY: bounceAnim }] },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.tooltipText}>
            Pin your first place —{'\n'}somewhere you love near campus.
          </Text>
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

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={COLORS.primary} size="small" />
        </View>
      )}

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingTop: 8,
  },
  skipBtn: {
    backgroundColor: 'rgba(242,237,232,0.97)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  skipText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  stepRow: {
    flexDirection: 'row', gap: 6,
    backgroundColor: 'rgba(242,237,232,0.97)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(26,26,26,0.18)' },
  stepDotActive: { backgroundColor: COLORS.primary, width: 18, borderRadius: 3 },

  tooltip: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: 'rgba(242,237,232,0.97)',
    borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14,
    maxWidth: 270, alignItems: 'center',
    borderWidth: 1, borderColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 10,
  },
  tooltipText: {
    color: COLORS.textPrimary, fontSize: 14, fontWeight: '600',
    textAlign: 'center', lineHeight: 21,
  },
  tooltipArrow: {
    position: 'absolute', bottom: -7,
    width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: 'rgba(242,237,232,0.97)',
  },
  fab: {
    position: 'absolute', alignSelf: 'center',
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 12, elevation: 10,
  },
  fabText: { fontSize: 28, color: COLORS.textPrimary, fontWeight: '300', lineHeight: 32 },
  loadingOverlay: {
    position: 'absolute', top: '50%', alignSelf: 'center',
    backgroundColor: 'rgba(242,237,232,0.97)', borderRadius: 20, padding: 12,
    borderWidth: 1, borderColor: 'rgba(26,26,26,0.06)',
  },
});
