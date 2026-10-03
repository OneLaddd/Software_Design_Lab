import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { NavigationDrawer } from '@/components/navigation-drawer';
import { ServiceRequestCard, type ServiceRequestCardData } from '@/components/service-request-card';
import { supabase } from '@/lib/supabase';

type BountyList = 'saved' | 'client' | 'hunter';

interface RequestWithClient extends ServiceRequestCardData {
  client_id: string;
  currency: string | null;
  status: string | null;
}

interface BidStats {
  count: number;
  average: number;
}

const LISTS: { key: BountyList; label: string }[] = [
  { key: 'saved', label: 'Saved' },
  { key: 'client', label: 'My Requests' },
  { key: 'hunter', label: 'My Bids' },
];

export default function MarkedBountiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeList, setActiveList] = useState<BountyList>('saved');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [requests, setRequests] = useState<RequestWithClient[]>([]);
  const [savedRequestIds, setSavedRequestIds] = useState<string[]>([]);
  const [clientRequestIds, setClientRequestIds] = useState<string[]>([]);
  const [bidRequestIds, setBidRequestIds] = useState<string[]>([]);
  const [bidStats, setBidStats] = useState<Record<string, BidStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  const loadMarkedRequests = useCallback(async (refresh = false) => {
    setIsLoading(true);
    if (refresh) setIsRefreshing(true);
    setLoadError('');

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setLoadError('Sign in to view your marked bounties.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const [savedResult, clientResult, bidResult] = await Promise.all([
      supabase.from('saved_requests').select('request_id').eq('user_id', user.id),
      supabase.from('service_requests').select('id').eq('client_id', user.id),
      supabase.from('bids').select('request_id').eq('hunter_id', user.id),
    ]);

    const sourceError = savedResult.error ?? clientResult.error ?? bidResult.error;
    if (sourceError) {
      console.warn('Failed to load user request lists:', sourceError);
      setLoadError('Could not load your saved and related requests. Check your connection and permissions.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const savedIds = [...new Set((savedResult.data ?? []).map((row) => row.request_id as string))];
    const clientIds = [...new Set((clientResult.data ?? []).map((row) => row.id as string))];
    const hunterIds = [...new Set((bidResult.data ?? []).map((row) => row.request_id as string))];
    setSavedRequestIds(savedIds);
    setClientRequestIds(clientIds);
    setBidRequestIds(hunterIds);

    const requestIds = [...new Set([...savedIds, ...clientIds, ...hunterIds])];
    if (!requestIds.length) {
      setRequests([]);
      setBidStats({});
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const { data: requestData, error: requestError } = await supabase
      .from('service_requests')
      .select(`
        id,
        client_id,
        title,
        description,
        budget_min,
        budget_max,
        currency,
        status,
        created_at,
        request_categories (
          category_id,
          categories (id, name, slug)
        )
      `)
      .in('id', requestIds)
      .order('created_at', { ascending: false });

    if (requestError) {
      console.warn('Failed to load marked requests:', requestError);
      setLoadError('Could not load request details. Please try again.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const loadedRequests = (requestData ?? []) as unknown as RequestWithClient[];
    const statsRows = await Promise.all(loadedRequests.map(async (request) => {
      const { data, error } = await supabase.rpc('get_request_bid_stats', { p_request_id: request.id });
      if (error) {
        console.warn('Failed to load marked request bid stats:', error);
        return [request.id, { count: 0, average: 0 }] as const;
      }
      const stats = (data as { bid_count: number; average_bid: number | null }[] | null)?.[0];
      return [request.id, {
        count: Number(stats?.bid_count ?? 0) || 0,
        average: stats?.average_bid == null ? 0 : Math.round(Number(stats.average_bid)),
      }] as const;
    }));

    setRequests(loadedRequests);
    setBidStats(Object.fromEntries(statsRows));
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMarkedRequests();
    }, [loadMarkedRequests])
  );

  const selectedIds = activeList === 'saved'
    ? savedRequestIds
    : activeList === 'client'
      ? clientRequestIds
      : bidRequestIds;
  const selectedRequests = useMemo(() => {
    const idSet = new Set(selectedIds);
    return requests.filter((request) => idSet.has(request.id));
  }, [requests, selectedIds]);

  const toggleSaved = async (requestId: string) => {
    const isSaved = savedRequestIds.includes(requestId);
    setSaveError('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSaveError('Sign in again to update your marked bounties.');
      return;
    }

    const result = isSaved
      ? await supabase.from('saved_requests').delete().eq('user_id', user.id).eq('request_id', requestId)
      : await supabase.from('saved_requests').insert({ user_id: user.id, request_id: requestId });

    if (result.error) {
      console.warn('Failed to update saved request:', result.error);
      setSaveError('Could not update the saved list. Please try again.');
      return;
    }

    setSavedRequestIds((current) => isSaved
      ? current.filter((id) => id !== requestId)
      : current.includes(requestId) ? current : [...current, requestId]);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Marked Bounties</Text>
        <Pressable onPress={() => setIsDrawerOpen(true)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open navigation menu">
          <Text style={styles.menuText}>☰</Text>
        </Pressable>
      </View>

      <View style={styles.segmentedControl}>
        {LISTS.map((list) => {
          const count = list.key === 'saved' ? savedRequestIds.length : list.key === 'client' ? clientRequestIds.length : bidRequestIds.length;
          const selected = activeList === list.key;
          return (
            <Pressable key={list.key} onPress={() => setActiveList(list.key)} style={[styles.segment, selected && styles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected }}>
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{list.label} ({count})</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.centerState}><ActivityIndicator color="#FFE600" /><Text style={styles.stateText}>Loading your bounties...</Text></View>
      ) : loadError ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable onPress={() => void loadMarkedRequests()} style={styles.retryButton}><Text style={styles.retryText}>Try Again</Text></Pressable>
        </View>
      ) : selectedRequests.length ? (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 8) + 18 }]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadMarkedRequests(true)} tintColor="#FFE600" colors={['#FFE600']} />}
          showsVerticalScrollIndicator={false}>
          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
          {selectedRequests.map((request) => {
            const stats = bidStats[request.id] ?? { count: 0, average: 0 };
            return (
              <ServiceRequestCard
                key={request.id}
                request={request}
                bidCount={stats.count}
                averageBid={stats.average}
                isSaved={savedRequestIds.includes(request.id)}
                onToggleSaved={() => void toggleSaved(request.id)}
                onPress={() => router.push(`/service-request/${request.id}` as any)}
              />
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Image source={require('@/assets/images/nothing-to-see-here-cat.png')} style={styles.emptyImage} contentFit="contain" />
          <Text style={styles.emptyTitle}>No Marked Bounties</Text>
          <Text style={styles.emptyBody}>{activeList === 'saved' ? 'Save Marketplace requests to easily find them later.' : activeList === 'client' ? 'Requests you post will appear here.' : 'Requests you bid on will appear here.'}</Text>
          <Pressable onPress={() => router.replace('/marketplace' as any)} style={styles.browseButton} accessibilityRole="button">
            <Text style={styles.browseButtonText}>Browse Marketplace</Text>
          </Pressable>
        </View>
      )}

      <BottomNavBar activeTab="market" />
      <NavigationDrawer visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  backButton: { width: 36, height: 40, justifyContent: 'center' },
  backText: { color: '#FFFFFF', fontSize: 31, lineHeight: 35 },
  headerTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 20 },
  menuButton: { width: 36, height: 40, alignItems: 'flex-end', justifyContent: 'center' },
  menuText: { color: '#FFFFFF', fontSize: 23 },
  segmentedControl: { minHeight: 52, flexDirection: 'row', gap: 5, marginHorizontal: 20, marginTop: 8, marginBottom: 9, padding: 5, borderRadius: 28, backgroundColor: '#1C1B1B' },
  segment: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: 23 },
  segmentActive: { backgroundColor: '#FFE600' },
  segmentText: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 11, textAlign: 'center' },
  segmentTextActive: { color: '#201C00' },
  list: { paddingHorizontal: 20, paddingBottom: 110 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  stateText: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 13 },
  errorText: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center' },
  retryButton: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 10, backgroundColor: '#FFE600' },
  retryText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 78 },
  emptyImage: { width: 170, height: 170 },
  emptyTitle: { marginTop: 5, color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 22, textAlign: 'center' },
  emptyBody: { maxWidth: 280, marginTop: 8, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  browseButton: { minHeight: 46, justifyContent: 'center', marginTop: 22, paddingHorizontal: 22, borderRadius: 12, backgroundColor: '#FFE600' },
  browseButtonText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 14 },
});