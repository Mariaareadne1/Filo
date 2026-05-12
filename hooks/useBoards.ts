import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface Board {
  id: string;
  name: string;
  description: string | null;
  visibility: 'private' | 'friends' | 'public';
  share_token: string | null;
  pin_count: number;
  created_at: string;
}

export interface BoardPin {
  id: string;          // board_pins.id
  position: number;
  pin_id: string;
  place_name: string;
  category: string;
  address: string;
  impression: string | null;
  status: string;
  lat: number;
  lng: number;
  /** Coalesced photo: pin author's own photo, falling back to the
   *  shared place photo when the pin has none. */
  photo_url: string | null;
}

export function useBoards(userId: string | null) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('boards')
      .select('id, name, description, visibility, share_token, created_at, board_pins(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    setBoards(
      (data ?? []).map((b: any) => ({
        ...b,
        pin_count: b.board_pins?.[0]?.count ?? 0,
      }))
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { boards, loading, refetch: fetch };
}

export async function fetchBoardPins(boardId: string): Promise<BoardPin[]> {
  const { data } = await supabase
    .from('board_pins')
    .select(`
      id,
      position,
      pin_id,
      pins!inner(
        status,
        impression,
        photo_url,
        places!inner(name, category, address, lat, lng, photo_url)
      )
    `)
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  return (data ?? []).map((row: any) => {
    const pin = Array.isArray(row.pins) ? row.pins[0] : row.pins;
    const place = Array.isArray(pin?.places) ? pin.places[0] : pin?.places;
    return {
      id: row.id,
      position: row.position,
      pin_id: row.pin_id,
      place_name: place?.name ?? '',
      category: place?.category ?? 'food',
      address: place?.address ?? '',
      impression: pin?.impression ?? null,
      status: pin?.status ?? 'visited',
      lat: place?.lat ?? 0,
      lng: place?.lng ?? 0,
      // Prefer the pin author's own photo over the shared place photo.
      photo_url: pin?.photo_url ?? place?.photo_url ?? null,
    };
  });
}
