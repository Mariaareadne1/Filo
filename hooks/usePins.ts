import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { MapPin } from '../types';

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
            created_at,
            users!inner(username, display_name, avatar_url),
            places!inner(id, name, category, address, lat, lng, photo_url)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (err) throw err;
        data = (rows ?? []).map(normalizeRow);

      } else if (mode === 'friends') {
        const { data: rows, error: err } = await supabase
          .rpc('get_friends_feed', { p_user_id: userId });

        if (err) throw err;
        data = (rows ?? []) as MapPin[];

      } else if (mode === 'campus') {
        const { data: rows, error: err } = await supabase
          .from('pins')
          .select(`
            id,
            user_id,
            status,
            impression,
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
    photo_url: place?.photo_url ?? null,
    status: row.status,
    impression: row.impression ?? null,
    created_at: row.created_at,
  };
}
