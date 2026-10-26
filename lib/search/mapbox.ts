import { z } from 'zod';
import { categoryFromMapboxIds } from '../categories';
import type { PlaceCandidate, PlaceSuggestion } from './types';

/**
 * Mapbox Search Box API (same public `pk.` token as the map).
 * suggest → (user picks) → retrieve. One session token covers both and is
 * the billing unit. Real POIs with stable `mapbox_id`s, category ids and
 * neighborhood context.
 */
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const BASE = 'https://api.mapbox.com/search/searchbox/v1';
const TIMEOUT_MS = 8000;
/** Bias toward Morningside Heights; results stay NYC-scoped via bbox. */
const PROXIMITY = '-73.9626,40.8075';
const NYC_BBOX = '-74.2591,40.4774,-73.7004,40.9176';

const suggestionSchema = z.object({
  mapbox_id: z.string().min(1),
  name: z.string().min(1),
  feature_type: z.string(),
  full_address: z.string().optional(),
  place_formatted: z.string().optional(),
  poi_category_ids: z.array(z.string()).optional(),
  poi_category: z.array(z.string()).optional(),
  distance: z.number().optional(),
  context: z.object({ neighborhood: z.object({ name: z.string() }).optional() }).passthrough().optional(),
});

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: suggestionSchema.extend({ feature_type: z.string().optional() }),
});

export function isMapboxSearchConfigured(): boolean {
  return TOKEN.startsWith('pk.');
}

async function get(url: URL, signal?: AbortSignal): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const relay = () => ctl.abort();
  signal?.addEventListener('abort', relay);
  try {
    const res = await fetch(url.toString(), { signal: ctl.signal });
    if (res.status === 401 || res.status === 403) throw new Error('Place search is unavailable right now.');
    if (!res.ok) throw new Error(`Place search failed (${res.status}).`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

const FILTERED_TAGS = new Set(['food', 'food and drink', 'shopping', 'services', 'outdoors']);
const cleanTags = (tags?: string[]) => (tags ?? []).filter((t) => !FILTERED_TAGS.has(t)).slice(0, 6);

export async function mapboxSuggest(
  query: string,
  sessionToken: string,
  signal?: AbortSignal,
  near?: { lat: number; lng: number },
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL(`${BASE}/suggest`);
  url.searchParams.set('q', q);
  url.searchParams.set('types', 'poi');
  url.searchParams.set('limit', '8');
  url.searchParams.set('proximity', near ? `${near.lng},${near.lat}` : PROXIMITY);
  url.searchParams.set('bbox', NYC_BBOX);
  url.searchParams.set('session_token', sessionToken);
  url.searchParams.set('access_token', TOKEN);
  const data = (await get(url, signal)) as { suggestions?: unknown[] };
  return (data.suggestions ?? []).flatMap((raw) => {
    const p = suggestionSchema.safeParse(raw);
    if (!p.success || p.data.feature_type !== 'poi') return [];
    const s = p.data;
    return [{
      provider: 'mapbox' as const,
      providerId: s.mapbox_id,
      name: s.name,
      address: s.full_address ?? s.place_formatted ?? '',
      category: categoryFromMapboxIds(s.poi_category_ids ?? []),
      tags: cleanTags(s.poi_category),
      neighborhood: s.context?.neighborhood?.name ?? null,
      distanceM: s.distance ?? null,
    }];
  });
}

export async function mapboxRetrieve(id: string, sessionToken: string): Promise<PlaceCandidate | null> {
  const url = new URL(`${BASE}/retrieve/${encodeURIComponent(id)}`);
  url.searchParams.set('session_token', sessionToken);
  url.searchParams.set('access_token', TOKEN);
  const data = (await get(url)) as { features?: unknown[] };
  const f = featureSchema.safeParse(data.features?.[0]);
  if (!f.success) return null;
  const p = f.data.properties;
  return {
    provider: 'mapbox',
    providerId: p.mapbox_id,
    name: p.name,
    address: p.full_address ?? p.place_formatted ?? '',
    category: categoryFromMapboxIds(p.poi_category_ids ?? []) ?? 'experience',
    lat: f.data.geometry.coordinates[1],
    lng: f.data.geometry.coordinates[0],
    tags: cleanTags(p.poi_category),
    neighborhood: p.context?.neighborhood?.name ?? null,
    photoUrl: null,
  };
}

/** Filo category → a representative Mapbox category for browsing nearby. */
const BROWSE: Record<string, string> = {
  cafe: 'coffee', food: 'restaurant', bar: 'bar', beauty: 'nail_salon', experience: 'museum', retail: 'clothing_store',
};

/**
 * Real venues near a point for one Filo category (onboarding suggestions).
 * The category endpoint returns coordinates directly, so no retrieve step.
 */
export async function mapboxBrowse(
  category: keyof typeof BROWSE,
  near: { lat: number; lng: number },
  limit = 6,
  signal?: AbortSignal,
): Promise<PlaceCandidate[]> {
  const url = new URL(`${BASE}/category/${BROWSE[category]}`);
  url.searchParams.set('proximity', `${near.lng},${near.lat}`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', TOKEN);
  const data = (await get(url, signal)) as { features?: unknown[] };
  return (data.features ?? []).flatMap((raw) => {
    const f = featureSchema.safeParse(raw);
    if (!f.success) return [];
    const p = f.data.properties;
    return [{
      provider: 'mapbox' as const,
      providerId: p.mapbox_id,
      name: p.name,
      address: p.full_address ?? p.place_formatted ?? '',
      category: categoryFromMapboxIds(p.poi_category_ids ?? []) ?? (category as PlaceCandidate['category']),
      lat: f.data.geometry.coordinates[1],
      lng: f.data.geometry.coordinates[0],
      tags: cleanTags(p.poi_category),
      neighborhood: p.context?.neighborhood?.name ?? null,
      photoUrl: null,
    }];
  });
}
