import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { usePins, MapMode } from '../../hooks/usePins';
import { MapPin, CATEGORY_COLORS } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { useFocusEffect } from 'expo-router';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
} from '../../constants/theme';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const MORNINGSIDE = [-73.9626, 40.8075];

const MODES: { key: MapMode; label: string }[] = [
  { key: 'my',      label: 'mine'     },
  { key: 'friends', label: 'friends'  },
  { key: 'campus',  label: 'columbia' },
];

const CATEGORY_GLYPH: Record<string, string> = {
  food: '◆',
  bar: '○',
  beauty: '◇',
  experience: '✦',
  retail: '◉',
};

function PhotoPin({ pin, color, selected }: { pin: MapPin; color: string; selected: boolean }) {
  const size = selected ? 56 : 46;
  const borderWidth = selected ? 2 : 1.5;
  const shadow = {
    shadowColor: PALETTE.ink,
    shadowOffset: { width: 1.5, height: 1.5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: selected ? 6 : 3,
  };

  if (pin.photo_url) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderWidth,
            borderColor: PALETTE.ink,
            overflow: 'hidden',
            backgroundColor: PALETTE.surface,
          },
          shadow,
        ]}
      >
        <Image source={{ uri: pin.photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        {selected && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 3,
              backgroundColor: ACCENT.red,
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderWidth,
          borderColor: PALETTE.ink,
          backgroundColor: PALETTE.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadow,
      ]}
    >
      <Text style={{ fontSize: selected ? 22 : 18, color: selected ? ACCENT.red : color }}>
        {CATEGORY_GLYPH[pin.category] ?? '◉'}
      </Text>
    </View>
  );
}

const EMPTY_MESSAGES: Record<MapMode, { title: string; italic: string; sub: string }> = {
  my:      { title: 'no pins',  italic: 'yet.',     sub: 'tap + to pin your first place.' },
  friends: { title: 'follow',   italic: 'people.',  sub: "see your circle's pins on the map." },
  campus:  { title: 'be',       italic: 'first.',   sub: 'pin something near campus.' },
};

export default function MapScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>('my');
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);

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

  const empty = EMPTY_MESSAGES[mode];

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={MapboxGL.StyleURL.Street}
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
                color={CATEGORY_COLORS[pin.category] ?? PALETTE.ink}
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
              activeOpacity={0.85}
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
          <ActivityIndicator color={ACCENT.red} size="small" />
        </View>
      )}
      {error && !loading && (
        <View style={styles.errorToast} pointerEvents="none">
          <Text style={styles.errorToastText}>{error}</Text>
        </View>
      )}
      {!loading && !error && pins.length === 0 && (
        <View style={styles.emptyState} pointerEvents="none">
          <Text style={styles.emptyKicker}>{mode.toUpperCase()} MAP</Text>
          <Text style={styles.emptyTitle}>
            {empty.title} <Text style={styles.emptyTitleItalic}>{empty.italic}</Text>
          </Text>
          <Text style={styles.emptySub}>{empty.sub}</Text>
        </View>
      )}

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.bg },

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
    backgroundColor: PALETTE.surface,
    borderRadius: RADII.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: RADII.pill,
  },
  toggleBtnActive: {
    backgroundColor: PALETTE.ink,
  },
  toggleText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.ink,
    letterSpacing: 0.2,
  },
  toggleTextActive: {
    color: PALETTE.bg,
  },

  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    backgroundColor: PALETTE.surface,
    padding: 12,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW,
  },

  errorToast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: ACCENT.red,
    ...STICKER_SHADOW,
  },
  errorToastText: {
    fontFamily: FONTS.body,
    color: ACCENT.red,
    fontSize: 12,
    fontWeight: '600',
  },

  emptyState: {
    position: 'absolute',
    bottom: 130,
    left: 32,
    right: 32,
    backgroundColor: PALETTE.surface,
    padding: 18,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
    alignItems: 'flex-start',
    gap: 4,
  },
  emptyKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  emptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  emptyTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  emptySub: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    lineHeight: 17,
    marginTop: 2,
  },
});
