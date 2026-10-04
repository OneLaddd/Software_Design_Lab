import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '@/components/profile-avatar';
import { MarkdownText } from '@/components/markdown-text';
import { Toast } from '@/components/toast';
import { supabase } from '@/lib/supabase';

interface RequestRow {
  id: string;
  client_id: string;
  title: string;
  budget_min: number | null;
  budget_max: number | null;
}

interface BidStatsRow {
  bid_count: number;
  average_bid: number | null;
}

interface HunterProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  hunter_rating: number | null;
  hunter_rating_count: number | null;
}

interface BidRow {
  id: string;
  hunter_id: string;
  amount: number | null;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string | null;
  profile: HunterProfile | null;
}

function peso(value: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '—' : `₱${Number(value).toLocaleString()}`;
}

function postedTime(timestamp: string | null): string {
  if (!timestamp) return 'Time unavailable';
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return 'Time unavailable';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(time).toLocaleDateString();
}

export default function ManageBidsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const requestId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [stats, setStats] = useState<BidStatsRow | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [selectedBid, setSelectedBid] = useState<BidRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [pageError, setPageError] = useState('');
  const [bidListError, setBidListError] = useState('');
  const [acceptError, setAcceptError] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const loadData = useCallback(async () => {
    if (!requestId) {
      setPageError('This request link is missing its ID.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setPageError('');
    setBidListError('');

    const { data: userResult, error: authError } = await supabase.auth.getUser();
    if (authError || !userResult.user) {
      setPageError('Please sign in to manage bids.');
      setIsLoading(false);
      return;
    }

    const { data: requestData, error: requestError } = await supabase
      .from('service_requests')
      .select('id, client_id, title, budget_min, budget_max')
      .eq('id', requestId)
      .maybeSingle();

    if (requestError || !requestData) {
      console.warn('Failed to load request for bid management:', requestError);
      setPageError(requestError?.message || 'Request not found.');
      setIsLoading(false);
      return;
    }
    if (requestData.client_id !== userResult.user.id) {
      setPageError('Only the request owner can manage these bids.');
      setIsLoading(false);
      return;
    }
    setRequest(requestData as RequestRow);

    const [statsResult, bidsResult] = await Promise.all([
      supabase.rpc('get_request_bid_stats', { p_request_id: requestId }),
      supabase.rpc('get_request_bids', { p_request_id: requestId }),
    ]);

    if (statsResult.error) {
      console.warn('Failed to load request bid stats:', statsResult.error);
      setStats(null);
      setBidListError(statsResult.error.message || 'Could not load bid statistics.');
    } else {
      const row = (statsResult.data as BidStatsRow[] | null)?.[0];
      setStats(row ? {
        bid_count: Number(row.bid_count) || 0,
        average_bid: row.average_bid == null ? null : Number(row.average_bid),
      } : { bid_count: 0, average_bid: null });
    }

    if (bidsResult.error) {
      console.warn('Failed to load request bids:', bidsResult.error);
      setBids([]);
      setBidListError(bidsResult.error.message || 'Could not load bids.');
      setIsLoading(false);
      return;
    }

    const bidRows = (bidsResult.data ?? []) as {
      id: string;
      hunter_id: string;
      amount: number | null;
      message: string | null;
      status: 'pending' | 'accepted' | 'rejected';
      created_at: string | null;
    }[];
    const hunterIds = [...new Set(bidRows.map((bid) => bid.hunter_id))];
    const profilesResult = hunterIds.length
      ? await supabase
          .from('profiles')
          .select('id, username, avatar_url, hunter_rating, hunter_rating_count')
          .in('id', hunterIds)
      : { data: [], error: null };

    if (profilesResult.error) {
      console.warn('Failed to load bid hunter profiles:', profilesResult.error);
    }
    const profilesById = new Map(
      ((profilesResult.data ?? []) as HunterProfile[]).map((profile) => [profile.id, profile])
    );
    setBids(
      bidRows
        .map((bid) => ({ ...bid, profile: profilesById.get(bid.hunter_id) ?? null }))
        .sort((first, second) => {
          return new Date(second.created_at ?? 0).getTime() - new Date(first.created_at ?? 0).getTime();
        })
    );
    setIsLoading(false);
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const handleAcceptBid = async () => {
    if (!selectedBid || isAccepting) return;
    setIsAccepting(true);
    setAcceptError('');

    const { data: orderId, error } = await supabase.rpc('accept_bid', { p_bid_id: selectedBid.id });
    if (error) {
      console.warn('Failed to accept bid:', error);
      setAcceptError(error.message);
      setIsAccepting(false);
      return;
    }

    if (!orderId) {
      setAcceptError('The bid was accepted, but the order ID was not returned.');
      setIsAccepting(false);
      return;
    }

    setSelectedBid(null);
    setIsAccepting(false);
    setToastVisible(true);
    await loadData();
  };

  const requestBudget = request
    ? request.budget_min != null && request.budget_max != null
      ? `${peso(request.budget_min)} – ${peso(request.budget_max)}`
      : request.budget_min != null
        ? `From ${peso(request.budget_min)}`
        : request.budget_max != null
          ? `Up to ${peso(request.budget_max)}`
          : 'Budget not set'
    : '';
  const modalHunter = selectedBid?.profile;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d="M10.5 19.5 3 12l7.5-7.5M3 12h18" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Text style={styles.headerTitle}>Manage Bids</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#FFE600" size="large" />
          <Text style={styles.mutedText}>Loading bids...</Text>
        </View>
      ) : pageError ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{pageError}</Text>
          <Pressable onPress={() => void loadData()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 20 }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.requestCard}>
            <Text style={styles.overline}>ACTIVE REQUEST</Text>
            <Text style={styles.requestTitle}>{request?.title}</Text>
            <Text style={styles.requestBudget}>Budget: {requestBudget} PHP</Text>
            <View style={styles.statsCard}>
              <View style={styles.statCell}>
                {stats ? <Text style={styles.statValue}>{stats.bid_count}</Text> : <ActivityIndicator color="#FFE600" />}
                <Text style={styles.statLabel}>TOTAL BIDS</Text>
              </View>
              <View style={[styles.statCell, styles.statCellRight]}>
                {stats ? <Text style={styles.statAverage}>{peso(stats.average_bid)}</Text> : <ActivityIndicator color="#FFE600" />}
                <Text style={styles.statLabel}>AVERAGE BID</Text>
              </View>
            </View>
          </View>

          <View style={styles.listHeading}>
            <Text style={styles.listTitle}>Hunter Proposals</Text>
            {stats ? <Text style={styles.countBadge}>{stats.bid_count}</Text> : null}
          </View>
          {bidListError ? (
            <View style={styles.stateCard}>
              <Text style={styles.errorText}>{bidListError}</Text>
              <Pressable onPress={() => void loadData()} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : bids.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.mutedText}>No bids have been submitted yet.</Text>
            </View>
          ) : (
            bids.map((bid) => {
              const profile = bid.profile;
              const rating = Number(profile?.hunter_rating ?? 0);
              const ratingCount = Number(profile?.hunter_rating_count ?? 0);
              return (
                <View key={bid.id} style={styles.bidCard}>
                  <View style={styles.bidHeader}>
                    <View style={styles.hunterIdentity}>
                      <ProfileAvatar
                        avatarUrl={profile?.avatar_url}
                        size={48}
                        style={styles.avatar}
                        accessibilityLabel={`${profile?.username ?? 'Hunter'} profile avatar`}
                      />
                      <View style={styles.hunterDetails}>
                        <Text style={styles.hunterName} numberOfLines={1} onPress={() => profile?.id && router.push({ pathname: '/profile/[id]', params: { id: profile.id } } as any)}>
                          {profile?.username ? `@${profile.username}` : 'Hunter'}
                        </Text>
                        <Text style={styles.hunterMeta}>
                          <Text style={styles.star}>★ </Text>{rating.toFixed(1)} ({ratingCount} reviews) · {postedTime(bid.created_at)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.amountBlock}>
                      <Text style={styles.amount}>{peso(bid.amount)}</Text>
                      <Text style={styles.currency}>PHP</Text>
                    </View>
                  </View>
                  <MarkdownText style={styles.message}>
                    {bid.message?.trim() ? `“${bid.message.trim()}”` : 'No proposal message provided.'}
                  </MarkdownText>
                  <View style={styles.cardActions}>
                    <View style={styles.profileActions}>
                      <Pressable onPress={() => profile?.id && router.push({ pathname: '/profile/[id]', params: { id: profile.id } } as any)} style={styles.profileButton} accessibilityRole="button">
                        <Text style={styles.profileButtonText}>Profile</Text>
                      </Pressable>
                      <Pressable onPress={() => profile?.id && router.push({ pathname: '/messages/new/[id]', params: { id: profile.id } } as any)} style={styles.messageButton} accessibilityRole="button" accessibilityLabel="Message hunter" disabled={!profile?.id}>
                        <Svg width={18} height={18} viewBox="0 0 24 24">
                          <Path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" stroke="#E5E2E1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </Svg>
                      </Pressable>
                    </View>
                    {bid.status === 'pending' ? (
                      <Pressable onPress={() => { setAcceptError(''); setSelectedBid(bid); }} style={styles.acceptButton} accessibilityRole="button">
                        <Text style={styles.acceptButtonText}>Accept Bid</Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.statusBadge, bid.status === 'accepted' ? styles.acceptedBadge : styles.rejectedBadge]}>
                        <Text style={[styles.statusText, bid.status === 'accepted' ? styles.acceptedText : styles.rejectedText]}>
                          {bid.status === 'accepted' ? 'Accepted' : 'Rejected'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={Boolean(selectedBid)} transparent animationType="fade" onRequestClose={() => setSelectedBid(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !isAccepting && setSelectedBid(null)} />
          {selectedBid ? (
            <View style={styles.confirmationCard}>
              <View style={styles.confirmationTopRow}>
                <Text style={styles.confirmationTag}>HIRING CONFIRMATION</Text>
                <Pressable onPress={() => setSelectedBid(null)} disabled={isAccepting} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close confirmation">
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>
              <ScrollView
                style={styles.confirmationScroll}
                contentContainerStyle={styles.confirmationScrollContent}
                showsVerticalScrollIndicator={false}>
                <Text style={styles.confirmationTitle}>Accept This Bid?</Text>
                <Text style={styles.confirmationSubtitle}>
                  You are about to hire <Text style={styles.strongText}>{modalHunter?.username ? `@${modalHunter.username}` : 'this hunter'}</Text> for <Text style={styles.yellowText}>{peso(selectedBid.amount)}</Text> for this request.
                </Text>

                <View style={styles.confirmationSummary}>
                  <View style={styles.confirmationBidRow}>
                    <ProfileAvatar
                      avatarUrl={modalHunter?.avatar_url}
                      size={42}
                      style={styles.confirmAvatar}
                      accessibilityLabel={`${modalHunter?.username ?? 'Hunter'} profile avatar`}
                    />
                    <View style={styles.confirmHunterInfo}>
                      <Text style={styles.confirmHunterName} numberOfLines={1}>
                        {modalHunter?.username ? `@${modalHunter.username}` : 'Hunter'}
                      </Text>
                      <Text style={styles.hunterMeta}>
                        <Text style={styles.star}>★ </Text>{Number(modalHunter?.hunter_rating ?? 0).toFixed(1)} · {Number(modalHunter?.hunter_rating_count ?? 0)} reviews
                      </Text>
                    </View>
                    <Text style={styles.confirmAmount}>{peso(selectedBid.amount)}</Text>
                  </View>
                  <Text style={styles.requestTag} numberOfLines={2}>{request?.title}</Text>
                  <Text style={styles.quotedMessage}>
                    {selectedBid.message?.trim() ? `“${selectedBid.message.trim()}”` : 'No proposal message provided.'}
                  </Text>
                </View>

                <View style={styles.nextSteps}>
                  <Text style={styles.nextStepsTitle}>WHAT HAPPENS NEXT</Text>
                  <Text style={styles.nextStep}>✓  Bid changes to Accepted and a commission agreement is created.</Text>
                  <Text style={styles.nextStepMuted}>✓  Request becomes Awarded; other pending bids are rejected.</Text>
                  <Text style={styles.nextStepMuted}>✓  Return to Manage Bids with updated statuses.</Text>
                </View>
                {acceptError ? <Text style={styles.acceptError}>{acceptError}</Text> : null}
              </ScrollView>
              <View style={styles.confirmationActions}>
              <Pressable onPress={() => void handleAcceptBid()} disabled={isAccepting} style={[styles.confirmButton, isAccepting && styles.disabledButton]} accessibilityRole="button">
                <Text style={styles.confirmButtonText}>{isAccepting ? 'Accepting...' : 'Accept Bid'}</Text>
              </Pressable>
              <Pressable onPress={() => setSelectedBid(null)} disabled={isAccepting} style={styles.cancelButton} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      <Toast message="Bid accepted. Request awarded." visible={toastVisible} onHide={() => setToastVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { marginLeft: 10, color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 20 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  content: { paddingHorizontal: 20, paddingTop: 18, gap: 16 },
  requestCard: { padding: 18, gap: 7, borderRadius: 18, backgroundColor: '#201F1F' },
  overline: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 11, letterSpacing: 0.7 },
  requestTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 26, lineHeight: 31 },
  requestBudget: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  statsCard: { flexDirection: 'row', marginTop: 8, padding: 13, borderRadius: 10, backgroundColor: '#1C1B1B' },
  statCell: { flex: 1, minHeight: 56, justifyContent: 'center', gap: 2 },
  statCellRight: { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)' },
  statLabel: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.6 },
  statValue: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 26 },
  statAverage: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 23 },
  listHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 21 },
  countBadge: { minWidth: 27, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: '#FFE600', color: '#201C00', textAlign: 'center', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  stateCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, borderRadius: 16, backgroundColor: '#201F1F' },
  mutedText: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13, textAlign: 'center' },
  retryButton: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 9, backgroundColor: '#FFE600' },
  retryText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  bidCard: { padding: 15, gap: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: '#201F1F' },
  bidHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  hunterIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#353534' },
  avatarFallback: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#353534' },
  avatarInitials: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  hunterDetails: { flex: 1, minWidth: 0, gap: 3 },
  hunterName: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  hunterMeta: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 11 },
  star: { color: '#FFE600' },
  amountBlock: { alignItems: 'flex-end' },
  amount: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 22 },
  currency: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  message: { padding: 12, borderRadius: 11, backgroundColor: '#191919', color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 14, lineHeight: 21 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  profileActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, backgroundColor: '#353534' },
  profileButtonText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  messageButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#353534' },
  acceptButton: { minHeight: 43, flex: 1, maxWidth: 155, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFE600' },
  acceptButtonText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  statusBadge: { minHeight: 39, minWidth: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 10 },
  acceptedBadge: { backgroundColor: '#FFE600' },
  rejectedBadge: { backgroundColor: '#353534' },
  statusText: { fontFamily: 'RobotoExtraBold', fontSize: 12 },
  acceptedText: { color: '#201C00' },
  rejectedText: { color: '#C8C6B9' },
  modalBackdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 18, backgroundColor: 'rgba(0,0,0,0.78)' },
  confirmationCard: { width: '100%', maxHeight: '94%', flexShrink: 1, padding: 19, gap: 12, borderRadius: 20, backgroundColor: '#1C1B1B' },
  confirmationTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confirmationScroll: { flexShrink: 1 },
  confirmationScrollContent: { gap: 13, paddingBottom: 2 },
  confirmationActions: { gap: 8, paddingTop: 1 },
  confirmationTag: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#353534', color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#353534' },
  closeText: { color: '#C8C6B9', fontSize: 24, lineHeight: 26 },
  confirmationTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanExtraBold', fontSize: 27 },
  confirmationSubtitle: { color: '#C8C6B9', fontFamily: 'Roboto', fontSize: 14, lineHeight: 20 },
  strongText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold' },
  yellowText: { color: '#FFE600', fontFamily: 'RobotoExtraBold' },
  confirmationSummary: { padding: 13, gap: 12, borderRadius: 12, backgroundColor: '#242323' },
  confirmationBidRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  confirmAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#353534' },
  confirmAvatarFallback: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#353534' },
  confirmHunterInfo: { flex: 1, minWidth: 0, gap: 3 },
  confirmHunterName: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  confirmAmount: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 19 },
  requestTag: { alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6, backgroundColor: '#191919', color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 11 },
  quotedMessage: { padding: 11, borderRadius: 8, backgroundColor: '#191919', color: '#C8C6B9', fontFamily: 'Roboto', fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  nextSteps: { padding: 13, gap: 9, borderRadius: 11, backgroundColor: '#141414' },
  nextStepsTitle: { marginBottom: 2, color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.6 },
  nextStep: { color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 12, lineHeight: 17 },
  nextStepMuted: { color: '#C8C6B9', fontFamily: 'Roboto', fontSize: 12, lineHeight: 17 },
  acceptError: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13, lineHeight: 18 },
  confirmButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#FFE600' },
  confirmButtonText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 15 },
  disabledButton: { opacity: 0.5 },
  cancelButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#2A2A2A' },
  cancelText: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
});
