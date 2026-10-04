import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Menu, Search } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { NavigationDrawer } from '@/components/navigation-drawer';
import { supabase } from '@/lib/supabase';
import { requireAccount } from '@/lib/require-auth';
import { MarkdownText } from '@/components/markdown-text';

type Category = { id: string; slug: string; name: string; icon_url: string | null };
type Community = { id: string; slug: string; name: string; description: string | null; icon_url: string | null };

const categoryIcons: Record<string, any> = {
  'graphic-design': require('@/assets/svgs/03_graphic_design.svg'),
  illustration: require('@/assets/svgs/04_illustration.svg'),
  'logo-design': require('@/assets/svgs/05_logo_design.svg'),
  'ui-ux-design': require('@/assets/svgs/06_ui_ux_design.svg'),
  '3d-animation': require('@/assets/svgs/07_3d_animation.svg'),
  photography: require('@/assets/svgs/08_photography.svg'),
  'video-editing': require('@/assets/svgs/09_video_editing.svg'),
  'web-development': require('@/assets/svgs/10_web_development.svg'),
  'app-development': require('@/assets/svgs/11_app_development.svg'),
  'game-development': require('@/assets/svgs/12_game_development.svg'),
  'data-entry-analysis': require('@/assets/svgs/13_data_analysis.svg'),
  'writing-editing': require('@/assets/svgs/14_writing_editing.svg'),
  translation: require('@/assets/svgs/15_translation.svg'),
  'voice-over': require('@/assets/svgs/16_voice_over.svg'),
  'music-composition': require('@/assets/svgs/17_music_composition.svg'),
  tutoring: require('@/assets/svgs/18_tutoring.svg'),
  'research-assistance': require('@/assets/svgs/19_research_assistance.svg'),
  'thesis-formatting': require('@/assets/svgs/20_thesis_format.svg'),
  'virtual-assistance': require('@/assets/svgs/21_virtual_assistance.svg'),
  'social-media-management': require('@/assets/svgs/22_social_media.svg'),
  'presentation-design': require('@/assets/svgs/23_presentation_design.svg'),
};

