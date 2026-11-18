import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/**
 * One cache for all server state. Query keys are centralised in `qk` so
 * every mutation invalidates by the same identity the readers use.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, error) => {
        const code = (error as { code?: string })?.code;
        if (code === '42501' || code === 'PGRST116') return false; // auth / not found
        return count < 2;
      },
    },
    mutations: { retry: 0 },
  },
});

// Refetch stale data when the app returns to the foreground.
AppState.addEventListener('change', (state) => {
  if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
});
onlineManager.setOnline(true);

export const qk = {
  me: ['me'] as const,
  mapPins: (scope: string) => ['pins', 'map', scope] as const,
  pinsAll: ['pins'] as const,
  place: (placeId: string) => ['place', placeId] as const,
  rankings: (userId: string, category: string) => ['rankings', userId, category] as const,
  rankingsAll: ['rankings'] as const,
  boards: (userId: string) => ['boards', userId] as const,
  boardsAll: ['boards'] as const,
  board: (boardId: string) => ['board', boardId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  follow: (target: string) => ['follow', target] as const,
  requests: ['follow-requests'] as const,
  feed: ['feed'] as const,
  people: (q: string) => ['people', q] as const,
  discover: (lens: string, cat: string) => ['discover', lens, cat] as const,
  search: (q: string) => ['search', q] as const,
};
