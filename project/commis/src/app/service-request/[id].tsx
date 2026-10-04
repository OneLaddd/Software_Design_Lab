import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BidComposerModal, type BidDraft } from '@/components/bid-composer-modal';
import { CloseRequestSheet } from '@/components/close-request-sheet';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';
import { requireAccount } from '@/lib/require-auth';
import { MarkdownText } from '@/components/markdown-text';
import { ConfirmationModal } from '@/components/confirmation-modal';

interface ServiceRequest {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: 'open' | 'closed' | 'awarded' | null;
  created_at: string | null;
  currency: string | null;
}

interface CategoryLink {
  category_id: string;
  categories: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  active_role?: string | null;
  client_rating?: number | null;
  client_rating_count?: number | null;
  hunter_rating?: number | null;
  hunter_rating_count?: number | null;
}

interface Bid {
  id: string;
  request_id: string;
  hunter_id: string;
  amount: number | null;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string | null;
  profiles: Profile | Profile[] | null;
}

interface RequestBidStats {
  bid_count: number;
  average_bid: number | null;
}

function relativeTime(timestamp: string | null): string {
  if (!timestamp) return 'Time unavailable';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr${elapsedHours === 1 ? '' : 's'} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

function peso(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return 'Not set';
  return `₱${Number(value).toLocaleString()}`;
}

function profileFromBid(bid: Bid): Profile | null {
  return Array.isArray(bid.profiles) ? bid.profiles[0] ?? null : bid.profiles;
}

function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '•';
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('');
}