const categoryLabels: Record<string, string> = {
  'graphic-design': 'Graphic Design',
  illustration: 'Illustration',
  'logo-design': 'Logo Design',
  'ui-ux-design': 'UI/UX Design',
  '3d-animation': '3D & Animation',
  photography: 'Photography',
  'video-editing': 'Video Editing',
  'web-development': 'Web Dev',
  'app-development': 'App Dev',
  'game-development': 'Game Dev',
  'data-entry-analysis': 'Data Analysis',
  'writing-editing': 'Writing & Edit',
  translation: 'Translation',
  'voice-over': 'Voice Over',
  'music-composition': 'Music Comp.',
  tutoring: 'Tutoring',
  'research-assistance': 'Research Assist',
  'thesis-formatting': 'Thesis Format',
  'virtual-assistance': 'Virtual Assist',
  'social-media-management': 'Social Media',
  'presentation-design': 'Presentations',
};

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string; q?: string }>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'categories' | 'communities'>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const [{ data: categoryRows, error: categoryError }, { data: communityRows, error: communityError }, { data: auth }] = await Promise.all([
      supabase.from('categories').select('id, slug, name, icon_url').order('name'),
      supabase.from('communities').select('id, slug, name, description, icon_url').order('name'),
      supabase.auth.getUser(),
    ]);
    if (categoryError || communityError) {
      console.warn('Failed to load Explore data:', categoryError ?? communityError);
      setLoadError('Explore could not load. Check your Supabase access and try again.');
    }
    setCategories((categoryRows ?? []) as Category[]);
    setCommunities((communityRows ?? []) as Community[]);
    const currentUserId = auth?.user?.id ?? null;
    setUserId(currentUserId);
    if (currentUserId) {
      const { data, error } = await supabase.from('community_members').select('community_id').eq('user_id', currentUserId);
      if (error) console.warn('Failed to load community memberships:', error);
      setJoinedIds(new Set((data ?? []).map((row: { community_id: string }) => row.community_id)));
    } else {
      setJoinedIds(new Set());
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));
  useEffect(() => {
    if (params.tab === 'communities') setActiveTab('communities');
  }, [params.tab]);
  useEffect(() => {
    setSearch(typeof params.q === 'string' ? params.q : '');
  }, [params.q]);

  const filteredCategories = categories.filter((item) => categoryIcons[item.slug] && `${item.name} ${item.slug} ${categoryLabels[item.slug]}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filteredCommunities = communities.filter((item) => `${item.name} ${item.slug} ${item.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  const toggleMembership = async (community: Community) => {
    if (!userId) {
      await requireAccount(router, 'join or leave communities');
      return;
    }
    if (busyId) return;
    setBusyId(community.id);
    const isJoined = joinedIds.has(community.id);
    const result = isJoined
      ? await supabase.from('community_members').delete().eq('community_id', community.id).eq('user_id', userId)
      : await supabase.from('community_members').insert({ community_id: community.id, user_id: userId });
    if (result.error) {
      console.warn('Failed to update community membership:', result.error);
      Alert.alert('Could not update membership', result.error.message);
    } else {
      setJoinedIds((current) => {
        const next = new Set(current);
        if (isJoined) next.delete(community.id); else next.add(community.id);
        return next;
      });
    }
    setBusyId('');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.brand}><Text style={styles.brandYellow}>commis</Text><Text style={styles.brandDot}>.</Text></View>
        <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open navigation menu">
          <Menu size={26} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.searchSection}><View style={styles.searchRow}><Pressable style={styles.searchInputContainer} onPress={() => router.push({ pathname: '/search', params: { q: search } } as any)} accessibilityRole="button" accessibilityLabel="Search Commis">
        <Search size={18} color="#D1D5DB" style={styles.searchBarIcon} />
        <TextInput value={search} placeholder="Search Commis" placeholderTextColor="#8E8E93" style={styles.searchInput} editable={false} pointerEvents="none" />
      </Pressable></View></View>

      <View style={styles.tabs}>
        {(['categories', 'communities'] as const).map((tab) => <Pressable key={tab} onPress={() => setActiveTab(tab)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab }}><Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab === 'categories' ? 'Categories' : 'Communities'}</Text>{activeTab === tab ? <View style={styles.tabUnderline} /> : null}</Pressable>)}
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color="#FFE600" /></View> : loadError ? <View style={styles.center}><Text style={styles.errorText}>{loadError}</Text><Pressable onPress={() => void loadData()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View> : activeTab === 'categories' ? (
        <FlatList
          key="categories"
          data={filteredCategories}
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.categoryList}
          columnWrapperStyle={styles.categoryRow}
          ListHeaderComponent={<Text style={styles.sectionEyebrow}>Browse All Categories ({filteredCategories.length})</Text>}
          ListEmptyComponent={<EmptyState message={search ? 'No categories match your search.' : 'No categories are available yet.'} />}
          renderItem={({ item }) => <Pressable style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]} onPress={() => router.push({ pathname: '/marketplace', params: { category: item.slug } } as any)} accessibilityRole="button" accessibilityLabel={`Browse ${item.name} requests`}>
            <View style={styles.categoryIconBox}><Image source={categoryIcons[item.slug]} style={styles.categoryIcon} contentFit="contain" /></View>
            <Text style={styles.categoryName} numberOfLines={2}>{categoryLabels[item.slug]}</Text>
          </Pressable>}
        />
      ) : (
        <FlatList
          key="communities"
          data={filteredCommunities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.communityList}
          ListHeaderComponent={<View style={styles.communityHeading}><View><Text style={styles.sectionEyebrow}>Discover Communities</Text><Text style={styles.communitySubheading}>Connect, share work & collaborate</Text></View><Text style={styles.communityCount}>{filteredCommunities.length} communities</Text></View>}
          ListEmptyComponent={<EmptyState message={search ? 'No communities match your search.' : 'No communities are available yet.'} />}
          renderItem={({ item }) => {
            const joined = joinedIds.has(item.id);
            return <View style={styles.communityCard}>
              <Pressable onPress={() => router.push({ pathname: '/communities/[id]', params: { id: item.id } } as any)} style={styles.communityInfo} accessibilityRole="button" accessibilityLabel={`Open ${item.name}`}>
                {item.icon_url ? <Image source={{ uri: item.icon_url }} style={styles.communityAvatar} contentFit="cover" /> : <View style={styles.communityAvatar} />}
                <View style={styles.communityCopy}><Text style={styles.communityName} numberOfLines={1}>{item.name}</Text><MarkdownText style={styles.communityDescription} numberOfLines={2}>{item.description || 'Community details will appear here.'}</MarkdownText></View>
              </Pressable>
              <Pressable onPress={() => void toggleMembership(item)} style={[styles.joinButton, joined && styles.joinedButton]} accessibilityRole="button" accessibilityLabel={`${joined ? 'Leave' : 'Join'} ${item.name}`} accessibilityState={{ selected: joined }} disabled={busyId === item.id}>
                {busyId === item.id ? <ActivityIndicator size="small" color={joined ? '#929292' : '#FFFFFF'} /> : joined ? <Text style={styles.joinedMark}>＋</Text> : <Image source={require('@/assets/svgs/39_add_button.svg')} style={styles.addIcon} contentFit="contain" />}
              </Pressable>
            </View>;
          }}
        />
      )}

      <BottomNavBar activeTab="search" />
      <NavigationDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return <View style={styles.empty}><Text style={styles.emptyTitle}>Nothing to see here yet</Text><Text style={styles.emptyCopy}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'baseline' },
  brandYellow: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  brandDot: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchSection: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchInputContainer: { flex: 1, height: 48, backgroundColor: '#202020', borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  searchBarIcon: { width: 18, height: 18, marginRight: 10 },
  searchInput: { flex: 1, color: '#E5E2E1', fontSize: 14, paddingVertical: 0 },
  tabs: { height: 43, paddingHorizontal: 20, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#292929' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: '#777777', fontFamily: 'Roboto', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold' },
  tabUnderline: { position: 'absolute', height: 2, left: 0, right: 0, bottom: -1, borderRadius: 2, backgroundColor: '#FFE600' },
  categoryList: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 18, flexGrow: 1 },
  categoryRow: { gap: 10, marginBottom: 10 },
  sectionEyebrow: { color: '#8E8E93', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 2, marginBottom: 13 },
  categoryCard: { flex: 1, minHeight: 106, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 5, borderRadius: 15, borderWidth: 1, borderColor: '#292929', backgroundColor: '#1C1B1B' },
  categoryIconBox: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: '#303030', backgroundColor: '#232221' },
  categoryIcon: { width: 24, height: 24 },
  fallbackIcon: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 20 },
  categoryName: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 10, lineHeight: 13, textAlign: 'center' },
  communityList: { paddingHorizontal: 16, paddingTop: 17, paddingBottom: 16, flexGrow: 1 },
  communityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3, marginBottom: 12 },
  communitySubheading: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 11, marginTop: 4 },
  communityCount: { color: '#FFE600', fontFamily: 'Roboto', fontSize: 10 },
  communityCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 11, marginBottom: 8, borderRadius: 15, borderWidth: 1, borderColor: '#292929', backgroundColor: '#1C1B1B' },
  communityInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11, paddingRight: 8 },
  communityAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#050505' },
  communityCopy: { flex: 1, minWidth: 0 },
  communityName: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  communityDescription: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 10, lineHeight: 14, marginTop: 4 },
  joinButton: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#686868', backgroundColor: '#252525' },
  joinedButton: { borderColor: '#505050', backgroundColor: '#303030' },
  addIcon: { width: 20, height: 20 },
  joinedMark: { color: '#929292', fontFamily: 'Roboto', fontSize: 23, lineHeight: 25, marginTop: -2 },
  empty: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 15 },
  emptyCopy: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center', marginTop: 7, lineHeight: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#C8C6C8', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center' },
  retry: { marginTop: 13, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18, backgroundColor: '#2A2A2A' },
  retryText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 11 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
