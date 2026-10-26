import { supabase } from '../supabase';
import { unwrap } from '../errors';
import type { Category } from '../categories';

export interface RankedPlace {
  placeId: string;
  name: string;
  neighborhood: string | null;
  address: string;
  position: number;
}

export interface PlaceRank {
  userId: string;
  username: string;
  category: Category;
  position: number;
  /** Length of that person's list in this category. */
  total: number;
}

export async function fetchRankings(userId: string, category: Category): Promise<RankedPlace[]> {
  const rows = unwrap(
    await supabase
      .from('rankings')
      .select('position, place_id, place:places!inner(name, neighborhood, address)')
      .eq('user_id', userId)
      .eq('category', category)
      .order('position', { ascending: true }),
  ) as unknown as { position: number; place_id: string; place: { name: string; neighborhood: string | null; address: string } | { name: string; neighborhood: string | null; address: string }[] }[];
  return rows.map((r) => {
    const p = Array.isArray(r.place) ? r.place[0] : r.place;
    return { placeId: r.place_id, name: p?.name ?? '', neighborhood: p?.neighborhood ?? null, address: p?.address ?? '', position: r.position };
  });
}

/** Every visible ranking of one place, with each list's length for "#3 of 12". */
export async function fetchRanksForPlace(placeId: string): Promise<PlaceRank[]> {
  const rows = unwrap(
    await supabase
      .from('rankings')
      .select('user_id, category, position, user:users!inner(username)')
      .eq('place_id', placeId),
  ) as unknown as { user_id: string; category: Category; position: number; user: { username: string } | { username: string }[] }[];
  if (rows.length === 0) return [];
  const users = Array.from(new Set(rows.map((r) => r.user_id)));
  const totals = unwrap(
    await supabase.from('rankings').select('user_id, category').in('user_id', users),
  ) as { user_id: string; category: string }[];
  const count = new Map<string, number>();
  for (const t of totals) count.set(`${t.user_id}|${t.category}`, (count.get(`${t.user_id}|${t.category}`) ?? 0) + 1);
  return rows.map((r) => ({
    userId: r.user_id,
    username: (Array.isArray(r.user) ? r.user[0] : r.user)?.username ?? '',
    category: r.category,
    position: r.position,
    total: count.get(`${r.user_id}|${r.category}`) ?? r.position,
  }));
}

/** Insert or move a place to `position` (1-based); atomic server-side. */
export async function rerankPlace(placeId: string, category: Category, position: number): Promise<number> {
  return unwrap(
    await supabase.rpc('rerank_place', { p_place_id: placeId, p_category: category, p_position: position }),
  ) as number;
}

export async function removeRanking(placeId: string, category: Category): Promise<void> {
  unwrap(await supabase.rpc('remove_ranking', { p_place_id: placeId, p_category: category }));
}

export interface RankingSummary {
  category: Category;
  count: number;
  top: string[];
}

/** Per-category list length + top three names, for profile overviews. */
export async function fetchRankingSummary(userId: string): Promise<RankingSummary[]> {
  const rows = unwrap(
    await supabase
      .from('rankings')
      .select('category, position, place:places!inner(name)')
      .eq('user_id', userId)
      .order('position', { ascending: true }),
  ) as unknown as { category: Category; position: number; place: { name: string } | { name: string }[] }[];
  const by = new Map<Category, RankingSummary>();
  for (const r of rows) {
    const cur = by.get(r.category) ?? { category: r.category, count: 0, top: [] };
    cur.count += 1;
    if (cur.top.length < 3) cur.top.push((Array.isArray(r.place) ? r.place[0] : r.place)?.name ?? '');
    by.set(r.category, cur);
  }
  return Array.from(by.values());
}
