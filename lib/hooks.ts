import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from './queryClient';
import { supabase } from './supabase';
import { unwrap } from './errors';
import { useSession } from './session';
import {
  deletePin, fetchMapPins, fetchUserPins, fetchPinsAtPlace, fetchPlace, savePin, updatePin,
  type PinStatus, type SavePinInput,
} from './api/pins';
import { fetchRankingSummary, fetchRankings, fetchRanksForPlace, removeRanking, rerankPlace, type RankedPlace } from './api/rankings';
import {
  addPinToBoard, createBoard, deleteBoard, fetchBoard, fetchBoards, removeBoardItem, reorderBoard, updateBoard,
  type BoardDetail, type BoardVisibility,
} from './api/boards';
import {
  FEED_PAGE, fetchFeedPage, fetchFollowList, fetchFollowState, fetchIncomingRequests, fetchProfile,
  follow, respondToRequest, searchPeople, unfollow, type FollowState,
} from './api/social';
import type { Category } from './categories';

// ─── Map & places ─────────────────────────────────────────────────────

export function useMapPins() {
  const { userId } = useSession();
  return useQuery({
    queryKey: qk.mapPins(userId ?? 'anon'),
    queryFn: () => fetchMapPins(userId!),
    enabled: !!userId,
  });
}

export function usePlaceDetail(placeId: string | null) {
  return useQuery({
    queryKey: qk.place(placeId ?? ''),
    enabled: !!placeId,
    queryFn: async () => {
      const [place, pins, ranks] = await Promise.all([
        fetchPlace(placeId!),
        fetchPinsAtPlace(placeId!),
        fetchRanksForPlace(placeId!),
      ]);
      return { place, pins, ranks };
    },
  });
}

/** After any pin write: map, the place, rankings (status changes can drop ranks), boards. */
function useInvalidatePins() {
  const qc = useQueryClient();
  return (placeId?: string) => {
    qc.invalidateQueries({ queryKey: qk.pinsAll });
    qc.invalidateQueries({ queryKey: qk.rankingsAll });
    qc.invalidateQueries({ queryKey: qk.boardsAll });
    qc.invalidateQueries({ queryKey: qk.feed });
    if (placeId) qc.invalidateQueries({ queryKey: qk.place(placeId) });
    if (!placeId) qc.invalidateQueries({ queryKey: ['place'] });
  };
}

export function useSavePin() {
  const invalidate = useInvalidatePins();
  return useMutation({
    mutationFn: (input: SavePinInput) => savePin(input),
    onSuccess: (r) => invalidate(r.placeId),
  });
}

export function useUpdatePin(placeId: string) {
  const invalidate = useInvalidatePins();
  return useMutation({
    mutationFn: (v: { pinId: string; status?: PinStatus; impression?: string | null }) =>
      updatePin(v.pinId, { status: v.status, impression: v.impression }),
    onSuccess: () => invalidate(placeId),
  });
}

export function useDeletePin(placeId: string) {
  const invalidate = useInvalidatePins();
  const { userId } = useSession();
  return useMutation({
    mutationFn: (pinId: string) => deletePin(pinId, userId!),
    onSuccess: () => invalidate(placeId),
  });
}

// ─── Rankings ─────────────────────────────────────────────────────────

export function useRankings(userId: string | null, category: Category) {
  return useQuery({
    queryKey: qk.rankings(userId ?? '', category),
    queryFn: () => fetchRankings(userId!, category),
    enabled: !!userId,
  });
}

/**
 * Move/insert with an optimistic reorder: the list moves under the finger
 * immediately; the server renumbers atomically; on failure we roll back to
 * the snapshot and the caller shows the error.
 */
export function useRerank(category: Category) {
  const qc = useQueryClient();
  const { userId } = useSession();
  const key = qk.rankings(userId ?? '', category);
  return useMutation({
    mutationFn: (v: { placeId: string; position: number }) => rerankPlace(v.placeId, category, v.position),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RankedPlace[]>(key);
      if (prev) {
        const moving = prev.find((p) => p.placeId === v.placeId);
        if (moving) {
          const rest = prev.filter((p) => p.placeId !== v.placeId);
          rest.splice(v.position - 1, 0, moving);
          qc.setQueryData(key, rest.map((p, i) => ({ ...p, position: i + 1 })));
        }
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: qk.place(v.placeId) });
      qc.invalidateQueries({ queryKey: qk.pinsAll });
    },
  });
}

export function useRemoveRanking(category: Category) {
  const qc = useQueryClient();
  const { userId } = useSession();
  const key = qk.rankings(userId ?? '', category);
  return useMutation({
    mutationFn: (placeId: string) => removeRanking(placeId, category),
    onMutate: async (placeId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RankedPlace[]>(key);
      if (prev) qc.setQueryData(key, prev.filter((p) => p.placeId !== placeId).map((p, i) => ({ ...p, position: i + 1 })));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: (_d, _e, placeId) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: qk.place(placeId) });
    },
  });
}

// ─── Boards ───────────────────────────────────────────────────────────

export function useBoards(ownerId: string | null) {
  return useQuery({
    queryKey: qk.boards(ownerId ?? ''),
    queryFn: () => fetchBoards(ownerId!),
    enabled: !!ownerId,
  });
}

export function useBoard(boardId: string | null) {
  return useQuery({
    queryKey: qk.board(boardId ?? ''),
    queryFn: () => fetchBoard(boardId!),
    enabled: !!boardId,
  });
}

