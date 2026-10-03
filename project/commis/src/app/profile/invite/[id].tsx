import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServiceRequestCard, type ServiceRequestCardData } from '@/components/service-request-card';
import { supabase } from '@/lib/supabase';

type RequestRow = ServiceRequestCardData & { client_id: string; currency: string | null; status: string | null };
type BidStats = { bid_count: number; average_bid: number | null };
const yellow = '#FFE600';

export default function InviteHunterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const hunterId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [stats, setStats] = useState<Record<string, { count: number; average: number }>>({});
  const [invited, setInvited] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(!refresh); setRefreshing(refresh); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !hunterId) { setError('Sign in to invite a Hunter to one of your requests.'); setLoading(false); setRefreshing(false); return; }
    const [requestResult, invitedResult] = await Promise.all([
      supabase.from('service_requests').select('id, client_id, title, description, budget_min, budget_max, created_at, request_categories(category_id, categories(id, name, slug))').eq('client_id', user.id).eq('status', 'open').order('created_at', { ascending: false }),
      supabase.rpc('get_my_bid_invitation_request_ids', { p_hunter_id: hunterId }),
    ]);
    if (requestResult.error) setError(requestResult.error.message);
    if (invitedResult.error) setError((previous) => previous ? `${previous} · ${invitedResult.error.message}` : invitedResult.error.message);
    const loaded = (requestResult.data ?? []) as unknown as RequestRow[];
    setRequests(loaded);
    setInvited((invitedResult.data ?? []) as string[]);
    const statRows = await Promise.all(loaded.map(async (request) => {
      const result = await supabase.rpc('get_request_bid_stats', { p_request_id: request.id });
      const data = (result.data as BidStats[] | null)?.[0];
      return [request.id, { count: Number(data?.bid_count ?? 0), average: data?.average_bid == null ? 0 : Number(data.average_bid) }] as const;
    }));
    setStats(Object.fromEntries(statRows));
    setLoading(false); setRefreshing(false);
  }, [hunterId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sendInvite = async (requestId: string) => {
    if (!hunterId) return;
    setSendingId(requestId); setActionError('');
    const { error: inviteError } = await supabase.rpc('invite_hunter_to_request', { p_request_id: requestId, p_hunter_id: hunterId });
    if (inviteError) {
      const message = inviteError.message.toLowerCase().includes('already invited') ? 'This Hunter has already been invited to that request.' : inviteError.message;
      setActionError(message);
    } else setInvited((current) => current.includes(requestId) ? current : [...current, requestId]);
    setSendingId(null);
  };

  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><View style={{ flex: 1 }}><Text style={styles.title}>Invite to Bid</Text><Text style={styles.subtitle}>Choose one of your open requests</Text></View></View>
    {loading ? <View style={styles.center}><ActivityIndicator color={yellow} /><Text style={styles.muted}>Loading your requests…</Text></View> : error ? <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Try Again</Text></Pressable></View> : requests.length ? <ScrollView contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={yellow} colors={[yellow]} />}>
      <Text style={styles.sectionTitle}>Your open requests</Text>{actionError ? <Text style={styles.error}>{actionError}</Text> : null}
      {requests.map((request) => { const bidStats = stats[request.id] ?? { count: 0, average: 0 }; const isInvited = invited.includes(request.id); return <View key={request.id} style={styles.cardWrap}><ServiceRequestCard request={request} bidCount={bidStats.count} averageBid={bidStats.average} onPress={() => router.push(`/service-request/${request.id}` as any)} actionLabel="Invite" disabledActionLabel={sendingId === request.id ? 'Sending…' : 'Invited'} actionDisabled={isInvited || sendingId === request.id} onAction={() => void sendInvite(request.id)} /></View>; })}
    </ScrollView> : <View style={styles.empty}><Image source={require('@/assets/images/nothing-to-see-here-cat.png')} style={styles.cat} contentFit="contain" /><Text style={styles.emptyTitle}>No open requests</Text><Text style={styles.muted}>Post a request first, then you can invite this Hunter to bid.</Text><Pressable onPress={() => router.push('/post-bounty' as any)} style={styles.create}><Text style={styles.createText}>Create a Request</Text></Pressable></View>}
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#131313' }, header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#262626' }, back: { width: 35, height: 42, justifyContent: 'center' }, backText: { color: '#FFFFFF', fontSize: 31 }, title: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 20 }, subtitle: { color: '#929292', fontFamily: 'Roboto', fontSize: 11 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 25 }, muted: { color: '#929292', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center', lineHeight: 18 }, error: { color: '#FF8989', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center' }, retry: { backgroundColor: yellow, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }, retryText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 12 }, list: { paddingHorizontal: 20, paddingTop: 18 }, sectionTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 17, marginBottom: 8 }, cardWrap: { borderBottomWidth: 1, borderBottomColor: '#252525' }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }, cat: { width: 160, height: 150 }, emptyTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 22 }, create: { marginTop: 8, minHeight: 45, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 21, borderRadius: 22, backgroundColor: yellow }, createText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 12 } });
