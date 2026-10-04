import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowLeft, Menu, Search } from 'lucide-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { NavigationDrawer } from '@/components/navigation-drawer';
import { MarkdownText } from '@/components/markdown-text';
import { supabase } from '@/lib/supabase';

type Community = { id: string; slug: string; name: string; description: string | null; icon_url: string | null };

export default function JoinedCommunitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    if (!user) {
      setCommunities([]);
      setError('Sign in to see your communities.');
      setLoading(false);
      return;
    }
    const { data: memberships, error: membershipError } = await supabase.from('community_members').select('community_id').eq('user_id', user.id);
    if (membershipError) {
      console.warn('Could not load joined communities:', membershipError);
      setError('Could not load your communities. Please try again.');
      setCommunities([]);
      setLoading(false);
      return;
    }
    const ids = [...new Set((memberships ?? []).map((row) => row.community_id as string))];
    if (!ids.length) {
      setCommunities([]);
      setLoading(false);
      return;
    }
    const { data, error: communitiesError } = await supabase.from('communities').select('id,slug,name,description,icon_url').in('id', ids).order('name');
    if (communitiesError) {
      console.warn('Could not load joined community details:', communitiesError);
      setError('Could not load your communities. Please try again.');
      setCommunities([]);
    } else setCommunities((data ?? []) as Community[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const filtered = communities.filter((community) => `${community.name} ${community.slug} ${community.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  const leaveCommunity = async (community: Community) => {
    if (!userId || busyId) return;
    setBusyId(community.id);
    const { error: leaveError } = await supabase.from('community_members').delete().eq('community_id', community.id).eq('user_id', userId);
    if (leaveError) {
      Alert.alert('Could not leave community', leaveError.message);
    } else {
      setCommunities((current) => current.filter((item) => item.id !== community.id));
    }
    setBusyId('');
  };

  return <View style={styles.root}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft size={22} color="#FFFFFF" /></Pressable>
      <View style={styles.brand}><Text style={styles.brandYellow}>commis</Text><Text style={styles.brandDot}>.</Text></View>
      <Pressable onPress={() => setDrawerOpen(true)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open navigation menu"><Menu size={25} color="#FFFFFF" strokeWidth={2.2} /></Pressable>
    </View>
    <View style={styles.searchSection}><Pressable style={styles.searchBox} onPress={() => router.push({ pathname: '/search', params: { q: search } } as any)} accessibilityRole="button" accessibilityLabel="Search Commis"><Search size={18} color="#D1D5DB" style={{ marginRight: 10 }} /><TextInput value={search} onChangeText={setSearch} placeholder="Search communities" placeholderTextColor="#8E8E93" style={styles.searchInput} /></Pressable></View>
    <View style={styles.heading}><View><Text style={styles.eyebrow}>Your Communities</Text><Text style={styles.subheading}>Communities you’ve joined</Text></View><Text style={styles.count}>{filtered.length}</Text></View>
    {loading ? <View style={styles.center}><ActivityIndicator color="#FFE600" /></View> : error ? <View style={styles.center}><Text style={styles.empty}>{error}</Text><Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View> : <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={filtered.length ? styles.list : styles.emptyList}
      showsVerticalScrollIndicator={false}
      onRefresh={() => void load()}
      refreshing={loading}
      ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyTitle}>No joined communities</Text><Text style={styles.empty}>{search ? 'No joined communities match your search.' : 'Join a community from Explore and it will appear here.'}</Text><Pressable onPress={() => router.push({ pathname: '/explore', params: { tab: 'communities' } } as any)} style={styles.retry}><Text style={styles.retryText}>Explore communities</Text></Pressable></View>}
      renderItem={({ item }) => <View style={styles.card}>
        <Pressable onPress={() => router.push({ pathname: '/communities/[id]', params: { id: item.id } } as any)} style={styles.info} accessibilityRole="button" accessibilityLabel={`Open ${item.name}`}>
          {item.icon_url ? <Image source={{ uri: item.icon_url }} style={styles.avatar} contentFit="cover" /> : <View style={styles.avatarFallback}><Text style={styles.initial}>{item.name.replace(/^c\//i, '').charAt(0).toUpperCase()}</Text></View>}
          <View style={styles.copy}><Text style={styles.name} numberOfLines={1}>{item.name}</Text><MarkdownText style={styles.description} numberOfLines={2}>{item.description || 'Community details will appear here.'}</MarkdownText></View>
        </Pressable>
        <Pressable onPress={() => void leaveCommunity(item)} style={styles.joinedButton} accessibilityRole="button" accessibilityLabel={`Leave ${item.name}`} disabled={busyId === item.id}>
          {busyId === item.id ? <ActivityIndicator size="small" color="#929292" /> : <Text style={styles.plus}>＋</Text>}
        </Pressable>
      </View>}
    />}
    <BottomNavBar activeTab="search" />
    <NavigationDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { paddingHorizontal: 16, paddingBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'baseline' },
  brandYellow: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 34, lineHeight: 38 },
  brandDot: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 34, lineHeight: 38 },
  menuButton: { width: 40, height: 40, alignItems: 'flex-end', justifyContent: 'center' },
  searchSection: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14 },
  searchBox: { height: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#202020' },
  searchInput: { flex: 1, color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 13, paddingVertical: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 },
  eyebrow: { color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 19 },
  subheading: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 11, marginTop: 3 },
  count: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 18 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  card: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 11, marginBottom: 8, borderRadius: 15, borderWidth: 1, borderColor: '#292929', backgroundColor: '#1C1B1B' },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11, paddingRight: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#050505' },
  avatarFallback: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#050505', borderWidth: 1, borderColor: '#343434' },
  initial: { color: '#C9C9C9', fontFamily: 'RobotoExtraBold', fontSize: 15 },
  copy: { flex: 1, minWidth: 0 },
  name: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  description: { color: '#8E8E93', fontFamily: 'Roboto', fontSize: 10, lineHeight: 14, marginTop: 4 },
  joinedButton: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#505050', backgroundColor: '#303030' },
  plus: { color: '#929292', fontFamily: 'Roboto', fontSize: 23, lineHeight: 25, marginTop: -2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyState: { alignItems: 'center', padding: 24 },
  emptyTitle: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  empty: { color: '#929292', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center', marginTop: 8 },
  retry: { marginTop: 13, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: '#292929' },
  retryText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 11 },
});
