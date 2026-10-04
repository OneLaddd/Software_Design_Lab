import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowUp, Image as ImageIcon, Menu, MessageCircle, Search, Target } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { NavigationDrawer } from '@/components/navigation-drawer';
import { supabase } from '@/lib/supabase';

type Category = { id: string; slug: string; name: string };
type RequestRow = { id: string; title: string; budget_min: number | null; budget_max: number | null; currency: string | null; created_at: string; categories: string[] };
type RisingPost = { id: string; title: string | null; media_url: string | null; view_count: number | null; score: number; commentCount: number };

const formatPeso = (value: number | null) => value == null ? null : `₱${value.toLocaleString()}`;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [risingPosts, setRisingPosts] = useState<RisingPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [requestResult, categoryResult, categoryUsageResult, postResult] = await Promise.all([
      supabase.from('service_requests').select('id,title,budget_min,budget_max,currency,created_at').eq('status', 'open').order('created_at', { ascending: false }).limit(5),
      supabase.from('categories').select('id,slug,name'),
      supabase.from('request_categories').select('category_id'),
      supabase.from('posts').select('id,title,media_url,view_count,created_at').order('created_at', { ascending: false }).limit(50),
    ]);
    if (requestResult.error) console.warn('Could not load home service requests:', requestResult.error);
    if (categoryResult.error) console.warn('Could not load home categories:', categoryResult.error);
    if (categoryUsageResult.error) console.warn('Could not load category popularity:', categoryUsageResult.error);
    if (postResult.error) console.warn('Could not load rising posts:', postResult.error);

    const requestRows = requestResult.data ?? [];
    const requestIds = requestRows.map((row) => row.id);
    const [{ data: requestCategoryRows }, { data: postVoteRows }, { data: commentRows }] = await Promise.all([
      requestIds.length ? supabase.from('request_categories').select('request_id,categories(name)').in('request_id', requestIds) : Promise.resolve({ data: [] as any[] }),
      postResult.data?.length ? supabase.from('votes').select('post_id,value').in('post_id', postResult.data.map((row) => row.id)) : Promise.resolve({ data: [] as any[] }),
      postResult.data?.length ? supabase.from('comments').select('post_id').in('post_id', postResult.data.map((row) => row.id)) : Promise.resolve({ data: [] as any[] }),
    ]);

    const requestCategoryMap: Record<string, string[]> = {};
    for (const row of requestCategoryRows ?? []) {
      const name = (row as any).categories?.name;
      if (name) requestCategoryMap[row.request_id] = [...(requestCategoryMap[row.request_id] ?? []), name];
    }
    setRequests(requestRows.map((row) => ({ ...row, categories: requestCategoryMap[row.id] ?? [] })) as RequestRow[]);

    const usage: Record<string, number> = {};
    for (const row of categoryUsageResult.data ?? []) usage[row.category_id] = (usage[row.category_id] ?? 0) + 1;
    const orderedCategories = [...(categoryResult.data ?? [])].sort((a, b) =>
      (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.name.localeCompare(b.name),
    ).slice(0, 10) as Category[];
    setCategories(orderedCategories);

    const upvotes: Record<string, number> = {};
    const commentCounts: Record<string, number> = {};
    for (const row of postVoteRows ?? []) if (row.value === 1) upvotes[row.post_id] = (upvotes[row.post_id] ?? 0) + 1;
    for (const row of commentRows ?? []) commentCounts[row.post_id] = (commentCounts[row.post_id] ?? 0) + 1;
    const createdAt = new Map((postResult.data ?? []).map((row) => [row.id, row.created_at]));
    setRisingPosts((postResult.data ?? []).map((row) => ({
      ...row,
      score: upvotes[row.id] ?? 0,
      commentCount: commentCounts[row.id] ?? 0,
    })).sort((a, b) => (b.score + b.commentCount) - (a.score + a.commentCount)
      || new Date(createdAt.get(b.id) ?? 0).getTime() - new Date(createdAt.get(a.id) ?? 0).getTime())
      .slice(0, 4));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const categoryColumns = useMemo(() => {
    const columns: Category[][] = [];
    for (let index = 0; index < categories.length; index += 2) columns.push(categories.slice(index, index + 2));
    return columns;
  }, [categories]);
  const openSearch = () => router.push({ pathname: '/search', params: { q: search } } as any);

  return <View style={styles.root}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.brand}><Text style={styles.brandYellow}>commis</Text><Text style={styles.brandWhite}>.</Text></View>
      <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open navigation menu"><Menu size={26} color="#FFFFFF" strokeWidth={2.2} /></Pressable>
    </View>
    <Pressable style={styles.searchBox} onPress={openSearch} accessibilityRole="button" accessibilityLabel="Search Commis">
      <Search size={18} color="#D1D5DB" style={styles.searchIcon} />
      <TextInput value={search} onChangeText={setSearch} onSubmitEditing={openSearch} placeholder="Search Commis" placeholderTextColor="#8E8E93" style={styles.searchInput} returnKeyType="search" />
    </Pressable>
    {loading ? <View style={styles.loading}><ActivityIndicator color="#FFE600" /></View> : <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <HomeSection title="Service Requests" onSeeAll={() => router.push('/marketplace' as any)}>
        {requests.length ? <FlatList
          horizontal
          data={requests}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          renderItem={({ item }) => <Pressable onPress={() => router.push({ pathname: '/service-request/[id]', params: { id: item.id } } as any)} style={styles.requestCard} accessibilityRole="button" accessibilityLabel={`Open service request ${item.title}`}>
            <View style={styles.budgetRow}><Target size={13} color="#FFE600" /><Text style={styles.budgetText} numberOfLines={1}>{item.budget_min != null && item.budget_max != null ? `${formatPeso(item.budget_min)} – ${formatPeso(item.budget_max)}` : item.budget_min != null ? `From ${formatPeso(item.budget_min)}` : item.budget_max != null ? `Up to ${formatPeso(item.budget_max)}` : 'Budget not set'}</Text></View>
            <Text style={styles.requestTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.requestCategories} numberOfLines={1}>{item.categories.join(' • ') || 'Open request'}</Text>
          </Pressable>}
          ListEmptyComponent={<Text style={styles.emptyHint}>No open service requests yet.</Text>}
        /> : <Text style={styles.emptyHint}>No open service requests yet.</Text>}
      </HomeSection>

      <HomeSection title="Popular Requests" onSeeAll={() => router.push('/explore' as any)}>
        {categories.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryCarousel}>
          {categoryColumns.map((column, index) => <View key={index} style={styles.categoryColumn}>{column.map((category) => <Pressable key={category.id} onPress={() => router.push({ pathname: '/marketplace', params: { category: category.slug } } as any)} style={styles.categoryCard} accessibilityRole="button" accessibilityLabel={`Browse ${category.name}`}><Text style={styles.categoryName} numberOfLines={2}>{category.name}</Text></Pressable>)}</View>)}
        </ScrollView> : <Text style={styles.emptyHint}>No categories available.</Text>}
      </HomeSection>

      <HomeSection title="Rising Posts" onSeeAll={() => router.push('/posts' as any)}>
        {risingPosts.length ? <FlatList
          horizontal
          data={risingPosts}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          renderItem={({ item }) => <Pressable onPress={() => router.push({ pathname: '/posts/[id]', params: { id: item.id } } as any)} style={styles.postCard} accessibilityRole="button" accessibilityLabel={`Open post ${item.title ?? ''}`}>
            <View style={styles.postImageFrame}>{item.media_url ? <Image source={{ uri: item.media_url }} style={styles.postImage} contentFit="cover" /> : <View style={styles.postPlaceholder}><ImageIcon size={20} color="#85858A" /></View>}</View>
            <Text style={styles.postTitle} numberOfLines={2}>{item.title ?? 'Untitled post'}</Text>
            <View style={styles.postStats}><View style={styles.stat}><ArrowUp size={13} color="#F2F2F2" fill="#F2F2F2" /><Text style={styles.statText}>{item.score.toLocaleString()}</Text></View><View style={styles.stat}><MessageCircle size={12} color="#88888E" fill="#88888E" /><Text style={styles.commentCount}>{formatCount(item.commentCount)}</Text></View></View>
          </Pressable>}
          ListEmptyComponent={<Text style={styles.emptyHint}>No posts to show yet.</Text>}
        /> : <Text style={styles.emptyHint}>No posts to show yet.</Text>}
      </HomeSection>
    </ScrollView>}
    <BottomNavBar activeTab="home" />
    <NavigationDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
  </View>;
}

