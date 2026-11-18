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

