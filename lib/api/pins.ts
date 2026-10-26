import { supabase } from '../supabase';
import { unwrap } from '../errors';
import { Category, normalizeCategory } from '../categories';
import type { PlaceCandidate } from '../search';

export type PinStatus = 'visited' | 'want_to_go';

export interface PlaceRow {
  id: string;
  google_place_id: string;
  source: 'google' | 'mapbox';
  name: string;
  address: string;
  category: Category;
  lat: number;
  lng: number;
  photo_url: string | null;
  tags: string[];
  neighborhood: string | null;
}

export interface PersonRef {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

/** One person's pin at a place, as shown on the map and in the sheet. */
export interface PinRow {
  id: string;
  user_id: string;
  place_id: string;
  status: PinStatus;
  impression: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string | null;
  user: PersonRef;
  place: PlaceRow;
}

const PLACE_COLS = 'id, google_place_id, source, name, address, category, lat, lng, photo_url, tags, neighborhood';
const PIN_SELECT = `id, user_id, place_id, status, impression, photo_url, created_at, updated_at,
  user:users!inner(id, username, display_name, avatar_url),
  place:places!inner(${PLACE_COLS})`;

type RawPin = Omit<PinRow, 'user' | 'place'> & { user: PersonRef | PersonRef[]; place: PlaceRow | PlaceRow[] };

function one<T>(v: T | T[]): T {
  return Array.isArray(v) ? v[0] : v;
}

export function normalizePin(raw: RawPin): PinRow {
  const place = one(raw.place);
  return {
    ...raw,
    user: one(raw.user),
    place: { ...place, category: normalizeCategory(place.category) ?? 'experience', tags: place.tags ?? [] },
  };
}

/** Everyone whose pins the caller sees on the friends map (active follows). */
export async function fetchFollowingIds(userId: string): Promise<string[]> {
  const rows = unwrap(
    await supabase.from('follows').select('following_id').eq('follower_id', userId).eq('status', 'active'),
  );
  return (rows ?? []).map((r) => r.following_id as string);
}

/**
 * The map's data: the caller's pins plus their friends' pins. RLS decides
 * visibility (private accounts only to approved followers), so this never
 * over-fetches someone's hidden pins.
 */
export async function fetchMapPins(userId: string): Promise<PinRow[]> {
  const friends = await fetchFollowingIds(userId);
  const ids = [userId, ...friends];
  const rows = unwrap(
    await supabase
      .from('pins')
      .select(PIN_SELECT)
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .limit(1500),
  );
  return ((rows ?? []) as unknown as RawPin[]).map(normalizePin);
}

/** All visible pins at one place (yours + friends' + public), newest first. */
export async function fetchPinsAtPlace(placeId: string): Promise<PinRow[]> {
  const rows = unwrap(
    await supabase.from('pins').select(PIN_SELECT).eq('place_id', placeId).order('created_at', { ascending: false }).limit(50),
  );
  return ((rows ?? []) as unknown as RawPin[]).map(normalizePin);
}

export async function fetchPlace(placeId: string): Promise<PlaceRow | null> {
  const row = unwrap(await supabase.from('places').select(PLACE_COLS).eq('id', placeId).maybeSingle());
  if (!row) return null;
  const place = row as unknown as PlaceRow;
  return { ...place, category: normalizeCategory(place.category) ?? 'experience', tags: place.tags ?? [] };
}

export interface SavePinInput {
  /** A fresh search result, or an existing place row from the map. */
  place: PlaceCandidate | PlaceRow;
  status: PinStatus;
  impression: string | null;
}

export interface SavePinResult {
  pinId: string;
  placeId: string;
  created: boolean;
}

function isPlaceRow(p: PlaceCandidate | PlaceRow): p is PlaceRow {
  return (p as PlaceRow).google_place_id !== undefined;
}

/** Dedupes the venue and upserts the caller's pin in one transaction. */
export async function savePin({ place, status, impression }: SavePinInput): Promise<SavePinResult> {
  const p = isPlaceRow(place)
    ? {
        id: place.google_place_id, source: place.source, name: place.name, address: place.address,
        category: place.category, lat: place.lat, lng: place.lng, photo: place.photo_url,
        tags: place.tags, neighborhood: place.neighborhood,
      }
    : {
        id: place.providerId, source: place.provider, name: place.name, address: place.address,
        category: place.category, lat: place.lat, lng: place.lng, photo: place.photoUrl,
        tags: place.tags, neighborhood: place.neighborhood,
      };
  const rows = unwrap(
    await supabase.rpc('save_pin', {
      p_google_place_id: p.id,
      p_name: p.name,
      p_address: p.address,
      p_category: p.category,
      p_lat: p.lat,
      p_lng: p.lng,
      p_photo_url: p.photo,
      p_status: status,
      p_impression: impression?.trim() ? impression.trim() : null,
      p_source: p.source,
      p_tags: p.tags,
      p_neighborhood: p.neighborhood,
    }),
  ) as { pin_id: string; place_id: string; created: boolean }[];
  const r = rows[0];
  return { pinId: r.pin_id, placeId: r.place_id, created: r.created };
}

export async function updatePin(
  pinId: string,
  patch: { status?: PinStatus; impression?: string | null },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.status) body.status = patch.status;
  if (patch.impression !== undefined) body.impression = patch.impression?.trim() || null;
  unwrap(await supabase.from('pins').update(body).eq('id', pinId).select('id').single());
}

export async function deletePin(pinId: string, userId: string): Promise<void> {
  // Best-effort removal of the uploaded photo; the row delete is what matters.
  await supabase.storage.from('pin-photos').remove([`${userId}/${pinId}.jpg`]).catch(() => undefined);
  unwrap(await supabase.from('pins').delete().eq('id', pinId).eq('user_id', userId));
}

/** Venues already in Filo matching a name, neighborhood or tag. */
export async function searchKnownPlaces(query: string): Promise<PlaceRow[]> {
  const q = query.trim().replace(/[%_,()]/g, '');
  if (q.length < 2) return [];
  const rows = unwrap(
    await supabase
      .from('places')
      .select(PLACE_COLS)
      .or(`name.ilike.%${q}%,neighborhood.ilike.%${q}%,tags.cs.{${q.toLowerCase()}}`)
      .limit(8),
  );
  return ((rows ?? []) as unknown as PlaceRow[]).map((p) => ({
    ...p, category: normalizeCategory(p.category) ?? 'experience', tags: p.tags ?? [],
  }));
}
