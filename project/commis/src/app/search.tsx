import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Menu, Search } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { NavigationDrawer } from '@/components/navigation-drawer';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';
import { MarkdownText } from '@/components/markdown-text';

type SearchTab = 'all' | 'users' | 'posts' | 'communities' | 'bounties';
type ProfileResult = { id: string; username: string | null; avatar_url: string | null; active_role: string | null; bio: string | null };
type CommunityResult = { id: string; slug: string; name: string; description: string | null; icon_url: string | null };
type PostResult = { id: string; title: string | null; body: string | null; community_id: string | null; author_id: string; created_at: string | null };
type BountyResult = { id: string; title: string; description: string; budget_min: number | null; budget_max: number | null; currency: string | null; created_at: string | null; client_id: string };
type SearchResults = { users: ProfileResult[]; posts: PostResult[]; communities: CommunityResult[]; bounties: BountyResult[] };
const TABS: { id: SearchTab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'users', label: 'Users' }, { id: 'posts', label: 'Posts' },
  { id: 'communities', label: 'Communities' }, { id: 'bounties', label: 'Bounties' },
];
const EMPTY_RESULTS: SearchResults = { users: [], posts: [], communities: [], bounties: [] };

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; tab?: SearchTab }>();
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const [activeTab, setActiveTab] = useState<SearchTab>(params.tab && TABS.some((tab) => tab.id === params.tab) ? params.tab : 'all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuery(typeof params.q === 'string' ? params.q : '');
    if (params.tab && TABS.some((tab) => tab.id === params.tab)) setActiveTab(params.tab);
  }, [params.q, params.tab]);

  const searchBackend = useCallback(async (searchTerm: string, tab: SearchTab) => {
    setLoading(true);
    setError('');
    const term = searchTerm.trim();
    const pattern = `%${term.replace(/[%_,]/g, ' ')}%`;
    const run = async <T,>(table: string, select: string, columns: string[], orderColumn: string) => {
      let request: any = supabase.from(table).select(select).order(orderColumn, { ascending: false }).limit(30);
      if (term) request = request.or(columns.map((column) => `${column}.ilike.${pattern}`).join(','));
      const { data, error: resultError } = await request;
      if (resultError) throw resultError;
      return (data ?? []) as T[];
    };
    try {
      const selected = tab === 'all' ? ['users', 'posts', 'communities', 'bounties'] : [tab];
      const output: SearchResults = { ...EMPTY_RESULTS };
      const tasks = selected.map(async (kind) => {
        if (kind === 'users') output.users = await run<ProfileResult>('profiles', 'id, username, avatar_url, active_role, bio', ['username', 'bio'], 'created_at');
        if (kind === 'posts') output.posts = await run<PostResult>('posts', 'id, title, body, community_id, author_id, created_at', ['title', 'body'], 'created_at');
        if (kind === 'communities') output.communities = await run<CommunityResult>('communities', 'id, slug, name, description, icon_url', ['name', 'slug', 'description'], 'created_at');
        if (kind === 'bounties') {
          let request: any = supabase.from('service_requests').select('id, title, description, budget_min, budget_max, currency, created_at, client_id').eq('status', 'open').order('created_at', { ascending: false }).limit(30);
          if (term) {
            const [textMatches, categoryResult] = await Promise.all([
              request.or(`title.ilike.${pattern},description.ilike.${pattern}`),
              supabase.from('categories').select('id').ilike('name', pattern),
            ]);
            if (textMatches.error) throw textMatches.error;
            if (categoryResult.error) throw categoryResult.error;
            const categoryIds = (categoryResult.data ?? []).map((category: { id: string }) => category.id);
            let categoryMatches: BountyResult[] = [];
            if (categoryIds.length) {
              const { data: taggedRows, error: taggedError } = await supabase.from('request_categories').select('request_id').in('category_id', categoryIds);
              if (taggedError) throw taggedError;
              const requestIds = [...new Set((taggedRows ?? []).map((row: { request_id: string }) => row.request_id))];
              if (requestIds.length) {
                const { data, error: categoryRequestError } = await supabase.from('service_requests').select('id, title, description, budget_min, budget_max, currency, created_at, client_id').eq('status', 'open').in('id', requestIds).order('created_at', { ascending: false }).limit(30);
                if (categoryRequestError) throw categoryRequestError;
                categoryMatches = (data ?? []) as BountyResult[];
              }
            }
            const byId = new Map<string, BountyResult>();
            for (const item of [...((textMatches.data ?? []) as BountyResult[]), ...categoryMatches]) byId.set(item.id, item);
            output.bounties = [...byId.values()].slice(0, 30);
          } else {
            const { data, error: requestError } = await request;
            if (requestError) throw requestError;
            output.bounties = (data ?? []) as BountyResult[];
          }
        }
      });
      await Promise.all(tasks);
      setResults(output);
    } catch (searchError) {
      console.warn('Search failed:', searchError);
      setError('Search results could not load. Check your Supabase access and try again.');
      setResults(EMPTY_RESULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void searchBackend(query, activeTab); }, 250);
    return () => clearTimeout(timer);
  }, [query, activeTab, searchBackend]);

  const activeResultCount = activeTab === 'all'
    ? results.users.length + results.posts.length + results.communities.length + results.bounties.length
    : activeTab === 'users' ? results.users.length
      : activeTab === 'posts' ? results.posts.length
        : activeTab === 'communities' ? results.communities.length
          : results.bounties.length;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.brand}><Text style={styles.brandYellow}>commis</Text><Text style={styles.brandDot}>.</Text></View>
        <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open navigation menu"><Menu size={26} color="#FFFFFF" strokeWidth={2.2} /></Pressable>
      </View>
      <View style={styles.searchSection}><View style={styles.searchRow}><View style={styles.searchInputContainer}>
        <Search size={18} color="#D1D5DB" style={styles.searchBarIcon} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search Commis" placeholderTextColor="#8E8E93" style={styles.searchInput} autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel="Search Commis" />
        {query.length ? <Pressable onPress={() => setQuery('')} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Clear search"><Text style={styles.clearText}>×</Text></Pressable> : null}
      </View></View></View>
      <ScrollView horizontal style={styles.tabScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {TABS.map((tab) => <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tabChip, activeTab === tab.id && styles.tabChipActive]} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab.id }}><Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text></Pressable>)}
      </ScrollView>

      {loading ? <View style={styles.center}><ActivityIndicator color="#FFE600" /></View> : error ? <View style={styles.center}><Text style={styles.emptyText}>{error}</Text><Pressable onPress={() => void searchBackend(query, activeTab)} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View> : <FlatList
        key={activeTab}
        data={activeTab === 'all' ? [{ key: 'users' }, { key: 'communities' }, { key: 'posts' }, { key: 'bounties' }] : [{ key: activeTab }]}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.resultsContent}
        ListEmptyComponent={null}
        renderItem={({ item }) => <SearchSection kind={item.key as Exclude<SearchTab, 'all'>} results={results} query={query} router={router} preview={activeTab === 'all'} onSeeAll={() => setActiveTab(item.key as SearchTab)} />}
        ListFooterComponent={activeResultCount === 0 ? <EmptySearch query={query} /> : <View style={{ height: 14 }} />}
      />}
      <BottomNavBar activeTab="search" />
      <NavigationDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

