import type { Category } from '../../lib/categories';
import type { PinRow } from '../../lib/api/pins';

/**
 * Pure map model: pins → one feature per PLACE (not per pin), so three
 * friends who pinned the same cafe produce one marker that says "3 friends"
 * instead of three stacked markers. Kept free of React/Mapbox for tests.
 *
 * Marker family (deliberately small):
 *   mine_visited — you've been          → filled thread disc
 *   mine_saved   — you want to go        → white disc, thread ring
 *   friend       — only friends have it  → ink disc (size steps with count)
 *   + selected (halo) and clusters, which are styled in the layer.
 */

export type MarkerKind = 'mine_visited' | 'mine_saved' | 'friend';
export type MapScope = 'all' | 'mine' | 'friends';

export interface PlaceMarker {
  placeId: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  kind: MarkerKind;
  friendCount: number;
  /** Up to three friend usernames, most recent first. */
  friendNames: string[];
  myPinId: string | null;
  myStatus: 'visited' | 'want_to_go' | null;
}

export interface MarkerFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    placeId: string;
    name: string;
    category: Category;
    kind: MarkerKind;
    friendCount: number;
  };
}

export interface MarkerCollection {
  type: 'FeatureCollection';
  features: MarkerFeature[];
}

export function buildPlaceMarkers(pins: readonly PinRow[], myUserId: string): PlaceMarker[] {
  const byPlace = new Map<string, PinRow[]>();
  for (const p of pins) {
    if (!Number.isFinite(p.place.lat) || !Number.isFinite(p.place.lng)) continue;
    const list = byPlace.get(p.place_id);
    if (list) list.push(p);
    else byPlace.set(p.place_id, [p]);
  }
  const out: PlaceMarker[] = [];
  for (const [placeId, list] of byPlace) {
    const mine = list.find((p) => p.user_id === myUserId) ?? null;
    const friends = list
      .filter((p) => p.user_id !== myUserId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const place = list[0].place;
    const kind: MarkerKind = mine ? (mine.status === 'visited' ? 'mine_visited' : 'mine_saved') : 'friend';
    out.push({
      placeId,
      name: place.name,
      category: place.category,
      lat: place.lat,
      lng: place.lng,
      kind,
      friendCount: new Set(friends.map((f) => f.user_id)).size,
      friendNames: Array.from(new Set(friends.map((f) => f.user.username))).slice(0, 3),
      myPinId: mine?.id ?? null,
      myStatus: mine?.status ?? null,
    });
  }
  return out;
}

export function filterMarkers(
  markers: readonly PlaceMarker[],
  scope: MapScope,
  categories: ReadonlySet<Category>,
): PlaceMarker[] {
  return markers.filter((m) => {
    if (categories.size > 0 && !categories.has(m.category)) return false;
    if (scope === 'mine') return m.myStatus !== null;
    if (scope === 'friends') return m.friendCount > 0;
    return true;
  });
}

export function toFeatureCollection(markers: readonly PlaceMarker[]): MarkerCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature',
      id: m.placeId,
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      properties: {
        placeId: m.placeId,
        name: m.name,
        category: m.category,
        kind: m.kind,
        friendCount: m.friendCount,
      },
    })),
  };
}

/** Human summary of social context, only from real data ("Saved by ada and 2 others"). */
export function socialLine(m: Pick<PlaceMarker, 'friendCount' | 'friendNames'>): string | null {
  if (m.friendCount === 0) return null;
  const [first, second] = m.friendNames;
  if (m.friendCount === 1) return `Pinned by @${first}`;
  if (m.friendCount === 2 && second) return `Pinned by @${first} and @${second}`;
  return `Pinned by @${first} and ${m.friendCount - 1} friends`;
}

/** Bounding box [minLng, minLat, maxLng, maxLat] for camera fitting, or null. */
export function boundsOf(markers: readonly { lat: number; lng: number }[]): [number, number, number, number] | null {
  if (markers.length === 0) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const m of markers) {
    minLat = Math.min(minLat, m.lat); maxLat = Math.max(maxLat, m.lat);
    minLng = Math.min(minLng, m.lng); maxLng = Math.max(maxLng, m.lng);
  }
  return [minLng, minLat, maxLng, maxLat];
}
