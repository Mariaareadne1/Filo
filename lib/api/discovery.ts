import { supabase } from '../supabase';
import { unwrap } from '../errors';
import { normalizeCategory, type Category } from '../categories';
import type { ParsedQuery } from '../discovery/parseQuery';
import { explain } from '../discovery/explain';
import { tasteMatch } from '../tasteMatch';

export interface DiscoveryResult {
  placeId: string;
  name: string;
  category: Category;
  neighborhood: string | null;
  lat: number;
  lng: number;
  reasons: string[];
  /** Raw evidence for screen-reader/details use. */
  evidence: Record<string, unknown>;
}

interface SearchRow {
  place_id: string; name: string; category: string; neighborhood: string | null; address: string;
  lat: number; lng: number; tags: string[]; text_score: number; friend_count: number;
  friend_names: string[]; friend_top_rank: number | null; my_status: 'visited' | 'want_to_go' | null;
  distance_m: number | null; score: number;
}

/** Hybrid, grounded search over real places (see migration 20261026010000). */
export async function searchDiscovery(
  parsed: ParsedQuery,
  device: { lat: number; lng: number } | null,
  limit = 20,
): Promise<{ results: DiscoveryResult[]; relaxed: boolean }> {
  const center = parsed.near ?? (parsed.nearMe ? device : null);
  const args = {
    p_text: parsed.text,
    p_terms: parsed.terms,
    p_category: parsed.category,
    p_near_lat: center?.lat ?? null,
    p_near_lng: center?.lng ?? null,
    p_radius_m: center ? parsed.radiusM : null,
    p_friends_only: parsed.friendsOnly,
    p_limit: limit,
  };
  let rows = unwrap(await supabase.rpc('search_places', args)) as SearchRow[];
  let relaxed = false;
  // Provider tags are coarse (a vintage shop is often just "clothes store").
  // If the specific words match nothing but there IS a category/area, show
  // that — and say so — rather than an empty screen.
  if (rows.length === 0 && (parsed.category || center) && (parsed.text || parsed.terms.length)) {
    rows = unwrap(await supabase.rpc('search_places', { ...args, p_text: '', p_terms: [] })) as SearchRow[];
    relaxed = rows.length > 0;
  }
  const termSet = new Set(parsed.terms);
  const results = rows.map((r) => {
    const category = normalizeCategory(r.category) ?? 'experience';
    return {
      placeId: r.place_id,
      name: r.name,
      category,
      neighborhood: r.neighborhood,
      lat: r.lat,
      lng: r.lng,
      evidence: { ...r },
      reasons: explain({
        category,
        friendCount: r.friend_count,
        friendNames: r.friend_names,
        friendTopRank: r.friend_top_rank,
        myStatus: r.my_status,
        distanceM: r.distance_m,
        matchedTags: (r.tags ?? []).filter((t) => t.split(' ').some((w) => termSet.has(w))),
      }),
    };
  });
  return { results, relaxed };
}

export type LensId = 'trending' | 'new_to_network' | 'disagree' | 'hidden_gems' | 'most_pinned' | 'like_you';

interface LensRow {
  place_id: string; name: string; category: string; neighborhood: string | null; lat: number; lng: number;
  evidence: Record<string, unknown>;
}

function lensReasons(lens: LensId, e: Record<string, unknown>): string[] {
  switch (lens) {
    case 'trending': return [`${e.recent_pinners} people pinned it in the last ${e.window_days} days`];
    case 'new_to_network': {
      const friends = (e.friends as string[]) ?? [];
      const n = Number(e.friend_count ?? friends.length);
      return [n > 1 ? `New from @${friends[0]} and ${n - 1} more` : `New from @${friends[0]}`];
    }
    case 'disagree': return [`@${e.loves} loves it · @${e.meh} doesn't`];
    case 'hidden_gems': return [`#${e.position} of ${e.of} for @${e.ranked_by}`, `Only ${e.pinners} ${Number(e.pinners) === 1 ? 'person has' : 'people have'} pinned it`];
    case 'most_pinned': return [`${e.pinners} people pinned it · ${e.been} have been`];
    default: return [];
  }
}

