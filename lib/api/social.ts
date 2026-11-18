import { supabase } from '../supabase';
import { unwrap } from '../errors';
import type { PersonRef } from './pins';
import { normalizeCategory, type Category } from '../categories';

export type FollowState = 'none' | 'pending' | 'active';

export interface Profile extends PersonRef {
  is_private: boolean;
  campus: string | null;
  followers: number;
  following: number;
  pins: number;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const [u, followers, following, pins] = await Promise.all([
    supabase.from('users').select('id, username, display_name, avatar_url, is_private, campus').eq('id', userId).maybeSingle(),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId).eq('status', 'active'),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'active'),
    supabase.from('pins').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  const user = unwrap(u);
  if (!user) return null;
  return {
    ...(user as Omit<Profile, 'followers' | 'following' | 'pins'>),
    followers: followers.count ?? 0,
    following: following.count ?? 0,
    pins: pins.count ?? 0,
  };
}

export async function fetchFollowState(me: string, target: string): Promise<FollowState> {
  const row = unwrap(
    await supabase.from('follows').select('status').eq('follower_id', me).eq('following_id', target).maybeSingle(),
  );
  return (row?.status as FollowState | undefined) ?? 'none';
}

/** Server decides active vs pending from the target's privacy (trigger). */
export async function follow(me: string, target: string): Promise<FollowState> {
  unwrap(await supabase.from('follows').insert({ follower_id: me, following_id: target }));
  const state = await fetchFollowState(me, target);
  // Push is best-effort; the follow itself already succeeded.
  supabase.rpc('notify_new_follow', { p_follower_id: me, p_following_id: target }).then(() => undefined, () => undefined);
  return state;
}

export async function unfollow(me: string, target: string): Promise<void> {
  unwrap(await supabase.from('follows').delete().eq('follower_id', me).eq('following_id', target));
}

export interface FollowRequest {
  follower: PersonRef;
  created_at: string;
}

export async function fetchIncomingRequests(me: string): Promise<FollowRequest[]> {
  const rows = unwrap(
    await supabase
      .from('follows')
      .select('created_at, follower:users!follows_follower_id_fkey(id, username, display_name, avatar_url)')
      .eq('following_id', me)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ) as unknown as { created_at: string; follower: PersonRef | PersonRef[] }[];
  return rows.map((r) => ({ created_at: r.created_at, follower: Array.isArray(r.follower) ? r.follower[0] : r.follower }));
}

export async function respondToRequest(followerId: string, accept: boolean): Promise<void> {
  unwrap(await supabase.rpc('respond_follow_request', { p_follower_id: followerId, p_accept: accept }));
}

export async function fetchFollowList(userId: string, kind: 'followers' | 'following'): Promise<PersonRef[]> {
  const col = kind === 'followers' ? 'follower_id' : 'following_id';
  const match = kind === 'followers' ? 'following_id' : 'follower_id';
  const fk = kind === 'followers' ? 'follows_follower_id_fkey' : 'follows_following_id_fkey';
  const rows = unwrap(
    await supabase
      .from('follows')
      .select(`${col}, person:users!${fk}(id, username, display_name, avatar_url)`)
      .eq(match, userId)
      .eq('status', 'active'),
  ) as unknown as { person: PersonRef | PersonRef[] }[];
  return rows.map((r) => (Array.isArray(r.person) ? r.person[0] : r.person)).filter(Boolean);
}

export async function searchPeople(query: string, me: string): Promise<PersonRef[]> {
  const q = query.trim().replace(/[%_,()]/g, '');
  if (q.length < 2) return [];
  const rows = unwrap(
    await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', me)
      .limit(20),
  );
  return (rows ?? []) as PersonRef[];
}

export interface FeedItem {
  pin_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  place_id: string;
  place_name: string;
  category: Category;
  address: string;
  lat: number;
  lng: number;
  photo_url: string | null;
  status: 'visited' | 'want_to_go';
  impression: string | null;
  created_at: string;
}

export const FEED_PAGE = 30;

export async function fetchFeedPage(me: string, before: string | null): Promise<FeedItem[]> {
  const rows = unwrap(
    await supabase.rpc('get_friends_feed', { p_user_id: me, p_before: before, p_limit: FEED_PAGE }),
  ) as FeedItem[];
  return rows.map((r) => ({ ...r, category: normalizeCategory(r.category) ?? 'experience' }));
}
