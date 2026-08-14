import { createSupabaseServerClient } from './supabase-server';

export type Business = {
  id: string;
  place_id: string | null;
  name: string;
  tier: 'free' | 'pro' | 'premium';
};

export type DiscoveryCounts = { this_week: number; prior_week: number; delta: number };
export type DiscoverySource = { source_type: string; label: string; reach: number };
export type CategoryRank = { category: string; rank: number | null; total: number };

/**
 * The signed-in business account, or null if unauthenticated / no account yet.
 * RLS ensures a caller only ever sees their own `businesses` row.
 */
export async function getCurrentBusiness(): Promise<Business | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('businesses')
    .select('id, place_id, name, tier')
    .eq('owner_auth_id', user.id)
    .maybeSingle();

  return (data as Business) ?? null;
}

/**
 * The three discovery-analytics RPCs for a claimed venue, fetched in parallel.
 * Each RPC self-authorizes (verified claim required); a forbidden/error result
 * surfaces as null so the UI can degrade gracefully rather than throw.
 */
export async function getVenueAnalytics(placeId: string): Promise<{
  counts: DiscoveryCounts | null;
  sources: DiscoverySource[];
  rank: CategoryRank | null;
}> {
  const supabase = await createSupabaseServerClient();

  const [countsRes, sourcesRes, rankRes] = await Promise.all([
    supabase.rpc('venue_discovery_counts', { p_place_id: placeId }),
    supabase.rpc('venue_discovery_sources', { p_place_id: placeId }),
    supabase.rpc('venue_category_rank', { p_place_id: placeId }),
  ]);

  // A genuine RPC failure (outage, authz regression) otherwise renders
  // identically to an empty "no data yet" state — log it before degrading.
  for (const [name, res] of [
    ['venue_discovery_counts', countsRes],
    ['venue_discovery_sources', sourcesRes],
    ['venue_category_rank', rankRes],
  ] as const) {
    if (res.error) console.error(`[business] ${name} failed`, { placeId, error: res.error.message });
  }

  const counts = (countsRes.data?.[0] as DiscoveryCounts) ?? null;
  const sources = ((sourcesRes.data as DiscoverySource[]) ?? []).filter(
    (s) => s.reach != null && s.reach > 0,
  );
  const rank = (rankRes.data?.[0] as CategoryRank) ?? null;

  return { counts, sources, rank };
}
