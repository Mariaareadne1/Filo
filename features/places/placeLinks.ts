import { Linking, Platform, Share } from 'react-native';

interface Geo {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** Opens turn-by-turn directions in the platform maps app. */
export async function openDirections(p: Geo): Promise<void> {
  const q = encodeURIComponent(p.name);
  const url =
    Platform.OS === 'ios'
      ? `maps://?daddr=${p.lat},${p.lng}&q=${q}`
      : `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}(${q})`;
  const web = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return;
    }
  } catch {
    // fall through to web
  }
  await Linking.openURL(web);
}

/** Native share sheet with a universal maps link anyone can open. */
export async function sharePlace(p: Geo, note?: string | null): Promise<void> {
  const link = `https://maps.apple.com/?q=${encodeURIComponent(p.name)}&ll=${p.lat},${p.lng}`;
  const lines = [p.name, p.address, note ? `“${note}”` : null, link].filter(Boolean);
  await Share.share({ message: lines.join('\n'), url: Platform.OS === 'ios' ? link : undefined });
}
