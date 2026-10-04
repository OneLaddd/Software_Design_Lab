import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostCard, type PostWithRelations } from '@/components/post-card';
import { usePostVotes } from '@/hooks/use-post-votes';
import { supabase } from '@/lib/supabase';

type LikedPost = PostWithRelations & { joined: boolean };

export default function LikedPostsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<LikedPost[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    setViewerId(user?.id ?? null);
    if (!user) {
      setPosts([]);
      setError('Sign in to see your liked posts.');
      setLoading(false);
      return;
    }
    const { data: likedRows, error: likedError } = await supabase.from('votes').select('post_id').eq('user_id', user.id).eq('value', 1);
    if (likedError) {
      console.warn('Could not load liked posts:', likedError);
      setError('Could not load your liked posts. Please try again.');
      setPosts([]);
      setLoading(false);
      return;
    }
    const ids = [...new Set((likedRows ?? []).map((row) => row.post_id as string))];
    if (!ids.length) {
      setPosts([]);
      setLoading(false);
      return;
    }
    const { data: rows, error: postsError } = await supabase.from('posts')
      .select('id,author_id,community_id,title,body,media_url,created_at,view_count')
      .in('id', ids).order('created_at', { ascending: false });
    if (postsError) {
      console.warn('Could not load liked post details:', postsError);
      setError('Could not load your liked posts. Please try again.');
      setPosts([]);
      setLoading(false);
      return;
    }
    const rowsList = rows ?? [];
    const communityIds = [...new Set(rowsList.flatMap((row) => row.community_id ? [row.community_id] : []))];
    const postIds = rowsList.map((row) => row.id);
    const [communityResult, authorResult, commentResult, membershipResult] = await Promise.all([
      communityIds.length ? supabase.from('communities').select('id,name,icon_url').in('id', communityIds) : Promise.resolve({ data: [] as any[] }),
      rowsList.length ? supabase.from('profiles').select('id,username,avatar_url').in('id', [...new Set(rowsList.map((row) => row.author_id))]) : Promise.resolve({ data: [] as any[] }),
      postIds.length ? supabase.from('comments').select('post_id').in('post_id', postIds) : Promise.resolve({ data: [] as any[] }),
      communityIds.length ? supabase.from('community_members').select('community_id').eq('user_id', user.id).in('community_id', communityIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const communities = new Map((communityResult.data ?? []).map((row: any) => [row.id, row]));
    const authors = new Map((authorResult.data ?? []).map((row: any) => [row.id, row]));
    const commentCounts: Record<string, number> = {};
    for (const row of commentResult.data ?? []) commentCounts[(row as { post_id: string }).post_id] = (commentCounts[(row as { post_id: string }).post_id] ?? 0) + 1;
    const joinedIds = new Set((membershipResult.data ?? []).map((row: any) => row.community_id));
    setPosts(rowsList.map((row) => ({
      ...row,
      author: authors.get(row.author_id) ?? null,
      community: row.community_id ? communities.get(row.community_id) ?? null : null,
      commentCount: commentCounts[row.id] ?? 0,
      joined: row.community_id ? joinedIds.has(row.community_id) : false,
    })) as LikedPost[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const { votes, vote } = usePostVotes(posts.map((post) => post.id));
  const toggleMembership = async (communityId: string) => {
    if (!viewerId) return;
    const wasJoined = posts.find((post) => post.community_id === communityId)?.joined ?? false;
    const result = wasJoined
      ? await supabase.from('community_members').delete().eq('community_id', communityId).eq('user_id', viewerId)
      : await supabase.from('community_members').insert({ community_id: communityId, user_id: viewerId });
    if (result.error) return;
    setPosts((current) => current.map((post) => post.community_id === communityId ? { ...post, joined: !wasJoined } : post));
  };
  const handleVote = async (postId: string, value: -1 | 1, currentVote: -1 | 0 | 1) => {
    const result = await vote(postId, value);
    if (!result?.error && (value === 1 || currentVote === 1)) setPosts((current) => current.filter((post) => post.id !== postId));
  };

  return <View style={styles.root}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft size={23} color="#E5E2E1" /></Pressable>
      <Text style={styles.title}>Liked Posts</Text>
      <View style={styles.backSpacer} />
    </View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#FFE600" /></View> : error ? <View style={styles.center}><Text style={styles.empty}>{error}</Text></View> : <FlatList
      data={posts}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <PostCard
        post={item}
        score={votes[item.id]?.score ?? 0}
        userVote={votes[item.id]?.userVote ?? 1}
        onVote={(value) => void handleVote(item.id, value, votes[item.id]?.userVote ?? 1)}
        joined={item.joined}
        onToggleJoin={item.community_id ? () => void toggleMembership(item.community_id!) : undefined}
      />}
      contentContainerStyle={posts.length ? styles.list : styles.emptyList}
      showsVerticalScrollIndicator={false}
      onRefresh={() => void load()}
      refreshing={loading}
      ListEmptyComponent={<Text style={styles.empty}>You haven’t liked any posts yet.</Text>}
    />}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: '#252525' },
  back: { width: 42, height: 42, justifyContent: 'center' },
  backSpacer: { width: 42 },
  title: { flex: 1, color: '#F2F2F2', fontFamily: 'LeagueSpartanBold', fontSize: 21, textAlign: 'center' },
  list: { paddingTop: 12, paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#929292', fontFamily: 'Roboto', fontSize: 12, padding: 25, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
