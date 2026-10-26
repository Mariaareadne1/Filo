import { useSession } from '../lib/session';

/**
 * The signed-in user's id, read from the root session context (no extra
 * network round trip). Kept for screens written against the old API:
 * `null` when signed out.
 */
export function useCurrentUserId(): string | null {
  return useSession().userId;
}