export default function ServiceRequestDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const requestId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [client, setClient] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<CategoryLink[]>([]);
  const [bids, setBids] = useState<Bid[] | null>(null);
  const [bidStats, setBidStats] = useState<RequestBidStats | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCloseSheetVisible, setIsCloseSheetVisible] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [isWithdrawingBid, setIsWithdrawingBid] = useState(false);
  const [isBidModalVisible, setIsBidModalVisible] = useState(false);
  const [bidBeingEdited, setBidBeingEdited] = useState<Bid | null>(null);
  const [bidSubmitError, setBidSubmitError] = useState('');
  const [withdrawConfirmation, setWithdrawConfirmation] = useState<Bid | null>(null);
  const [requestError, setRequestError] = useState('');
  const [relatedDataError, setRelatedDataError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [bidError, setBidError] = useState('');
  const [bidStatsError, setBidStatsError] = useState('');
  const [actionError, setActionError] = useState('');

  const isOwner = Boolean(request && currentUserId === request.client_id);
  const isHunter = currentRole === 'hunter';
  const isEligibleHunter = Boolean(isHunter && !isOwner);
  const existingUserBid = bids?.find(
    (bid) => bid.hunter_id === currentUserId && bid.status === 'pending'
  );
  const hasExistingBid = Boolean(existingUserBid);
  const canPlaceBid = Boolean(
    isEligibleHunter &&
      request?.status === 'open' &&
      bids !== null &&
      !bidError &&
      !hasExistingBid
  );
  const loadDetails = useCallback(async () => {
    if (!requestId) {
      setRequestError('This request link is missing its ID.');
      setRequest(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setRequestError('');
    setRelatedDataError('');
    setBidError('');
    setBidStatsError('');
    setBids(null);
    setBidStats(null);

    const { data: requestData, error: loadRequestError } = await supabase
      .from('service_requests')
      .select('id, client_id, title, description, budget_min, budget_max, status, created_at, currency')
      .eq('id', requestId)
      .maybeSingle();

    if (loadRequestError || !requestData) {
      console.warn('Failed to load service request:', loadRequestError);
      setRequestError(
        loadRequestError ? 'Could not load this request. Check your connection and try again.' : 'This request could not be found.'
      );
      setRequest(null);
      setIsLoading(false);
      return;
    }

    const loadedRequest = requestData as ServiceRequest;
    setRequest(loadedRequest);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    const userId = authError ? null : user?.id ?? null;
    setCurrentUserId(userId);

    const [categoryResult, clientResult, bidResult, bidStatsResult, profileResult, savedResult] = await Promise.all([
      supabase
        .from('request_categories')
        .select('category_id, categories(id, name)')
        .eq('request_id', requestId),
      supabase
        .from('profiles')
        .select('id, username, avatar_url, client_rating, client_rating_count')
        .eq('id', loadedRequest.client_id)
        .maybeSingle(),
      supabase.rpc('get_request_bids', { p_request_id: requestId }),
      supabase.rpc('get_request_bid_stats', { p_request_id: requestId }),
      userId
        ? supabase.from('profiles').select('active_role').eq('id', userId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      userId
        ? supabase
            .from('saved_requests')
            .select('request_id')
            .eq('user_id', userId)
            .eq('request_id', requestId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (categoryResult.error || clientResult.error) {
      setRelatedDataError('Some request details could not be loaded.');
      console.warn('Failed to load request categories or client:', categoryResult.error ?? clientResult.error);
    }
    setCategories((categoryResult.data ?? []) as unknown as CategoryLink[]);
    setClient((clientResult.data as Profile | null) ?? null);

    if (profileResult.error) {
      setRoleError('Could not determine your role. Request actions are unavailable.');
      console.warn('Failed to load current profile role:', profileResult.error);
    } else {
      setRoleError('');
    }
    setCurrentRole(profileResult.data?.active_role ?? null);

    if (bidResult.error) {
      setBidError('Could not load bids. Check that the bid visibility function is available.');
      console.warn('Failed to load request bids:', bidResult.error);
      setBids(null);
    } else {
      const bidRows = (bidResult.data ?? []) as unknown as Omit<Bid, 'profiles'>[];
      const hunterIds = [...new Set(bidRows.map((bid) => bid.hunter_id))];
      const { data: hunterProfiles, error: hunterProfilesError } = hunterIds.length
        ? await supabase
            .from('profiles')
            .select('id, username, avatar_url, hunter_rating, hunter_rating_count')
            .in('id', hunterIds)
        : { data: [], error: null };

      if (hunterProfilesError) {
        console.warn('Failed to load hunter profiles:', hunterProfilesError);
      }
      const profilesById = new Map(
        ((hunterProfiles ?? []) as Profile[]).map((profile) => [profile.id, profile])
      );
      const sortedBids = [...bidRows].sort((left, right) => {
        return new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();
      });
      setBids(
        sortedBids.map((bid) => ({
          ...bid,
          profiles: profilesById.get(bid.hunter_id) ?? null,
        }))
      );
    }

    if (bidStatsResult.error) {
      setBidStatsError('Could not load bid statistics.');
      console.warn('Failed to load request bid statistics:', bidStatsResult.error);
    } else {
      const statsRow = (bidStatsResult.data as RequestBidStats[] | null)?.[0];
      setBidStats(
        statsRow
          ? {
              bid_count: Number(statsRow.bid_count) || 0,
              average_bid: statsRow.average_bid == null ? null : Number(statsRow.average_bid),
            }
          : { bid_count: 0, average_bid: null }
      );
    }

    if (savedResult.error) {
      console.warn('Failed to load saved request state:', savedResult.error);
      setIsSaved(false);
      setActionError('Could not load saved-request status.');
    } else {
      setIsSaved(Boolean(savedResult.data));
    }

    setIsLoading(false);
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      void loadDetails();
    }, [loadDetails])
  );

  const categoryNames = useMemo(() => {
    return categories.flatMap((link) => {
      if (!link.categories) return [];
      return Array.isArray(link.categories) ? link.categories.map((item) => item.name) : [link.categories.name];
    });
  }, [categories]);

  const toggleSaved = async () => {
    if (!currentUserId || !request || isSaving) {
      if (!currentUserId) await requireAccount(router, 'save service requests');
      return;
    }
    if (actionError === 'Could not load saved-request status.') return;

    setIsSaving(true);
    setActionError('');
    const result = isSaved
      ? await supabase
          .from('saved_requests')
          .delete()
          .eq('user_id', currentUserId)
          .eq('request_id', request.id)
      : await supabase.from('saved_requests').insert({ user_id: currentUserId, request_id: request.id });

    if (result.error) {
      console.warn('Failed to update saved request:', result.error);
      setActionError('Could not update the saved request.');
    } else {
      setIsSaved(!isSaved);
    }
    setIsSaving(false);
  };

  const closeRequest = () => {
    if (!request || !isOwner || request.status !== 'open' || isClosing) return;
    setCloseError('');
    setIsCloseSheetVisible(true);
  };

  const confirmCloseRequest = async () => {
    if (!request) return;
    setIsClosing(true);
    setCloseError('');
    const { data, error } = await supabase
      .from('service_requests')
      .update({ status: 'closed' })
      .eq('id', request.id)
      .eq('client_id', currentUserId)
      .select('id, status')
      .maybeSingle();

    if (error || !data) {
      console.warn('Failed to close request:', error);
      setCloseError(error ? 'Could not close this request. Please try again.' : 'You are not allowed to close this request.');
    } else {
      setRequest({ ...request, status: data.status as ServiceRequest['status'] });
      setIsCloseSheetVisible(false);
    }
    setIsClosing(false);
  };

  const getBidErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code === '23505') return 'You have already submitted a bid for this request.';
    const message = (error.message ?? '').toLowerCase();
    if (message.includes('range') || message.includes('budget')) {
      return `Bid must be within ${request?.budget_min != null ? peso(request.budget_min) : 'the minimum'} – ${request?.budget_max != null ? peso(request.budget_max) : 'the maximum'} PHP.`;
    }
    return 'Could not save your bid. Check the amount and try again.';
  };

  const submitBid = async (draft: BidDraft) => {
    if (!currentUserId) {
      await requireAccount(router, 'place bids on service requests');
      return;
    }
    const amountInRange = Boolean(
      request &&
        Number.isFinite(draft.amount) &&
        draft.amount > 0 &&
        (request.budget_min == null || draft.amount >= request.budget_min) &&
        (request.budget_max == null || draft.amount <= request.budget_max)
    );
    if (!request || !currentUserId || !canPlaceBid || !amountInRange || isSubmittingBid) return;
    setIsSubmittingBid(true);
    setBidSubmitError('');

    const { data: existingBid, error: existingBidError } = await supabase
      .from('bids')
      .select('id, status')
      .eq('request_id', request.id)
      .eq('hunter_id', currentUserId)
      .limit(1)
      .maybeSingle();

    if (existingBidError) {
      console.warn('Could not check for an existing bid:', existingBidError);
      setBidSubmitError('Could not verify whether you already bid. Please try again.');
      setIsSubmittingBid(false);
      return;
    }
    if (existingBid && ['pending', 'accepted'].includes(existingBid.status)) {
      setBidSubmitError('You have already submitted a bid for this request.');
      setIsSubmittingBid(false);
      await loadDetails();
      return;
    }

    const { error } = await supabase.from('bids').insert({
      request_id: request.id,
      hunter_id: currentUserId,
      amount: draft.amount,
      message: draft.message.trim() || null,
    });

    if (error) {
      console.warn('Failed to place bid:', error);
      setBidSubmitError(getBidErrorMessage(error));
      setIsSubmittingBid(false);
      return;
    }

    setIsBidModalVisible(false);
    setIsSubmittingBid(false);
    await loadDetails();
  };

  const submitBidEdit = async (bid: Bid, draft: BidDraft) => {
    const amountInRange = Boolean(
      request &&
        Number.isFinite(draft.amount) &&
        draft.amount > 0 &&
        (request.budget_min == null || draft.amount >= request.budget_min) &&
        (request.budget_max == null || draft.amount <= request.budget_max)
    );
    if (!request || bid.hunter_id !== currentUserId || bid.status !== 'pending' || !amountInRange || isSubmittingBid) return;

    setIsSubmittingBid(true);
    setBidSubmitError('');
    const { error } = await supabase
      .from('bids')
      .update({ amount: draft.amount, message: draft.message.trim() || null })
      .eq('id', bid.id);

    if (error) {
      console.warn('Failed to edit bid:', error);
      setBidSubmitError(getBidErrorMessage(error));
      setIsSubmittingBid(false);
      return;
    }

    setBidBeingEdited(null);
    setIsSubmittingBid(false);
    await loadDetails();
  };

  const withdrawBid = (bid: Bid) => {
    if (bid.hunter_id !== currentUserId || bid.status !== 'pending' || isWithdrawingBid) return;
    setWithdrawConfirmation(bid);
  };

  const confirmWithdrawBid = async (bid: Bid) => {
    if (bid.hunter_id !== currentUserId || bid.status !== 'pending') return;
    setIsWithdrawingBid(true);
    setBidSubmitError('');
    const { error } = await supabase.from('bids').delete().eq('id', bid.id);
    if (error) {
      console.warn('Failed to withdraw bid:', error);
      setBidSubmitError('Could not withdraw this bid. Please try again.');
      setIsWithdrawingBid(false);
      return;
    }
    setBidBeingEdited(null);
    setIsWithdrawingBid(false);
    await loadDetails();
  };

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
      <Pressable
        onPress={() => router.back()}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back">
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d="M10.5 19.5 3 12l7.5-7.5M3 12h18" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Pressable>
      <Text style={styles.headerTitle}>Request</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.root}>
        {renderHeader()}
        <View style={styles.stateContainer}>
          <ActivityIndicator color="#FFE600" size="large" />
          <Text style={styles.stateText}>Loading request...</Text>
        </View>
      </View>
    );
  }

  if (requestError || !request) {
    return (
      <View style={styles.root}>
        {renderHeader()}
        <View style={styles.stateContainer}>
          <Text style={styles.errorTitle}>{requestError || 'This request could not be found.'}</Text>
          <Pressable onPress={() => void loadDetails()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const statusLabel = request.status === 'open'
    ? 'Active Bounty'
    : request.status === 'closed'
      ? 'Closed Request'
      : request.status === 'awarded'
        ? 'Awarded Request'
        : 'Status unavailable';
  const requestBudget = request.budget_min != null && request.budget_max != null
    ? `${peso(request.budget_min)} – ${peso(request.budget_max)}`
    : request.budget_min != null
      ? `From ${peso(request.budget_min)}`
      : request.budget_max != null
        ? `Up to ${peso(request.budget_max)}`
        : 'Budget not set';
  const clientRatingCount = Number(client?.client_rating_count ?? 0);
  return (
    <View style={styles.root}>
      {renderHeader()}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 20 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <View style={[styles.statusDot, request.status !== 'open' && styles.statusDotMuted]} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
            <View style={styles.metaItem}>
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Circle cx={12} cy={12} r={9} stroke="#A6A6AB" strokeWidth={2} fill="none" />
                <Path d="M12 7v5l3 2" stroke="#A6A6AB" strokeWidth={2} strokeLinecap="round" />
              </Svg>
              <Text style={styles.mutedSmall}>Posted {relativeTime(request.created_at)}</Text>
            </View>
          </View>
          <Text style={styles.requestTitle}>{request.title}</Text>
          <View style={styles.budgetBlock}>
            <Text style={styles.overline}>BOUNTY BUDGET</Text>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetText}>{requestBudget}</Text>
              <Text style={styles.currencyLabel}>PHP</Text>
            </View>
          </View>
          {categoryNames.length > 0 ? (
            <View style={styles.categoryList}>
              {categoryNames.map((name, index) => (
                <Text key={`${name}-${index}`} style={styles.categoryPill}>{name}</Text>
              ))}
            </View>
          ) : relatedDataError ? (
            <Text style={styles.inlineMuted}>Categories could not be loaded.</Text>
          ) : (
            <Text style={styles.inlineMuted}>No categories assigned</Text>
          )}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionOverline}>REQUEST DESCRIPTION</Text>
          <MarkdownText style={styles.descriptionText}>
            {request.description?.trim() || 'No description provided.'}
          </MarkdownText>
        </View>

        <View>
          <Text style={styles.sectionOverlineOutside}>CLIENT</Text>
          <View style={styles.clientCard}>
            {client ? (
              <>
                <ProfileAvatar
                  avatarUrl={client.avatar_url}
                  size={46}
                  style={styles.clientAvatar}
                  accessibilityLabel="Client profile avatar"
                />
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName} numberOfLines={1} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: client.id } } as any)}>
                    {client.username ? `@${client.username}` : 'Commis member'}
                  </Text>
                  <Text style={styles.profileSubtext}>Client</Text>
                </View>
                <View style={styles.ratingPill}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingText}>{Number(client.client_rating ?? 0).toFixed(1)}</Text>
                  <Text style={styles.ratingCount}>({clientRatingCount} reviews)</Text>
                </View>
              </>
            ) : (
              <Text style={styles.inlineMuted}>
                {relatedDataError ? 'Client profile unavailable.' : 'Client profile not available.'}
              </Text>
            )}
          </View>
        </View>

        <View>
          <Text style={styles.sectionOverlineOutside}>BIDS</Text>
          <View style={styles.metricsCard}>
            <View style={styles.metricCell}>
              {bidStats === null ? (
                bidStatsError ? <Text style={styles.errorText}>Unavailable</Text> : <ActivityIndicator color="#FFE600" />
              ) : (
                <Text style={styles.metricValue}>{bidStats.bid_count}</Text>
              )}
              <Text style={styles.metricLabel}>Total Bids Submitted</Text>
            </View>
            <View style={[styles.metricCell, styles.metricCellRight]}>
              {bidStats === null ? (
                bidStatsError ? <Text style={styles.errorText}>Unavailable</Text> : <ActivityIndicator color="#FFE600" />
              ) : (
                <Text style={[styles.metricValue, styles.metricAverage]}>
                  {bidStats.average_bid == null ? '—' : peso(bidStats.average_bid)}
                </Text>
              )}
              <Text style={styles.metricLabel}>Average Hunter Bid</Text>
            </View>
          </View>
          {bidError ? (
            <Pressable onPress={() => void loadDetails()} style={styles.retryInline}>
              <Text style={styles.errorText}>{bidError}</Text>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
          {bidStatsError ? (
            <Text style={styles.errorText}>{bidStatsError}</Text>
          ) : null}
        </View>

        {isOwner ? (
          <View style={styles.actionStack}>
            <View style={styles.managementRow}>
              <Pressable
                onPress={() => router.push({ pathname: '/post-bounty', params: { requestId: request.id } } as any)}
                disabled={request.status !== 'open'}
                style={[styles.secondaryAction, request.status !== 'open' && styles.disabledAction]}
                accessibilityRole="button">
                <Text style={styles.secondaryActionText}>Edit Request</Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/manage-bids/${request.id}` as any)} style={styles.primaryAction} accessibilityRole="button">
                <Text style={styles.primaryActionText}>Manage Bids</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={closeRequest}
              disabled={request.status !== 'open' || isClosing}
              style={[styles.closeAction, request.status !== 'open' && styles.disabledAction]}
              accessibilityRole="button">
              <Text style={styles.closeActionText}>
                {isClosing ? 'Closing...' : request.status === 'open' ? 'Close Request' : statusLabel}
              </Text>
            </Pressable>
          </View>
        ) : (!currentUserId || isEligibleHunter) && request.status === 'open' ? (
          <View style={styles.actionStack}>
            <View style={styles.hunterActionRow}>
              <Pressable
                onPress={() => void toggleSaved()}
                disabled={isSaving}
                style={styles.saveButton}
                accessibilityRole="button"
                accessibilityLabel={isSaved ? 'Remove saved request' : 'Save request'}>
                <Svg width={20} height={20} viewBox="0 0 24 24">
                  <Path
                    d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z"
                    fill={isSaved ? '#FFE600' : 'none'}
                    stroke={isSaved ? '#FFE600' : '#D1D1D1'}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!currentUserId) {
                    void requireAccount(router, 'place bids on service requests');
                    return;
                  }
                  setBidSubmitError('');
                  setBidBeingEdited(null);
                  setIsBidModalVisible(true);
                }}
                disabled={Boolean(currentUserId) && !canPlaceBid}
                style={[styles.placeBidButton, Boolean(currentUserId) && !canPlaceBid && styles.disabledSubmit]}
                accessibilityRole="button">
                <Text style={styles.placeBidText}>
                  {!currentUserId
                    ? 'Sign in to place a bid'
                    : bidError
                      ? 'Bids unavailable'
                      : bids === null
                        ? 'Checking bids...'
                        : hasExistingBid
                          ? 'Bid already submitted'
                          : 'Place Bid'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
        {!isOwner && roleError ? <Text style={styles.actionError}>{roleError}</Text> : null}

        <View style={styles.submissionsSection}>
          <Text style={styles.sectionOverlineOutside}>RECENT HUNTER SUBMISSIONS</Text>
          {bidError ? (
            <View style={styles.emptyState}>
              <Text style={styles.inlineMuted}>{bidError}</Text>
              <Pressable onPress={() => void loadDetails()} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : bids === null ? (
            <View style={styles.bidsLoading}>
              <ActivityIndicator color="#FFE600" />
              <Text style={styles.inlineMuted}>Loading bids...</Text>
            </View>
          ) : bids.length === 0 ? (
            <View style={styles.emptyState}>
              <Image
                source={require('@/assets/images/nothing-to-see-here-cat.png')}
                style={styles.emptyImage}
                resizeMode="contain"
              />
              <Text style={styles.emptyTitle}>No bids yet</Text>
              <Text style={styles.emptyDescription}>Be the first hunter to place a bid.</Text>
            </View>
          ) : (
            bids.map((bid) => {
              const hunter = profileFromBid(bid);
              const hunterRatingCount = Number(hunter?.hunter_rating_count ?? 0);
              return (
                <View key={bid.id} style={styles.bidCard}>
                  <View style={styles.bidHeader}>
                    <View style={styles.hunterDetails}>
                      <ProfileAvatar
                        avatarUrl={hunter?.avatar_url}
                        size={40}
                        style={styles.hunterAvatar}
                        accessibilityLabel={`${hunter?.username ?? 'Hunter'} profile avatar`}
                      />
                      <View style={styles.hunterTextBlock}>
                        <Text style={styles.hunterName} numberOfLines={1} onPress={() => hunter?.id && router.push({ pathname: '/profile/[id]', params: { id: hunter.id } } as any)}>
                          {hunter?.username ? `@${hunter.username}` : 'Hunter'}
                        </Text>
                        <Text style={styles.bidSubtext}>• {relativeTime(bid.created_at)}</Text>
                        <Text style={styles.hunterRating}>
                          <Text style={styles.ratingStar}>★ </Text>
                          {Number(hunter?.hunter_rating ?? 0).toFixed(1)} ({hunterRatingCount} reviews)
                        </Text>
                      </View>
                    </View>
                    <View style={styles.bidAmountBlock}>
                      <Text style={styles.bidAmount}>
                        {bid.amount == null ? '₱??' : peso(Number(bid.amount))}
                      </Text>
                      <Text style={styles.bidCurrency}>PHP</Text>
                      {isHunter && bid.hunter_id === currentUserId && bid.status === 'pending' ? (
                        <Pressable
                          onPress={() => {
                            setBidSubmitError('');
                            setIsBidModalVisible(false);
                            setBidBeingEdited(bid);
                          }}
                          style={styles.editBidButton}
                          accessibilityRole="button"
                          accessibilityLabel="Edit your pending bid">
                          <Svg width={16} height={16} viewBox="0 0 24 24">
                            <Path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="#E5E2E1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </Svg>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  {bid.message?.trim() ? (
                    <MarkdownText style={styles.bidMessage} numberOfLines={3}>{bid.message.trim()}</MarkdownText>
                  ) : (
                    <Text style={styles.bidNoMessage}>No proposal message provided.</Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <BidComposerModal
        visible={isBidModalVisible || Boolean(bidBeingEdited)}
        mode={bidBeingEdited ? 'edit' : 'create'}
        requestTitle={request?.title ?? ''}
        requestBudget={requestBudget}
        minimumBudget={request?.budget_min ?? null}
        maximumBudget={request?.budget_max ?? null}
        initialAmount={bidBeingEdited?.amount}
        initialMessage={bidBeingEdited?.message}
        isSubmitting={isSubmittingBid}
        isWithdrawing={isWithdrawingBid}
        error={bidSubmitError}
        onCancel={() => {
          setIsBidModalVisible(false);
          setBidBeingEdited(null);
          setBidSubmitError('');
        }}
        onSubmit={(draft) => {
          if (bidBeingEdited) {
            void submitBidEdit(bidBeingEdited, draft);
          } else {
            void submitBid(draft);
          }
        }}
        onWithdraw={bidBeingEdited ? () => withdrawBid(bidBeingEdited) : undefined}
      />
      <CloseRequestSheet
        visible={isCloseSheetVisible}
        title={request.title}
        budget={requestBudget}
        bidCount={bidStats?.bid_count ?? null}
        isClosing={isClosing}
        error={closeError}
        onConfirm={() => void confirmCloseRequest()}
        onDismiss={() => {
          if (!isClosing) {
            setIsCloseSheetVisible(false);
            setCloseError('');
          }
        }}
      />
      <ConfirmationModal
        visible={Boolean(withdrawConfirmation)}
        title="Withdraw this bid?"
        message="Your pending bid will be removed from this request."
        confirmLabel="Withdraw Bid"
        busy={isWithdrawingBid}
        onCancel={() => setWithdrawConfirmation(null)}
        onConfirm={() => {
          const bid = withdrawConfirmation;
          setWithdrawConfirmation(null);
          if (bid) void confirmWithdrawBid(bid);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: {
    minHeight: 64,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, marginLeft: 8, color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 20 },
  headerSpacer: { width: 40 },
  content: { paddingHorizontal: 20, paddingTop: 14, gap: 16 },
  stateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  stateText: { color: '#C8C6C8', fontFamily: 'Roboto', fontSize: 14 },
  errorTitle: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 16, textAlign: 'center' },
  retryButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#FFE600' },
  retryText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  heroCard: { padding: 17, gap: 13, backgroundColor: '#1C1B1B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 18 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFE600' },
  statusDotMuted: { backgroundColor: '#777777' },
  statusText: { color: '#F4F4F4', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  mutedSmall: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 },
  requestTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 27, lineHeight: 32 },
  budgetBlock: { gap: 3 },
  overline: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 11, letterSpacing: 0.6 },
  budgetRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  budgetText: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 29, lineHeight: 35 },
  currencyLabel: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 2 },
  categoryPill: { maxWidth: '100%', paddingHorizontal: 11, paddingVertical: 6, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#282727', color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  inlineMuted: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 13 },
  panel: { padding: 17, gap: 13, backgroundColor: '#1C1B1B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 18 },
  sectionOverline: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 11, letterSpacing: 0.6 },
  descriptionText: { color: '#D0CECF', fontFamily: 'Roboto', fontSize: 14, lineHeight: 22 },
  sectionOverlineOutside: { marginHorizontal: 4, marginBottom: 8, color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 11, letterSpacing: 0.6 },
  clientCard: { minHeight: 76, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1C1B1B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 18 },
  clientAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#292929' },
  profileInfo: { flex: 1, minWidth: 0 },
  profileName: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 16 },
  profileSubtext: { marginTop: 2, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#272626' },
  ratingStar: { color: '#FFE600' },
  ratingText: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  ratingCount: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 11 },
  metricsCard: { flexDirection: 'row', padding: 16, backgroundColor: '#1C1B1B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 18 },
  metricCell: { flex: 1, minHeight: 58, justifyContent: 'center', gap: 3 },
  metricCellRight: { paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)' },
  metricValue: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 29 },
  metricAverage: { color: '#FFE600', fontSize: 24 },
  metricLabel: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 },
  retryInline: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  errorText: { flex: 1, color: '#FF7676', fontFamily: 'Roboto', fontSize: 12 },
  actionStack: { gap: 9 },
  managementRow: { flexDirection: 'row', gap: 9 },
  secondaryAction: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#1C1B1B' },
  secondaryActionText: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 15 },
  primaryAction: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFE600' },
  primaryActionText: { color: '#131313', fontFamily: 'LeagueSpartanExtraBold', fontSize: 15 },
  closeAction: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#1C1B1B' },
  closeActionText: { color: '#B5B5B5', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  disabledAction: { opacity: 0.45 },
  hunterActionRow: { flexDirection: 'row', gap: 10 },
  saveButton: { width: 54, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#1C1B1B' },
  placeBidButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFE600' },
  placeBidText: { color: '#131313', fontFamily: 'LeagueSpartanExtraBold', fontSize: 16 },
  actionError: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13, lineHeight: 18 },
  submissionsSection: { gap: 11 },
  bidsLoading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1C1B1B', borderRadius: 18 },
  emptyState: { minHeight: 210, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8, backgroundColor: '#1C1B1B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 18 },
  emptyImage: { width: 130, height: 105 },
  emptyTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 18 },
  emptyDescription: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 13, textAlign: 'center' },
  bidCard: { padding: 14, gap: 12, backgroundColor: '#1C1B1B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 18 },
  bidHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hunterDetails: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hunterAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2D2C2C' },
  hunterAvatarFallback: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#2D2C2C' },
  avatarInitials: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  hunterTextBlock: { flex: 1, minWidth: 0 },
  hunterName: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  bidSubtext: { marginTop: 2, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 11 },
  hunterRating: { marginTop: 2, color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 11 },
  bidAmountBlock: { alignItems: 'flex-end' },
  bidAmount: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 21 },
  bidCurrency: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  editBidButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginTop: 3, borderRadius: 8, backgroundColor: '#353534' },
  bidMessage: { padding: 12, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', backgroundColor: '#232222', color: '#D0CECF', fontFamily: 'Roboto', fontSize: 13, lineHeight: 20 },
  bidNoMessage: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12, fontStyle: 'italic' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' },
  bidModal: { paddingHorizontal: 22, paddingTop: 12, gap: 10, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: '#1C1B1B' },
  modalHandle: { alignSelf: 'center', width: 42, height: 4, marginBottom: 4, borderRadius: 2, backgroundColor: '#626262' },
  modalTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 24 },
  requestContext: { padding: 12, borderRadius: 10, backgroundColor: '#242323', gap: 4 },
  contextLabel: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.7 },
  contextTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 16 },
  contextBudget: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  fieldLabel: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  required: { color: '#FFE600' },
  bidAmountInputWrap: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 11, backgroundColor: '#242323' },
  currencySymbol: { marginRight: 8, color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 22 },
  bidAmountInput: { flex: 1, padding: 0, color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 23 },
  messageLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 11 },
  bidMessageInput: { minHeight: 110, padding: 12, borderRadius: 11, backgroundColor: '#242323', color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 14, lineHeight: 21 },
  modalHelper: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 },
  modalSubmit: { marginTop: 5 },
  disabledSubmit: { backgroundColor: '#6A6A6D' },
  modalCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#C8C6C8', fontFamily: 'RobotoExtraBold', fontSize: 14 },
});
