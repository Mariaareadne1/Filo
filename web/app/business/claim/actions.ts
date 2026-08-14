'use server';

import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type PlaceHit = { id: string; name: string; address: string; category: string };

// Server Actions are public POST endpoints — validate every input at the top,
// never trust the caller (they can bypass the UI entirely).
const SearchSchema = z.string().max(100);
const ClaimSchema = z.object({
  placeId: z.string().uuid(),
  name: z.string().min(1).max(200),
});

// Escape LIKE metacharacters so a user's literal `%`/`_` isn't treated as a
// wildcard (searching "%" would otherwise match everything).
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Search existing places by name. Venues usually already exist as a `places`
// row (created when the first student pinned them). Places are world-readable.
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const parsed = SearchSchema.safeParse(query);
  if (!parsed.success) return [];
  const q = parsed.data.trim();
  if (q.length < 2) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('places')
    .select('id, name, address, category')
    .ilike('name', `%${escapeLike(q)}%`)
    .limit(10);

  if (error) {
    console.error('[business] searchPlaces failed', { error: error.message });
    return [];
  }
  return (data as PlaceHit[]) ?? [];
}

export type ClaimResult = { status?: 'verified' | 'pending'; error?: string };

// Claim a venue via the trusted claim_venue RPC. The RPC decides verified vs
// pending server-side (email-domain match) — the client cannot force verified.
export async function claimVenue(placeId: string, name: string): Promise<ClaimResult> {
  const parsed = ClaimSchema.safeParse({ placeId, name });
  if (!parsed.success) return { error: 'That venue selection looks invalid — please pick one from the list.' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in first.' };

  const { data, error } = await supabase.rpc('claim_venue', {
    p_place_id: parsed.data.placeId,
    p_name: parsed.data.name,
  });
  if (error) {
    console.error('[business] claim_venue failed', { error: error.message });
    return { error: 'Could not complete the claim. Please try again.' };
  }

  return { status: data as 'verified' | 'pending' };
}