function HomeSection({ title, onSeeAll, children }: { title: string; onSeeAll: () => void; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text><Pressable onPress={onSeeAll} accessibilityRole="button"><Text style={styles.seeAll}>See All</Text></Pressable></View>{children}</View>;
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return value.toLocaleString();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 },
  brand: { flexDirection: 'row', alignItems: 'baseline' },
  brandYellow: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  brandWhite: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchBox: { height: 48, flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 13, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#202020' },
  searchIcon: { width: 18, height: 18, marginRight: 10 },
  searchInput: { flex: 1, color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 14, paddingVertical: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 3, paddingBottom: 18, gap: 20 },
  section: { gap: 9 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 15, letterSpacing: -0.2 },
  seeAll: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  carousel: { paddingHorizontal: 16, gap: 10 },
  requestCard: { width: 200, height: 100, padding: 11, justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, borderColor: '#2E2D2C', backgroundColor: '#1C1B1B' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  budgetText: { flex: 1, color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  requestTitle: { color: '#F5F5F5', fontFamily: 'RobotoExtraBold', fontSize: 11, lineHeight: 15 },
  requestCategories: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 9 },
  categoryCarousel: { paddingHorizontal: 16, gap: 8 },
  categoryColumn: { gap: 7 },
  categoryCard: { width: 118, height: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 13, borderWidth: 1, borderColor: '#2E2D2C', backgroundColor: '#1C1B1B' },
  categoryName: { color: '#E9E9E9', fontFamily: 'RobotoExtraBold', fontSize: 10, textAlign: 'center', lineHeight: 14 },
  postCard: { width: 210, padding: 9, borderRadius: 14, borderWidth: 1, borderColor: '#2E2D2C', backgroundColor: '#1C1B1B' },
  postImageFrame: { width: '100%', aspectRatio: 1, padding: 0, overflow: 'hidden', borderRadius: 10, backgroundColor: '#050505' },
  postImage: { width: '100%', height: '100%', backgroundColor: '#050505' },
  postPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  postTitle: { minHeight: 39, color: '#F5F5F5', fontFamily: 'RobotoExtraBold', fontSize: 10, lineHeight: 15, marginTop: 7 },
  postStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 7, marginTop: 2, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { color: '#F2F2F2', fontFamily: 'RobotoExtraBold', fontSize: 9 },
  commentCount: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 9 },
  emptyHint: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 11, paddingHorizontal: 20, paddingVertical: 11 },
});
