import { supabase } from '../supabase';
import { unwrap } from '../errors';
import { normalizeCategory, type Category } from '../categories';

export type BoardVisibility = 'private' | 'friends' | 'public';

export interface BoardSummary {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  visibility: BoardVisibility;
  share_token: string | null;
  pinCount: number;
  /** Up to four real photos (pin author's own, else the venue's). */
  covers: string[];
  categories: Category[];
  updated_at: string | null;
}

export interface BoardItem {
  id: string; // board_pins.id
  position: number;
  pinId: string;
  pinOwnerId: string;
  placeId: string;
  name: string;
  category: Category;
  address: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
  impression: string | null;
  status: 'visited' | 'want_to_go';
  photoUrl: string | null;
}

interface RawBoardPin {
  id: string;
  position: number;
  pin_id: string;
  pin: {
    user_id: string;
    status: 'visited' | 'want_to_go';
    impression: string | null;
    photo_url: string | null;
    place: { id: string; name: string; category: string; address: string; neighborhood: string | null; lat: number; lng: number; photo_url: string | null };
  } | null;
}

const ITEM_SELECT = `id, position, pin_id,
  pin:pins!inner(user_id, status, impression, photo_url,
    place:places!inner(id, name, category, address, neighborhood, lat, lng, photo_url))`;

function toItem(r: RawBoardPin): BoardItem | null {
  if (!r.pin) return null;
  const pl = r.pin.place;
  return {
    id: r.id,
    position: r.position,
    pinId: r.pin_id,
    pinOwnerId: r.pin.user_id,
    placeId: pl.id,
    name: pl.name,
    category: normalizeCategory(pl.category) ?? 'experience',
    address: pl.address,
    neighborhood: pl.neighborhood,
    lat: pl.lat,
    lng: pl.lng,
    impression: r.pin.impression,
    status: r.pin.status,
    photoUrl: r.pin.photo_url ?? pl.photo_url,
  };
}

export async function fetchBoards(ownerId: string): Promise<BoardSummary[]> {
  const boards = unwrap(
    await supabase
      .from('boards')
      .select('id, user_id, name, description, visibility, share_token, updated_at, created_at')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false }),
  ) as Omit<BoardSummary, 'pinCount' | 'covers' | 'categories'>[];
  if (boards.length === 0) return [];
  const items = unwrap(
    await supabase
      .from('board_pins')
      .select(`board_id, ${ITEM_SELECT}`)
      .in('board_id', boards.map((b) => b.id))
      .order('position', { ascending: true }),
  ) as unknown as (RawBoardPin & { board_id: string })[];
  const byBoard = new Map<string, BoardItem[]>();
  for (const r of items) {
    const it = toItem(r);
    if (!it) continue;
    const list = byBoard.get(r.board_id) ?? [];
    list.push(it);
    byBoard.set(r.board_id, list);
  }
  return boards.map((b) => {
    const list = byBoard.get(b.id) ?? [];
    return {
      ...b,
      pinCount: list.length,
      covers: list.map((i) => i.photoUrl).filter((u): u is string => !!u).slice(0, 4),
      categories: Array.from(new Set(list.map((i) => i.category))),
    };
  });
}

export interface BoardDetail {
  board: Omit<BoardSummary, 'pinCount' | 'covers' | 'categories'> & { cover_pin_id: string | null };
  owner: { id: string; username: string; display_name: string };
  items: BoardItem[];
}

export async function fetchBoard(boardId: string): Promise<BoardDetail | null> {
  const board = unwrap(
    await supabase
      .from('boards')
      .select('id, user_id, name, description, visibility, share_token, updated_at, cover_pin_id, owner:users!inner(id, username, display_name)')
      .eq('id', boardId)
      .maybeSingle(),
  ) as (BoardDetail['board'] & { owner: BoardDetail['owner'] | BoardDetail['owner'][] }) | null;
  if (!board) return null;
  const items = unwrap(
    await supabase.from('board_pins').select(ITEM_SELECT).eq('board_id', boardId).order('position', { ascending: true }),
  ) as unknown as RawBoardPin[];
  const { owner, ...rest } = board;
  return {
    board: rest,
    owner: Array.isArray(owner) ? owner[0] : owner,
    items: items.map(toItem).filter((x): x is BoardItem => !!x),
  };
}

export async function createBoard(input: { name: string; description?: string | null; visibility: BoardVisibility }): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not signed in');
  const row = unwrap(
    await supabase
      .from('boards')
      .insert({ user_id: auth.user.id, name: input.name.trim(), description: input.description?.trim() || null, visibility: input.visibility })
      .select('id')
      .single(),
  );
  if (!row) throw new Error('board not created');
  return row.id as string;
}

export async function updateBoard(
  boardId: string,
  patch: { name?: string; description?: string | null; visibility?: BoardVisibility; cover_pin_id?: string | null },
): Promise<void> {
  const body = { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) };
  unwrap(await supabase.from('boards').update(body).eq('id', boardId).select('id').single());
}

export async function deleteBoard(boardId: string): Promise<void> {
  unwrap(await supabase.from('boards').delete().eq('id', boardId));
}

export async function addPinToBoard(boardId: string, pinId: string): Promise<void> {
  unwrap(await supabase.rpc('add_pin_to_board', { p_board_id: boardId, p_pin_id: pinId }));
}

export async function removeBoardItem(boardPinId: string): Promise<void> {
  unwrap(await supabase.from('board_pins').delete().eq('id', boardPinId));
}

export async function reorderBoard(boardId: string, orderedBoardPinIds: string[]): Promise<void> {
  unwrap(await supabase.rpc('reorder_board', { p_board_id: boardId, p_board_pin_ids: orderedBoardPinIds }));
}

/** Public web URL for a shared board (served by the Next.js app in /web). */
export function boardShareUrl(token: string): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://filo.app';
  return `${base.replace(/\/$/, '')}/b/${token}`;
}
