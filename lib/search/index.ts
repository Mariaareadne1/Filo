import * as Crypto from 'expo-crypto';
import { autocompletePlaces, fetchPlaceDetails, isPlacesConfigured } from './google';
import { isMapboxSearchConfigured, mapboxRetrieve, mapboxSuggest } from './mapbox';
import type { PlaceCandidate, PlaceSuggestion } from './types';

export type { PlaceCandidate, PlaceSuggestion } from './types';
export { placePhotoUrl } from './google';
export { mapboxBrowse as browseNearby } from './mapbox';

/**
 * Provider-agnostic venue search. Mapbox Search Box is primary (it shares
 * the map's token and works today); Google Places is used only when Mapbox
 * isn't configured. Both return real, stable provider ids that save_pin
 * dedupes on.
 */
export function newSearchSession(): string {
  return Crypto.randomUUID();
}

export function isPlaceSearchAvailable(): boolean {
  return isMapboxSearchConfigured() || isPlacesConfigured();
}

export async function suggestPlaces(
  query: string,
  session: string,
  signal?: AbortSignal,
  near?: { lat: number; lng: number },
): Promise<PlaceSuggestion[]> {
  if (isMapboxSearchConfigured()) return mapboxSuggest(query, session, signal, near);
  const preds = await autocompletePlaces(query, session, signal);
  return preds.map((p) => ({
    provider: 'google' as const,
    providerId: p.googlePlaceId,
    name: p.primary,
    address: p.secondary,
    category: null,
    tags: [],
    neighborhood: null,
    distanceM: null,
  }));
}

export async function resolvePlace(s: PlaceSuggestion, session: string): Promise<PlaceCandidate | null> {
  if (s.provider === 'mapbox') return mapboxRetrieve(s.providerId, session);
  const d = await fetchPlaceDetails(s.providerId, session);
  if (!d) return null;
  return {
    provider: 'google',
    providerId: d.place_id,
    name: d.name,
    address: d.address,
    category: d.category,
    lat: d.lat,
    lng: d.lng,
    tags: [],
    neighborhood: null,
    photoUrl: d.photo_url,
  };
}
