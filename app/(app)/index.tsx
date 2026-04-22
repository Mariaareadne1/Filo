import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { usePins, MapMode } from '../../hooks/usePins';
import { MapPin, CATEGORY_COLORS } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { useRouter, useFocusEffect } from 'expo-router';
import { COLORS } from '../../constants/theme';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const MORNINGSIDE = [-73.9626, 40.8075];

const MODES: { key: MapMode; label: string }[] = [
  { key: 'my',      label: 'MY MAP'   },
  { key: 'friends', label: 'FRIENDS'  },
  { key: 'campus',  label: 'COLUMBIA' },
];

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️', bar: '🍸', beauty: '✂️', experience: '🎯', retail: '🛍️',
};

function PhotoPin({ pin, color, selected }: { pin: MapPin; color: string; selected: boolean }) {
  const size = selected ? 58 : 48;
  const borderWidth = selected ? 3 : 2.5;
  const shadow = {
    shadowColor: color,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: selected ? 0.7 : 0.45,
    shadowRadius: selected ? 6 : 4,
    elevation: selected ? 8 : 5,
  };

  if (pin.photo_url) {
    return (
      <View style={[{
        width: size, height: size, borderRadius: size / 2,
        borderWidth, borderColor: color, overflow: 'hidden',
      }, shadow]}>
        <Image source={{ uri: pin.photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  }

  return (
    <View style={[{
      width: size, height: size, borderRadius: size / 2,
      borderWidth, borderColor: color,
      backgroundColor: color + '2A',
      alignItems: 'center', justifyContent: 'center',
    }, shadow]}>
      <Text style={{ fontSize: selected ? 22 : 18 }}>{CATEGORY_EMOJI[pin.category] ?? '📍'}</Text>
    </View>
  );
}

const EMPTY_MESSAGES: Record<MapMode, string> = {
  my: 'Tap + to pin your first place.',
  friends: 'Follow people to see their pins.\nStart with the Columbia directory.',
  campus: 'Be the first to pin something near campus.',
};

export default function MapScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>('my');
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { pins, loading, error, refetch } = usePins(userId, mode);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useFocusEffect(useCallback(() => {
    if (userId) refetch();
  }, [userId, mode]));

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
    })();
  }, []);

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={MapboxGL.StyleURL.Dark}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled
      >
        <MapboxGL.Camera
          defaultSettings={{ centerCoordinate: MORNINGSIDE, zoomLevel: 14 }}
        />
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

      {/* Top toggle */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.toggleContainer}>
          {MODES.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.toggleBtn, mode === key && styles.toggleBtnActive]}
              onPress={() => setMode(key)}
            >
              <Text style={[styles.toggleText, mode === key && styles.toggleTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={COLORS.primary} size="small" />
        </View>
      )}
      {error && !loading && (
        <View style={styles.errorToast} pointerEvents="none">
          <Text style={styles.errorToastText}>{error}</Text>
        </View>
      )}
      {!loading && !error && pins.length === 0 && (
        <View style={styles.emptyState} pointerEvents="none">
          <Text style={styles.emptyText}>{EMPTY_MESSAGES[mode]}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => router.push('/pin/search')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', paddingTop: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245,240,235,0.96)',
    borderRadius: 22,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleText: {
    fontSize: 12, fontWeight: '700',
    color: 'rgba(26,26,26,0.45)',
    letterSpacing: 0.6,
  },
  toggleTextActive: { color: COLORS.textPrimary },
  loadingOverlay: {
    position: 'absolute', top: '50%', alignSelf: 'center',
    backgroundColor: 'rgba(245,240,235,0.96)',
    borderRadius: 20, padding: 12,
    borderWidth: 1, borderColor: 'rgba(26,26,26,0.06)',
  },
  errorToast: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: 'rgba(245,240,235,0.97)',
    borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(230,57,70,0.4)',
  },
  errorToastText: { color: COLORS.textPrimary, fontSize: 13 },
  emptyState: {
    position: 'absolute', bottom: 120, left: 32, right: 32,
    backgroundColor: 'rgba(245,240,235,0.96)',
    borderRadius: 16, padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(26,26,26,0.06)',
  },
  emptyText: {
    fontSize: 14, color: 'rgba(26,26,26,0.65)',
    textAlign: 'center', lineHeight: 20,
  },
  fab: {
    position: 'absolute', alignSelf: 'center',
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 10,
  },
  fabText: { fontSize: 28, color: COLORS.textPrimary, fontWeight: '300', lineHeight: 32 },
});
