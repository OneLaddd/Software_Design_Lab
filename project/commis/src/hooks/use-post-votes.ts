import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { requireAccount } from '@/lib/require-auth';

export type PostVote = { score: number; userVote: -1 | 0 | 1 };

export function usePostVotes(postIds: string[]) {
  const router = useRouter();
  const key = useMemo(() => [...new Set(postIds)].sort().join(','), [postIds]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, PostVote>>({});

  const refresh = useCallback(async () => {
    const ids = key ? key.split(',') : [];
    const { data: { user } } = await supabase.auth.getUser();
    setViewerId(user?.id ?? null);
    if (!ids.length) { setVotes({}); return; }
    const { data, error } = await supabase.from('votes').select('post_id,user_id,value').in('post_id', ids);
    if (error) { console.warn('Could not load post votes:', error); return; }
    const next: Record<string, PostVote> = {};
    for (const id of ids) next[id] = { score: 0, userVote: 0 };
    for (const row of data ?? []) {
      const current = next[row.post_id] ?? { score: 0, userVote: 0 };
      next[row.post_id] = { score: current.score + row.value, userVote: row.user_id === user?.id ? row.value : current.userVote };
    }
    setVotes(next);
  }, [key]);

  useEffect(() => { void refresh(); }, [refresh]);

  const vote = useCallback(async (postId: string, value: -1 | 1) => {
    let actingUserId = viewerId;
    if (!actingUserId) {
      const allowed = await requireAccount(router, 'upvote or downvote posts');
      if (!allowed) return { error: 'Sign in to vote.' };
      const { data: { user } } = await supabase.auth.getUser();
      actingUserId = user?.id ?? null;
      if (!actingUserId) return { error: 'Sign in to vote.' };
      setViewerId(actingUserId);
    }
    const previous = votes[postId] ?? { score: 0, userVote: 0 };
    const userVote: -1 | 0 | 1 = previous.userVote === value ? 0 : value;
    const score = previous.score - previous.userVote + userVote;
    setVotes((current) => ({ ...current, [postId]: { score, userVote } }));
    const result = userVote === 0
      ? await supabase.from('votes').delete().eq('post_id', postId).eq('user_id', actingUserId)
      : await supabase.from('votes').upsert({ post_id: postId, user_id: actingUserId, value: userVote }, { onConflict: 'post_id,user_id' });
    if (result.error) { setVotes((current) => ({ ...current, [postId]: previous })); return { error: result.error.message }; }
    return { error: null };
  }, [router, viewerId, votes]);

  return { votes, viewerId, vote, refresh };
}
