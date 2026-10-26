import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

interface SessionValue {
  session: Session | null;
  userId: string | null;
  email: string | null;
}

export const SessionContext = createContext<SessionValue>({ session: null, userId: null, email: null });

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

/** Signed-in user id; throws inside authenticated screens if missing. */
export function useRequiredUserId(): string {
  const { userId } = useSession();
  if (!userId) throw new Error('useRequiredUserId used outside an authenticated route');
  return userId;
}