export async function fetchLens(lens: Exclude<LensId, 'like_you'>, category: Category | null, limit = 20): Promise<DiscoveryResult[]> {
  const rows = unwrap(
    await supabase.rpc('discover_lens', { p_lens: lens, p_category: category, p_limit: limit }),
  ) as LensRow[];
  return rows.map((r) => ({
    placeId: r.place_id,
    name: r.name,
    category: normalizeCategory(r.category) ?? 'experience',
    neighborhood: r.neighborhood,
    lat: r.lat,
    lng: r.lng,
    evidence: r.evidence,
    reasons: lensReasons(lens, r.evidence),
  }));
}

export interface LikeYouResult {
  results: DiscoveryResult[];
  /** Why the lens is empty, when it is. */
  reason: 'ok' | 'need_rankings' | 'no_matches';
  myRanked: number;
}

/**
 * "Saved by people like you": people whose visible rankings in this
 * category correlate with yours (tie-correct Spearman, shrunk by overlap),
 * and the places they rank in their top third that you haven't pinned.
 * Computed client-side from RLS-visible rankings, so private lists you
 * can't see never influence it.
 */
export async function fetchLikeYou(me: string, category: Category, limit = 20): Promise<LikeYouResult> {
  const mineRows = unwrap(
    await supabase.from('rankings').select('place_id, position').eq('user_id', me).eq('category', category),
  ) as { place_id: string; position: number }[];
  if (mineRows.length < 3) return { results: [], reason: 'need_rankings', myRanked: mineRows.length };

  const others = unwrap(
    await supabase
      .from('rankings')
      .select('user_id, place_id, position, user:users!inner(username), place:places!inner(name, neighborhood, lat, lng)')
      .eq('category', category)
      .neq('user_id', me)
      .limit(3000),
  ) as unknown as {
    user_id: string; place_id: string; position: number;
    user: { username: string } | { username: string }[];
    place: { name: string; neighborhood: string | null; lat: number; lng: number } | { name: string; neighborhood: string | null; lat: number; lng: number }[];
  }[];
  const myPins = unwrap(await supabase.from('pins').select('place_id').eq('user_id', me)) as { place_id: string }[];
  const pinned = new Set(myPins.map((p) => p.place_id));
  const mine = new Map(mineRows.map((r) => [r.place_id, r.position]));

  const byUser = new Map<string, typeof others>();
  for (const r of others) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }

  const scores = new Map<string, { score: number; row: (typeof others)[number]; from: { username: string; overlap: number; position: number; label: 'strong' | 'promising' } }>();
  for (const [, list] of byUser) {
    const theirs = new Map(list.map((r) => [r.place_id, r.position]));
    const m = tasteMatch(mine, theirs);
    if (m.similarity <= 0 || (m.label !== 'strong' && m.label !== 'promising')) continue;
    const total = list.length;
    for (const r of list) {
      if (pinned.has(r.place_id)) continue;
      if (r.position > Math.max(1, Math.ceil(total / 3))) continue;
      const weight = m.similarity * (1 - (r.position - 1) / total);
      const prev = scores.get(r.place_id);
      const username = (Array.isArray(r.user) ? r.user[0] : r.user)?.username ?? '';
      if (!prev || weight > prev.score) {
        scores.set(r.place_id, {
          score: (prev?.score ?? 0) + weight,
          row: r,
          from: { username, overlap: m.overlap, position: r.position, label: m.label },
        });
      } else {
        prev.score += weight;
      }
    }
  }

  const results = Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([placeId, { row, from }]) => {
      const place = Array.isArray(row.place) ? row.place[0] : row.place;
      return {
        placeId,
        name: place.name,
        category,
        neighborhood: place.neighborhood,
        lat: place.lat,
        lng: place.lng,
        evidence: { from },
        reasons: explain({ category, tasteFrom: from }),
      };
    });
  return { results, reason: results.length ? 'ok' : 'no_matches', myRanked: mineRows.length };
}