function SearchSection({ kind, results, query, router, preview, onSeeAll }: { kind: Exclude<SearchTab, 'all'>; results: SearchResults; query: string; router: ReturnType<typeof useRouter>; preview: boolean; onSeeAll: () => void }) {
  const sectionTitle = TABS.find((tab) => tab.id === kind)?.label ?? kind;
  const sectionResults: (ProfileResult | PostResult | CommunityResult | BountyResult)[] = kind === 'users' ? results.users : kind === 'posts' ? results.posts : kind === 'communities' ? results.communities : results.bounties;
  if (!sectionResults.length) return null;
  const visibleResults = preview ? sectionResults.slice(0, 2) : sectionResults;
  return <View style={styles.section}>
    <View style={styles.sectionHeading}><View style={styles.sectionTitleRow}><View style={styles.sectionDot} /><Text style={styles.sectionTitle}>{sectionTitle}</Text></View>{preview ? <Pressable onPress={onSeeAll} accessibilityRole="button" style={styles.seeAll}><Text style={styles.seeAllText}>See All</Text><Text style={styles.seeAllArrow}>›</Text></Pressable> : query ? <Text style={styles.resultCount}>{sectionResults.length} results</Text> : null}</View>
    {kind === 'users' ? (visibleResults as ProfileResult[]).map((profile) => <Pressable key={profile.id} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: profile.id } } as any)} style={styles.resultCard} accessibilityRole="button"><ProfileAvatar avatarUrl={profile.avatar_url} size={42} /><View style={styles.resultCopy}><Text style={styles.resultTitle}>@{profile.username ?? 'member'}</Text><MarkdownText style={styles.resultDescription} numberOfLines={2}>{profile.bio || profile.active_role || 'Commis member'}</MarkdownText></View><Text style={styles.chevron}>›</Text></Pressable>) : null}
    {kind === 'communities' ? (visibleResults as CommunityResult[]).map((community) => <Pressable key={community.id} onPress={() => router.push({ pathname: '/communities/[id]', params: { id: community.id } } as any)} style={styles.resultCard} accessibilityRole="button"><View style={styles.communityAvatar}>{community.icon_url ? <Image source={{ uri: community.icon_url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View><View style={styles.resultCopy}><Text style={styles.resultTitle}>{community.name}</Text><MarkdownText style={styles.resultDescription} numberOfLines={2}>{community.description || 'Community details will appear here.'}</MarkdownText></View><Text style={styles.chevron}>›</Text></Pressable>) : null}
    {kind === 'posts' ? (visibleResults as PostResult[]).map((post) => <Pressable key={post.id} onPress={() => router.push({ pathname: '/posts/[id]', params: { id: post.id } } as any)} style={styles.postCard} accessibilityRole="button"><Text style={styles.resultTitle}>{post.title || 'Untitled post'}</Text><MarkdownText style={styles.resultDescription} numberOfLines={3}>{post.body || 'No post text.'}</MarkdownText><Text style={styles.postMeta}>{post.created_at ? new Date(post.created_at).toLocaleDateString() : ''}</Text></Pressable>) : null}
    {kind === 'bounties' ? (visibleResults as BountyResult[]).map((request) => <Pressable key={request.id} onPress={() => router.push({ pathname: '/service-request/[id]', params: { id: request.id } } as any)} style={styles.postCard} accessibilityRole="button"><Text style={styles.resultTitle}>{request.title}</Text><MarkdownText style={styles.resultDescription} numberOfLines={2}>{request.description}</MarkdownText><View style={styles.bountyFooter}><Text style={styles.budget}>{formatBudget(request)}</Text><Text style={styles.postMeta}>{request.created_at ? new Date(request.created_at).toLocaleDateString() : ''}</Text></View></Pressable>) : null}
  </View>;
}

function EmptySearch({ query }: { query: string }) {
  return <View style={styles.emptySearch}><Text style={styles.emptyTitle}>No results found</Text><Text style={styles.emptyText}>{query.trim() ? `Nothing matched “${query.trim()}”. Try another search.` : 'There is no content to show yet.'}</Text></View>;
}

function formatBudget(item: BountyResult): string {
  const currency = item.currency || 'PHP';
  if (item.budget_min != null && item.budget_max != null) return `${currency === 'PHP' ? '₱' : `${currency} `}${Number(item.budget_min).toLocaleString()} – ${Number(item.budget_max).toLocaleString()}`;
  if (item.budget_min != null) return `From ${currency === 'PHP' ? '₱' : `${currency} `}${Number(item.budget_min).toLocaleString()}`;
  if (item.budget_max != null) return `Up to ${currency === 'PHP' ? '₱' : `${currency} `}${Number(item.budget_max).toLocaleString()}`;
  return 'Budget not set';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { paddingHorizontal: 20, paddingBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'baseline' },
  brandYellow: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 36 },
  brandDot: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 36 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchSection: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchInputContainer: { flex: 1, height: 48, backgroundColor: '#202020', borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  searchBarIcon: { width: 18, height: 18, marginRight: 10 },
  searchInput: { flex: 1, color: '#E5E2E1', fontSize: 14, paddingVertical: 0 },
  clearButton: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#353534' },
  clearText: { color: '#A6A6AB', fontSize: 19, lineHeight: 22 },
  tabScroll: { height: 52, flexGrow: 0, flexShrink: 0 },
  tabRow: { flexGrow: 1, alignItems: 'center', gap: 7, paddingHorizontal: 16 },
  tabChip: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 18, backgroundColor: '#232323' },
  tabChipActive: { backgroundColor: '#FFE600' },
  tabLabel: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 11 },
  tabLabelActive: { color: '#201C00', fontFamily: 'RobotoExtraBold' },
  resultsContent: { paddingHorizontal: 16, paddingBottom: 12, flexGrow: 1 },
  section: { marginBottom: 16 },
  sectionHeading: { minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFE600' },
  sectionTitle: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  resultCount: { color: '#777777', fontFamily: 'Roboto', fontSize: 10 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 5, paddingLeft: 10 },
  seeAllText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  seeAllArrow: { color: '#FFE600', fontFamily: 'Roboto', fontSize: 15, lineHeight: 15 },
  resultCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, marginBottom: 7, borderRadius: 13, backgroundColor: '#1C1B1B' },
  communityAvatar: { width: 42, height: 42, borderRadius: 22, overflow: 'hidden', backgroundColor: '#050505' },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 14, lineHeight: 18 },
  resultDescription: { color: '#9B9B9B', fontFamily: 'Roboto', fontSize: 11, lineHeight: 16, marginTop: 3 },
  chevron: { color: '#FFE600', fontSize: 22, paddingLeft: 4 },
  postCard: { padding: 13, marginBottom: 7, borderRadius: 13, backgroundColor: '#1C1B1B', gap: 5 },
  postMeta: { color: '#777777', fontFamily: 'Roboto', fontSize: 9 },
  bountyFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  budget: { color: '#FFE600', fontFamily: 'LeagueSpartanBold', fontSize: 14 },
  emptySearch: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyTitle: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 15, textAlign: 'center' },
  emptyText: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center', marginTop: 7, lineHeight: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  retry: { paddingHorizontal: 17, paddingVertical: 9, marginTop: 12, borderRadius: 18, backgroundColor: '#2A2A2A' },
  retryText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 11 },
});
