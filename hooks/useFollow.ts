import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type FollowStatus = 'not_following' | 'pending' | 'active';

export function useFollow(currentUserId: string | null, targetUserId: string | null) {
  const [status, setStatus] = useState<FollowStatus>('not_following');
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;
    const { data } = await supabase
      .from('follows')
      .select('status')
      .eq('follower_id', currentUserId)
      .eq('following_id', targetUserId)
      .maybeSingle();

    setStatus(data ? (data.status as FollowStatus) : 'not_following');
  }, [currentUserId, targetUserId]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const follow = useCallback(async (isPrivate: boolean) => {
    if (!currentUserId || !targetUserId) return;
    setLoading(true);
    const followStatus = isPrivate ? 'pending' : 'active';
    const { error } = await supabase.from('follows').insert({
      follower_id: currentUserId,
      following_id: targetUserId,
      status: followStatus,
    });
    if (!error) {
      setStatus(followStatus);
      // Fire push notification via SECURITY DEFINER RPC (uses pg_net server-side)
      if (!isPrivate) {
        const { error: rpcErr } = await supabase.rpc('notify_new_follow', {
          p_follower_id: currentUserId,
          p_following_id: targetUserId,
        });
        if (rpcErr) {
          /* optional — demo works without pg_net / notify function */
        }
      }
    }
    setLoading(false);
  }, [currentUserId, targetUserId]);

  const unfollow = useCallback(async () => {
    if (!currentUserId || !targetUserId) return;
    setLoading(true);
    await supabase
      .from('follows')
      .delete()
      .eq('follower_id', currentUserId)
      .eq('following_id', targetUserId);
    setStatus('not_following');
    setLoading(false);
  }, [currentUserId, targetUserId]);

  return { status, loading, follow, unfollow, refresh: checkStatus };
}
