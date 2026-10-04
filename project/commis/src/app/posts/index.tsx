import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Menu, Search } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { NavigationDrawer } from '@/components/navigation-drawer';
import { PostCard, type PostWithRelations } from '@/components/post-card';
import { usePostVotes } from '@/hooks/use-post-votes';
import { supabase } from '@/lib/supabase';

export default function PostsFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [drawer, setDrawer] = useState(false);
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: { user } }] = await Promise.all([
      supabase.from('posts').select('id,author_id,community_id,title,body,media_url,created_at,view_count').order('created_at', { ascending: false }).limit(100),
      supabase.auth.getUser(),
    ]);
    setViewerId(user?.id ?? null);
    if (error) {
      console.warn('Could not load posts:', error);
      setPosts([]);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    const communityIds = [...new Set(rows.flatMap((row) => row.community_id ? [row.community_id] : []))];
    const postIds = rows.map((row) => row.id);
    const [communityResult, commentResult, membershipsResult] = await Promise.all([
      communityIds.length ? supabase.from('communities').select('id,name,icon_url').in('id', communityIds) : Promise.resolve({ data: [] as any[] }),
      postIds.length ? supabase.from('comments').select('post_id').in('post_id', postIds) : Promise.resolve({ data: [] as any[] }),
      user && communityIds.length ? supabase.from('community_members').select('community_id').eq('user_id', user.id).in('community_id', communityIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const communityMap = new Map((communityResult.data ?? []).map((item: any) => [item.id, item]));
    const commentCounts: Record<string, number> = {};
    for (const comment of commentResult.data ?? []) {
      const postId = (comment as { post_id: string }).post_id;
      commentCounts[postId] = (commentCounts[postId] ?? 0) + 1;
    }
    setJoinedIds(new Set((membershipsResult.data ?? []).map((row: any) => row.community_id)));
    setPosts(rows.map((row) => ({
      ...row,
      community: row.community_id ? communityMap.get(row.community_id) ?? null : null,
      commentCount: commentCounts[row.id] ?? 0,
    })) as PostWithRelations[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const { votes, vote } = usePostVotes(posts.map((post) => post.id));

  const toggleJoin = useCallback(async (communityId: string) => {
    if (!viewerId) return;
    const wasJoined = joinedIds.has(communityId);
    setJoinedIds((current) => {
      const next = new Set(current);
      if (wasJoined) next.delete(communityId); else next.add(communityId);
      return next;
    });
    const result = wasJoined
      ? await supabase.from('community_members').delete().eq('community_id', communityId).eq('user_id', viewerId)
      : await supabase.from('community_members').insert({ community_id: communityId, user_id: viewerId });
    if (result.error) {
      console.warn('Could not update community membership:', result.error);
      setJoinedIds((current) => {
        const next = new Set(current);
        if (wasJoined) next.add(communityId); else next.delete(communityId);
        return next;
      });
    }
  }, [joinedIds, viewerId]);

  return <View style={styles.root}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.brand}><Text style={styles.brandYellow}>commis</Text><Text style={styles.brandWhite}>.</Text></View>
      <Pressable onPress={() => setDrawer(true)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open navigation menu">
        <Menu size={26} color="#FFFFFF" strokeWidth={2.2} />
      </Pressable>
    </View>
    <View style={styles.searchSection}><View style={styles.searchRow}><Pressable style={styles.searchInputContainer} onPress={() => router.push('/search' as any)} accessibilityRole="button" accessibilityLabel="Search Commis">
      <Search size={18} color="#D1D5DB" style={styles.searchBarIcon} />
      <TextInput placeholder="Search Commis" placeholderTextColor="#8E8E93" style={styles.searchInput} editable={false} pointerEvents="none" />
    </Pressable></View></View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#FFE600" /></View> : <FlatList
      data={posts}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <PostCard
        post={item}
        score={votes[item.id]?.score ?? 0}
        userVote={votes[item.id]?.userVote ?? 0}
        onVote={(value) => void vote(item.id, value)}
        joined={item.community_id ? joinedIds.has(item.community_id) : false}
        onToggleJoin={item.community_id ? () => void toggleJoin(item.community_id!) : undefined}
      />}
      contentContainerStyle={posts.length ? styles.list : styles.emptyList}
      showsVerticalScrollIndicator={false}
      onRefresh={() => void load()}
      refreshing={loading}
      ListEmptyComponent={<Text style={styles.empty}>No posts to show yet.</Text>}
    />}
    <BottomNavBar activeTab="ideas" />
    <NavigationDrawer visible={drawer} onClose={() => setDrawer(false)} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 },
  brand: { flexDirection: 'row', alignItems: 'baseline' },
  brandYellow: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  brandWhite: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchSection: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchInputContainer: { flex: 1, height: 48, backgroundColor: '#202020', borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  searchBarIcon: { width: 18, height: 18, marginRight: 10 },
  searchInput: { flex: 1, color: '#E5E2E1', fontSize: 14, paddingVertical: 0 },
  list: { paddingTop: 3, paddingBottom: 20 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#929292', fontFamily: 'Roboto', fontSize: 12, padding: 25, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
