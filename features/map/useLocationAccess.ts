import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

export type LocationAccess = 'unknown' | 'granted' | 'denied' | 'undetermined';

/**
 * Contextual location permission: never prompts on launch. `request()` asks
 * only when the person taps "locate me"; if they previously denied, it
 * explains and offers Settings instead of failing silently. Location is used
 * on-device to move the camera — it is never uploaded.
 */
export function useLocationAccess() {
  const [access, setAccess] = useState<LocationAccess>('unknown');

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setAccess(p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied'))
      .catch(() => setAccess('undetermined'));
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) { setAccess('granted'); return true; }
    if (!current.canAskAgain) {
      setAccess('denied');
      Alert.alert(
        'Location is off for Filo',
        'Turn on location in Settings to center the map on where you are. Filo never shares your location.',
        [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
      );
      return false;
    }
    const res = await Location.requestForegroundPermissionsAsync();
    setAccess(res.granted ? 'granted' : 'denied');
    return res.granted;
  }, []);

  const current = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
      const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }, []);

  return { access, request, current };
}
