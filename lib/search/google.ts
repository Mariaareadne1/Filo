import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { Category, categoryFromGoogleTypes } from '../categories';

/**
 * Google Places (legacy web service) client.
 *
 * Cost/latency model (Filo 2.0): autocomplete per keystroke burst, details
 * ONCE when the user picks a result. The old client fetched details for the
 * top 5 predictions on every debounced keystroke (6 billed calls/keystroke).
 * A session token groups autocomplete + the final details call into one
 * billed session.
 *
 * The API key is NEVER persisted: stored photo URLs carry only the photo
 * reference; `placePhotoUrl()` appends the key at render time. Previously the
 * key was written into places.photo_url and readable by every user.
 */

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';
const PHOTO_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/photo';

/** NYC bounding box — restricts autocomplete to the five boroughs. */
const NYC_RECT = 'rectangle:40.4774,-74.2591|40.9176,-73.7004';
const REQUEST_TIMEOUT_MS = 8000;

export class PlacesUnavailableError extends Error {
  constructor(message = 'Place search is not configured.') {
    super(message);
    this.name = 'PlacesUnavailableError';
  }
}

export interface PlacePrediction {
  googlePlaceId: string;
  primary: string;
  secondary: string;
}

export interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  category: Category;
  lat: number;
  lng: number;
  /** Key-less photo URL (see placePhotoUrl). */
  photo_url: string | null;
}

const predictionSchema = z.object({
  place_id: z.string().min(1),
  description: z.string().optional(),
  structured_formatting: z
    .object({ main_text: z.string(), secondary_text: z.string().optional() })
    .optional(),
});

const detailsSchema = z.object({
  place_id: z.string().min(1),
  name: z.string().min(1),
  formatted_address: z.string().optional(),
  types: z.array(z.string()).optional(),
  geometry: z.object({ location: z.object({ lat: z.number(), lng: z.number() }) }),
  photos: z.array(z.object({ photo_reference: z.string() })).optional(),
});

export function isPlacesConfigured(): boolean {
  return API_KEY.length > 0;
}

export function newPlacesSessionToken(): string {
  return Crypto.randomUUID();
}

async function getJson(url: URL, signal?: AbortSignal): Promise<unknown> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url.toString(), { signal: timeout.signal });
    if (!res.ok) throw new Error(`Place search failed (${res.status}).`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function assertOk(data: unknown): asserts data is Record<string, unknown> {
  const status = (data as { status?: string })?.status;
  if (status === 'OK' || status === 'ZERO_RESULTS') return;
  if (status === 'REQUEST_DENIED') {
    throw new PlacesUnavailableError('Place search is unavailable right now.');
  }
  throw new Error('Place search failed. Check your connection and try again.');
}

export async function autocompletePlaces(
  query: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlacePrediction[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (!isPlacesConfigured()) throw new PlacesUnavailableError();

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', q);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('locationrestriction', NYC_RECT);
  url.searchParams.set('types', 'establishment');
  url.searchParams.set('sessiontoken', sessionToken);

  const data = await getJson(url, signal);
  assertOk(data);
  const raw = Array.isArray(data.predictions) ? data.predictions : [];
  return raw.flatMap((p) => {
    const parsed = predictionSchema.safeParse(p);
    if (!parsed.success) return [];
    const sf = parsed.data.structured_formatting;
    return [{
      googlePlaceId: parsed.data.place_id,
      primary: sf?.main_text ?? parsed.data.description ?? '',
      secondary: sf?.secondary_text ?? '',
    }];
  });
}

export async function fetchPlaceDetails(
  googlePlaceId: string,
  sessionToken?: string,
): Promise<PlaceResult | null> {
  if (!isPlacesConfigured()) throw new PlacesUnavailableError();
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', googlePlaceId);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('fields', 'place_id,name,formatted_address,types,geometry,photos');
  if (sessionToken) url.searchParams.set('sessiontoken', sessionToken);

  const data = await getJson(url);
  assertOk(data);
  const parsed = detailsSchema.safeParse(data.result);
  if (!parsed.success) return null;
  const r = parsed.data;
  const ref = r.photos?.[0]?.photo_reference;
  return {
    place_id: r.place_id,
    name: r.name,
    address: r.formatted_address ?? '',
    category: categoryFromGoogleTypes(r.types ?? []),
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    photo_url: ref ? `${PHOTO_ENDPOINT}?maxwidth=800&photo_reference=${encodeURIComponent(ref)}` : null,
  };
}

/**
 * Resolves a stored photo URL for display at `width` px. Google photo URLs
 * get the (bundle-public, app-restricted) key appended here and a size
 * matched to where they render; any key embedded by a legacy row is replaced.
 * Supabase Storage URLs pass through unchanged.
 */
export function placePhotoUrl(url: string | null | undefined, width = 800): string | null {
  if (!url) return null;
  if (!url.startsWith(PHOTO_ENDPOINT)) return url;
  const u = new URL(url);
  u.searchParams.set('maxwidth', String(Math.round(width)));
  if (API_KEY) u.searchParams.set('key', API_KEY);
  else u.searchParams.delete('key');
  return u.toString();
}

/** @deprecated use placePhotoUrl — kept for screens not yet migrated. */
export const resizePlacePhoto = placePhotoUrl;
