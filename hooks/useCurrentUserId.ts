import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Resolves the signed-in user's id once, with unmount safety.
 *
 * Replaces the ~6 hand-rolled `supabase.auth.getUser().then(setX)` effects
 * that each risked a setState-after-unmount. Returns `undefined` while
 * resolving and `null` when signed out, so callers can distinguish the two.
 */
export function useCurrentUserId(): string | null | undefined {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  return userId;
}
