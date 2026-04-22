import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useEffect, useState, useRef, useCallback } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { usePins, MapMode } from '../../hooks/usePins';
import { MapPin, CATEGORY_COLORS } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { useRouter, useFocusEffect } from 'expo-router';


MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const MORNINGSIDE = [-73.9626, 40.8075]; // [lng, lat] for Mapbox

const MODES: { key: MapMode; label: string; trackAs: string }[] = [
  { key: 'my',     label: 'MY MAP',   trackAs: 'my_map'    },
  { key: 'friends', label: 'FRIENDS', trackAs: 'friends_map' },
  { key: 'campus', label: 'COLUMBIA', trackAs: 'campus'    },
];

export default function MapScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>('my');
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { pins, loading, error, refetch } = usePins(userId, mode);

  // Get auth user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // Refetch pins whenever the map comes back into focus (after pin creation)
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, mode])
  );

  // Request location permission
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
    })();
  }, []);

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={MapboxGL.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled
      >
        <MapboxGL.Camera
          defaultSettings={{
            centerCoordinate: MORNINGSIDE,
            zoomLevel: 14,
          }}
        />

        {/* User location */}
        {locationGranted && (
          <MapboxGL.UserLocation visible animated />
        )}

        {/* Pin markers */}
        {pins.map((pin) => (
          <MapboxGL.MarkerView
            key={pin.pin_id}
            coordinate={[pin.lng, pin.lat]}
          >
            <TouchableOpacity
              onPress={() => setSelectedPin(pin)}
              activeOpacity={0.85}
            >
              <PinDot
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
          {MODES.map(({ key, label, trackAs }) => (
            <TouchableOpacity
              key={key}
              style={[styles.toggleBtn, mode === key && styles.toggleBtnActive]}
              onPress={() => {
                setMode(key);
              }}
            >
              <Text style={[styles.toggleText, mode === key && styles.toggleTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#E63946" size="small" />
        </View>
      )}

      {/* Error toast */}
      {error && !loading && (
        <View style={styles.errorToast} pointerEvents="none">
          <Text style={styles.errorToastText}>{error}</Text>
        </View>
      )}

      {/* Empty state */}
      {!loading && !error && pins.length === 0 && (
        <View style={styles.emptyState} pointerEvents="none">
          <Text style={styles.emptyText}>{EMPTY_MESSAGES[mode]}</Text>
        </View>
      )}

      {/* + FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => router.push('/pin/search')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Pin detail sheet */}
      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

function PinDot({ color, selected }: { color: string; selected: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        { borderColor: color, width: selected ? 28 : 22, height: selected ? 28 : 22, borderRadius: selected ? 14 : 11 },
      ]}
    >
      <View style={[styles.dotInner, { backgroundColor: color, width: selected ? 12 : 9, height: selected ? 12 : 9, borderRadius: selected ? 6 : 5 }]} />
    </View>
  );
}

const EMPTY_MESSAGES: Record<MapMode, string> = {
  my: 'Tap + to pin your first place.',
  friends: 'Follow people to see their pins.\nStart with the Columbia directory.',
  campus: 'Be the first to pin something near campus.',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 17,
  },
  toggleBtnActive: { backgroundColor: '#E63946' },
  toggleText: { fontSize: 12, fontWeight: '700', color: '#666', letterSpacing: 0.5 },
  toggleTextActive: { color: '#fff' },
  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20,
    padding: 12,
  },
  errorToast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  errorToastText: { color: '#fff', fontSize: 13 },
  emptyState: {
    position: 'absolute',
    bottom: 120,
    left: 32,
    right: 32,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  emptyText: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 },
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
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: { fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 32 },
  dot: {
    borderWidth: 2.5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  dotInner: {},
});
