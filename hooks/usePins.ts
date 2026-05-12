import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { CATEGORY_LABELS, FriendRank, MapPin } from '../types';

export type MapMode = 'my' | 'friends' | 'campus';

export function usePins(userId: string | null, mode: MapMode) {
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPins = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    try {
      let data: MapPin[] = [];

      if (mode === 'my') {
        const { data: rows, error: err } = await supabase
          .from('pins')
          .select(`
            id,
            user_id,
            status,
            impression,
            photo_url,
            created_at,
            users!inner(username, display_name, avatar_url),
            places!inner(id, name, category, address, lat, lng, photo_url)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (err) throw err;
        data = (rows ?? []).map(normalizeRow);
        data = await enrichWithMyRanks(data, userId);

      } else if (mode === 'friends') {
        const { data: rows, error: err } = await supabase
          .rpc('get_friends_feed', { p_user_id: userId });

        if (err) throw err;
        data = (rows ?? []) as MapPin[];
        data = await enrichWithFriendRanks(data, userId);

      } else if (mode === 'campus') {
        const { data: rows, error: err } = await supabase
          .from('pins')
          .select(`
            id,
            user_id,
            status,
            impression,
            photo_url,
            created_at,
            users!inner(username, display_name, avatar_url, campus),
            places!inner(id, name, category, address, lat, lng, photo_url)
          `)
          .eq('is_public', true)
          .eq('users.campus', 'columbia')
          .order('created_at', { ascending: false })
          .limit(200);

        if (err) throw err;
        data = (rows ?? []).map(normalizeRow);
        data = await enrichWithFriendRanks(data, userId);
      }

      setPins(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load pins.');
    } finally {
      setLoading(false);
    }
  }, [userId, mode]);

  useEffect(() => {
    fetchPins();
  }, [fetchPins]);

  return { pins, loading, error, refetch: fetchPins };
}

// Normalize joined Supabase row → MapPin
function normalizeRow(row: any): MapPin {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;
  const place = Array.isArray(row.places) ? row.places[0] : row.places;
  return {
    pin_id: row.id,
    user_id: row.user_id,
    username: user?.username ?? '',
    display_name: user?.display_name ?? '',
    avatar_url: user?.avatar_url ?? null,
    place_id: place?.id ?? '',
    place_name: place?.name ?? '',
    category: place?.category ?? 'food',
    address: place?.address ?? '',
    lat: place?.lat ?? 0,
    lng: place?.lng ?? 0,
    // Prefer the pin author's own photo over the shared place photo.
    photo_url: row.photo_url ?? place?.photo_url ?? null,
    status: row.status,
    impression: row.impression ?? null,
    created_at: row.created_at,
  };
}

// ─── Rank enrichment ───────────────────────────────────────────────────

/**
 * Adds myRank + myCategoryTotal to each pin. One round-trip: fetch every
 * ranking the caller has, then index in memory. Cheap as long as the
 * caller's ranking count stays in the low thousands.
 */
export async function enrichWithMyRanks(pins: MapPin[], userId: string): Promise<MapPin[]> {
  if (pins.length === 0) return pins;

  const { data: rankings, error } = await supabase
    .from('rankings')
    .select('place_id, category, position')
    .eq('user_id', userId);

  if (error || !rankings) return pins;

  const rankByPlaceCat = new Map<string, number>();
  const totalByCat = new Map<string, number>();
  for (const r of rankings) {
    rankByPlaceCat.set(`${r.place_id}|${r.category}`, r.position);
    totalByCat.set(r.category, (totalByCat.get(r.category) ?? 0) + 1);
  }

  return pins.map((p) => ({
    ...p,
    myRank: rankByPlaceCat.get(`${p.place_id}|${p.category}`),
    myCategoryTotal: totalByCat.get(p.category),
  }));
}

/**
 * Adds friendRanks (top 3 by rank ascending) to each pin. Pulls every
 * active follow once, then two batched ranking queries: (a) ranks where
 * place is in the visible set, (b) per-friend per-category totals so we
 * can show "#3 / 14" style numerators. The CAMPUS feed reuses this — a
 * non-friend's rank is still useful context if they happen to also rank
 * the place.
 */
async function enrichWithFriendRanks(pins: MapPin[], userId: string): Promise<MapPin[]> {
  if (pins.length === 0) return pins;

  const { data: follows } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .eq('status', 'active');

  const friendIds = (follows ?? []).map((f: any) => f.following_id);
  if (friendIds.length === 0) return pins;

  const placeIds = Array.from(new Set(pins.map((p) => p.place_id).filter(Boolean)));
  if (placeIds.length === 0) return pins;

  const [rankRes, totalRes] = await Promise.all([
    supabase
      .from('rankings')
      .select('user_id, place_id, category, position, users!inner(username)')
      .in('user_id', friendIds)
      .in('place_id', placeIds),
    supabase
      .from('rankings')
      .select('user_id, category')
      .in('user_id', friendIds),
  ]);

  if (rankRes.error || totalRes.error) return pins;

  // Per-friend per-category totals
  const totalByUserCat = new Map<string, number>();
  for (const r of (totalRes.data ?? []) as any[]) {
    const key = `${r.user_id}|${r.category}`;
    totalByUserCat.set(key, (totalByUserCat.get(key) ?? 0) + 1);
  }

  // Group by place_id
  const ranksByPlace = new Map<string, FriendRank[]>();
  for (const r of (rankRes.data ?? []) as any[]) {
    const userJoin = Array.isArray(r.users) ? r.users[0] : r.users;
    const username = userJoin?.username ?? '';
    const total = totalByUserCat.get(`${r.user_id}|${r.category}`) ?? 0;
    const cat = r.category as keyof typeof CATEGORY_LABELS;
    const fr: FriendRank = {
      user_id: r.user_id,
      username,
      rank: r.position,
      total,
      categoryLabel: CATEGORY_LABELS[cat] ?? r.category,
    };
    const list = ranksByPlace.get(r.place_id) ?? [];
    list.push(fr);
    ranksByPlace.set(r.place_id, list);
  }

  // Top 3 per place by ascending rank
  for (const [k, v] of ranksByPlace.entries()) {
    v.sort((a, b) => a.rank - b.rank);
    ranksByPlace.set(k, v.slice(0, 3));
  }

  return pins.map((p) => ({
    ...p,
    friendRanks: ranksByPlace.get(p.place_id) ?? [],
  }));
}