function useInvalidateBoards() {
  const qc = useQueryClient();
  return (boardId?: string) => {
    qc.invalidateQueries({ queryKey: qk.boardsAll });
    if (boardId) qc.invalidateQueries({ queryKey: qk.board(boardId) });
  };
}

export function useCreateBoard() {
  const invalidate = useInvalidateBoards();
  return useMutation({
    mutationFn: (v: { name: string; description?: string | null; visibility: BoardVisibility }) => createBoard(v),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateBoard(boardId: string) {
  const invalidate = useInvalidateBoards();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateBoard>[1]) => updateBoard(boardId, patch),
    onSuccess: () => invalidate(boardId),
  });
}

export function useDeleteBoard() {
  const invalidate = useInvalidateBoards();
  return useMutation({ mutationFn: deleteBoard, onSuccess: () => invalidate() });
}

export function useAddToBoard() {
  const invalidate = useInvalidateBoards();
  return useMutation({
    mutationFn: (v: { boardId: string; pinId: string }) => addPinToBoard(v.boardId, v.pinId),
    onSuccess: (_d, v) => invalidate(v.boardId),
  });
}

export function useRemoveBoardItem(boardId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateBoards();
  return useMutation({
    mutationFn: removeBoardItem,
    onMutate: async (itemId: string) => {
      const key = qk.board(boardId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BoardDetail | null>(key);
      if (prev) qc.setQueryData(key, { ...prev, items: prev.items.filter((i) => i.id !== itemId) });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(qk.board(boardId), ctx.prev); },
    onSettled: () => invalidate(boardId),
  });
}

export function useReorderBoard(boardId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateBoards();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderBoard(boardId, orderedIds),
    onMutate: async (orderedIds) => {
      const key = qk.board(boardId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BoardDetail | null>(key);
      if (prev) {
        const byId = new Map(prev.items.map((i) => [i.id, i]));
        const items = orderedIds.map((id, idx) => ({ ...byId.get(id)!, position: idx })).filter((i) => i.id);
        qc.setQueryData(key, { ...prev, items });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(qk.board(boardId), ctx.prev); },
    onSettled: () => invalidate(boardId),
  });
}

// ─── Social ───────────────────────────────────────────────────────────

export function useProfile(userId: string | null) {
  return useQuery({ queryKey: qk.profile(userId ?? ''), queryFn: () => fetchProfile(userId!), enabled: !!userId });
}

export function useFollowState(target: string | null) {
  const { userId } = useSession();
  return useQuery({
    queryKey: qk.follow(target ?? ''),
    queryFn: () => fetchFollowState(userId!, target!),
    enabled: !!userId && !!target && userId !== target,
  });
}

export function useToggleFollow(target: string) {
  const qc = useQueryClient();
  const { userId } = useSession();
  return useMutation({
    mutationFn: async (current: FollowState): Promise<FollowState> => {
      if (current === 'none') return follow(userId!, target);
      await unfollow(userId!, target);
      return 'none';
    },
    onSuccess: (state) => {
      qc.setQueryData(qk.follow(target), state);
      qc.invalidateQueries({ queryKey: qk.profile(target) });
      qc.invalidateQueries({ queryKey: qk.profile(userId!) });
      qc.invalidateQueries({ queryKey: qk.pinsAll });
      qc.invalidateQueries({ queryKey: qk.feed });
    },
  });
}

export function useFollowRequests() {
  const { userId } = useSession();
  return useQuery({ queryKey: qk.requests, queryFn: () => fetchIncomingRequests(userId!), enabled: !!userId });
}

export function useRespondToRequest() {
  const qc = useQueryClient();
  const { userId } = useSession();
  return useMutation({
    mutationFn: (v: { followerId: string; accept: boolean }) => respondToRequest(v.followerId, v.accept),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.requests });
      qc.invalidateQueries({ queryKey: qk.profile(userId!) });
    },
  });
}

export function useFollowList(userId: string | null, kind: 'followers' | 'following') {
  return useQuery({
    queryKey: ['follow-list', userId, kind],
    queryFn: () => fetchFollowList(userId!, kind),
    enabled: !!userId,
  });
}

export function usePeopleSearch(query: string) {
  const { userId } = useSession();
  return useQuery({
    queryKey: qk.people(query.trim().toLowerCase()),
    queryFn: () => searchPeople(query, userId!),
    enabled: !!userId && query.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useFeed() {
  const { userId } = useSession();
  return useInfiniteQuery({
    queryKey: qk.feed,
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchFeedPage(userId!, pageParam),
    getNextPageParam: (last) => (last.length < FEED_PAGE ? undefined : last[last.length - 1].created_at),
  });
}

export function useUserPins(userId: string | null) {
  return useQuery({ queryKey: [...qk.pinsAll, 'user', userId], queryFn: () => fetchUserPins(userId!), enabled: !!userId });
}

export function useRankingSummary(userId: string | null) {
  return useQuery({ queryKey: [...qk.rankingsAll, 'summary', userId], queryFn: () => fetchRankingSummary(userId!), enabled: !!userId });
}

export function useSetPrivacy() {
  const qc = useQueryClient();
  const { userId } = useSession();
  return useMutation({
    mutationFn: async (isPrivate: boolean) => {
      unwrap(await supabase.from('users').update({ is_private: isPrivate }).eq('id', userId!).select('id').single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profile(userId!) }),
  });
}
