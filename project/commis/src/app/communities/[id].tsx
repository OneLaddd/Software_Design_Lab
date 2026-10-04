import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CalendarDays, Check, MessagesSquare, UsersRound } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { PostCard, type PostWithRelations } from '@/components/post-card';
import { usePostVotes } from '@/hooks/use-post-votes';
import { supabase } from '@/lib/supabase';
import { requireAccount } from '@/lib/require-auth';
import { MarkdownText } from '@/components/markdown-text';

type Community = { id: string; slug: string; name: string; description: string | null; icon_url: string | null; banner_url: string | null; created_at: string | null };

function createdLabel(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function CommunityDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [isMember, setIsMember] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [sort, setSort] = useState<'Popular' | 'New' | 'Top'>('Popular');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: communityData, error: communityError }, { data: { user } }] = await Promise.all([
      supabase.from('communities').select('id,slug,name,description,icon_url,banner_url,created_at').eq('id', id).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    setViewerId(user?.id ?? null);
    if (communityError || !communityData) {
      console.warn('Could not load community:', communityError);
      setCommunity(null);
      setLoading(false);
      return;
    }
    setCommunity(communityData as Community);

    const [postsResult, membersResult, membershipResult, postsCountResult] = await Promise.all([
      supabase.from('posts').select('id,author_id,community_id,title,body,media_url,created_at,view_count').eq('community_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('community_members').select('community_id', { count: 'exact', head: true }).eq('community_id', id),
      user ? supabase.from('community_members').select('community_id').eq('community_id', id).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('posts').select('*', { count: 'exact', head: true }).eq('community_id', id),
    ]);
    setMemberCount(membersResult.count ?? 0);
    setPostCount(postsCountResult.count ?? 0);
    setIsMember(Boolean(membershipResult.data));

    const rows = postsResult.data ?? [];
    const authorIds = [...new Set(rows.map((row) => row.author_id))];
    const postIds = rows.map((row) => row.id);
    const [authorsResult, commentsResult] = await Promise.all([
      authorIds.length ? supabase.from('profiles').select('id,username,avatar_url').in('id', authorIds) : Promise.resolve({ data: [] as any[] }),
      postIds.length ? supabase.from('comments').select('post_id').in('post_id', postIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const authorMap = new Map((authorsResult.data ?? []).map((author: any) => [author.id, author]));
    const commentCounts: Record<string, number> = {};
    for (const row of commentsResult.data ?? []) {
      const postId = (row as { post_id: string }).post_id;
      commentCounts[postId] = (commentCounts[postId] ?? 0) + 1;
    }
    setPosts(rows.map((row) => ({
      ...row,
      author: authorMap.get(row.author_id) ?? null,
      community: { id: communityData.id, name: communityData.name, icon_url: communityData.icon_url },
      commentCount: commentCounts[row.id] ?? 0,
    })) as PostWithRelations[]);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const { votes, vote } = usePostVotes(posts.map((post) => post.id));
  const visiblePosts = useMemo(() => [...posts].sort((a, b) => {
    if (sort === 'New') return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    return (votes[b.id]?.score ?? 0) - (votes[a.id]?.score ?? 0);
  }), [posts, sort, votes]);

  const toggleMembership = async () => {
    if (!viewerId) {
      await requireAccount(router, 'join or leave communities');
      return;
    }
    setBusy(true);
    const result = isMember
      ? await supabase.from('community_members').delete().eq('community_id', id).eq('user_id', viewerId)
      : await supabase.from('community_members').insert({ community_id: id, user_id: viewerId });
    if (result.error) {
      console.warn('Could not update community membership:', result.error);
    } else {
      setIsMember(!isMember);
      setMemberCount((count) => Math.max(0, count + (isMember ? -1 : 1)));
    }
    setBusy(false);
  };

  return <View style={styles.root}>
    <View style={[styles.navigation, { paddingTop: Math.max(insets.top, 10) }]}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
        <ArrowLeft size={25} color="#F1F1F1" strokeWidth={2.2} />
      </Pressable>
    </View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#FFE600" /></View> : !community ? <View style={styles.center}><Text style={styles.empty}>Community could not be loaded.</Text></View> : <FlatList
      data={visiblePosts}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <PostCard post={item} score={votes[item.id]?.score ?? 0} userVote={votes[item.id]?.userVote ?? 0} onVote={(value) => void vote(item.id, value)} showAuthor showJoinButton={false} />}
      ListHeaderComponent={<>
        <View style={styles.hero}>
          {community.banner_url ? <Image source={{ uri: community.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <LinearGradient colors={['#242424', '#1A1A1A', '#131313']} style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={['rgba(19,19,19,0.08)', 'rgba(19,19,19,0.25)', 'rgba(19,19,19,0.94)', '#131313']} locations={[0, 0.58, 0.9, 1]} style={StyleSheet.absoluteFill} />
          <View style={styles.heroTop}>
            {community.icon_url ? <Image source={{ uri: community.icon_url }} style={styles.communityAvatar} contentFit="cover" /> : <View style={styles.communityAvatarFallback}><Text style={styles.communityInitial}>{community.name.replace(/^c\//i, '').charAt(0).toUpperCase()}</Text></View>}
            <Pressable onPress={() => void toggleMembership()} disabled={busy} style={[styles.joinButton, isMember && styles.joinedButton]} accessibilityRole="button" accessibilityState={{ selected: isMember }}>
              {isMember ? <Check size={17} color="#A3A3A3" strokeWidth={2.8} /> : null}
              <Text style={[styles.joinText, isMember && styles.joinedText]}>{busy ? '…' : isMember ? 'Joined' : 'Join'}</Text>
            </Pressable>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.communityName}>{community.name}</Text>
            {community.description ? <MarkdownText style={styles.description} numberOfLines={3}>{community.description}</MarkdownText> : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}><View style={styles.statValue}><UsersRound size={16} color="#FFE600" /><Text style={styles.statNumber}>{memberCount.toLocaleString()}</Text></View><Text style={styles.statLabel}>Members</Text></View>
          <View style={styles.stat}><View style={styles.statValue}><MessagesSquare size={16} color="#FFE600" /><Text style={styles.statNumber}>{postCount.toLocaleString()}</Text></View><Text style={styles.statLabel}>Posts</Text></View>
          <View style={styles.stat}><View style={styles.statValue}><CalendarDays size={16} color="#FFE600" /><Text style={styles.statNumber}>{createdLabel(community.created_at)}</Text></View><Text style={styles.statLabel}>Created</Text></View>
        </View>

        <View style={styles.postsTab}><Text style={styles.postsTabText}>Posts</Text></View>
        <View style={styles.sortRow}>{(['Popular', 'New', 'Top'] as const).map((value) => <Pressable key={value} onPress={() => setSort(value)} style={[styles.sortButton, sort === value && styles.sortButtonActive]}><Text style={[styles.sortText, sort === value && styles.sortTextActive]}>{value}</Text></Pressable>)}</View>
      </>}
      ListEmptyComponent={<Text style={styles.empty}>No posts in this community yet.</Text>}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />}
    {community && !loading ? <Pressable onPress={() => router.push({ pathname: '/posts/create', params: { communityId: id } } as any)} style={[styles.fab, { bottom: 76 + Math.max(insets.bottom, 6) }]} accessibilityRole="button" accessibilityLabel="Create post in this community"><Text style={styles.fabText}>＋</Text></Pressable> : null}
    <BottomNavBar activeTab="ideas" />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  navigation: { height: 70, paddingHorizontal: 24, justifyContent: 'center', backgroundColor: '#131313' },
  backButton: { width: 42, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  hero: { height: 292, overflow: 'hidden', backgroundColor: '#181818' },
  heroTop: { position: 'absolute', top: 20, left: 22, right: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  communityAvatar: { width: 66, height: 66, borderRadius: 34, borderWidth: 1, borderColor: '#4B4B4B', backgroundColor: '#050505' },
  communityAvatarFallback: { width: 66, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 34, borderWidth: 1, borderColor: '#4B4B4B', backgroundColor: '#050505' },
  communityInitial: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 18 },
  joinButton: { minWidth: 88, height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 24, backgroundColor: '#FFFFFF' },
  joinedButton: { backgroundColor: '#343434', borderWidth: 1, borderColor: '#4A4A4A' },
  joinText: { color: '#151515', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  joinedText: { color: '#A3A3A3' },
  heroCopy: { position: 'absolute', left: 23, right: 23, bottom: 20 },
  communityName: { color: '#F4F4F4', fontFamily: 'LeagueSpartanBold', fontSize: 30, lineHeight: 36, marginBottom: 5 },
  description: { color: '#CECECE', fontFamily: 'Roboto', fontSize: 14, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  stat: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#343434', backgroundColor: '#201F1F' },
  statValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statNumber: { color: '#E8E8E8', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  statLabel: { color: '#B0B0B0', fontFamily: 'RobotoExtraBold', fontSize: 10, marginTop: 3 },
  postsTab: { marginHorizontal: 20, marginTop: 9, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#292929' },
  postsTabText: { color: '#FFE600', fontFamily: 'LeagueSpartanBold', fontSize: 16 },
  sortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 13, paddingBottom: 11 },
  sortButton: { minWidth: 75, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#202020' },
  sortButtonActive: { backgroundColor: '#FFE600' },
  sortText: { color: '#ABABAB', fontFamily: 'RobotoExtraBold', fontSize: 11 },
  sortTextActive: { color: '#171717' },
  listContent: { paddingBottom: 92 },
  empty: { color: '#929292', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center', padding: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE600', elevation: 6 },
  fabText: { color: '#111', fontSize: 31, lineHeight: 35 },
});
