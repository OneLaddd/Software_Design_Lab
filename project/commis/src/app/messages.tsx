import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { NavigationDrawer } from '@/components/navigation-drawer';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';
import { MarkdownText } from '@/components/markdown-text';

type MessageTab = 'notifications' | 'chats';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_id: string | null;
  created_at: string | null;
  counterparty?: ProfileSummary | null;
  counterpartyRole?: 'Client' | 'Hunter';
  requestTitle?: string | null;
  orderAmount?: number | null;
}

interface OrderRow {
  id: string;
  client_id: string;
  hunter_id: string;
  request_id: string | null;
  amount: number;
}

interface ProfileSummary {
  id: string;
  username: string | null;
  avatar_url: string | null;
  active_role: string | null;
  client_rating: number | null;
  client_rating_count: number | null;
  hunter_rating: number | null;
  hunter_rating_count: number | null;
}

interface ConversationRow {
  id: string;
  created_at: string | null;
  otherUser: ProfileSummary | null;
  latestMessage: string | null;
  latestMessageAt: string | null;
}

function relativeTime(value: string | null): string {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleDateString();
}

function amountInPeso(value: number | null | undefined): string {
  return value == null || !Number.isFinite(Number(value)) ? '₱0' : `₱${Number(value).toLocaleString()}`;
}

function notificationPreview(body: string | null): string {
  const text = body?.trim() ?? '';
  if (!text) return 'No additional details.';
  return text.length > 96 ? `${text.slice(0, 96).trimEnd()}...` : text;
}

function notificationDateTime(value: string | null): string {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  const datePart = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

export default function MessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MessageTab>('notifications');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<NotificationRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notificationError, setNotificationError] = useState('');

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    setNotificationError('');

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setLoadError('Sign in to view your messages.');
      setIsLoading(false);
      return;
    }

    const [notificationResult, participationResult] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, type, title, body, related_id, created_at, read_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id),
    ]);

    if (notificationResult.error) {
      console.warn('Failed to load notifications:', notificationResult.error);
      setNotificationError('Notifications could not be loaded. Check your database permissions and try again.');
    }
    const notificationRows = (notificationResult.data ?? []) as NotificationRow[];
    const orderNotificationRows = notificationRows.filter((item) =>
      item.type === 'bid_accepted_client' || item.type === 'bid_accepted_hunter' || item.type === 'bid_accepted'
    );
    const orderIds = [...new Set(orderNotificationRows.map((item) => item.related_id).filter((id): id is string => Boolean(id)))];

    let enrichedNotifications = notificationRows;
    if (orderIds.length) {
      const { data: orderData, error: ordersError } = await supabase
        .from('orders')
        .select('id, client_id, hunter_id, request_id, amount')
        .in('id', orderIds);

      if (ordersError) {
        console.warn('Failed to load notification orders:', ordersError);
      }
      const orders = (orderData ?? []) as OrderRow[];
      const ordersById = new Map(orders.map((order) => [order.id, order]));
      const otherPartyIds = [...new Set(orders.map((order) => user.id === order.client_id ? order.hunter_id : order.client_id))];
      const requestIds = [...new Set(orders.map((order) => order.request_id).filter((id): id is string => Boolean(id)))];

      const [profileResult, requestResult] = await Promise.all([
        otherPartyIds.length
          ? supabase
              .from('profiles')
              .select('id, username, avatar_url, active_role, client_rating, client_rating_count, hunter_rating, hunter_rating_count')
              .in('id', otherPartyIds)
          : Promise.resolve({ data: [], error: null }),
        requestIds.length
          ? supabase.from('service_requests').select('id, title').in('id', requestIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (profileResult.error) console.warn('Failed to load notification counterparties:', profileResult.error);
      if (requestResult.error) console.warn('Failed to load notification request titles:', requestResult.error);

      const profilesById = new Map(((profileResult.data ?? []) as ProfileSummary[]).map((profile) => [profile.id, profile]));
      const titlesById = new Map(((requestResult.data ?? []) as { id: string; title: string }[]).map((request) => [request.id, request.title]));

      enrichedNotifications = notificationRows.map((notification) => {
        if (!orderNotificationRows.some((row) => row.id === notification.id)) return notification;
        const order = notification.related_id ? ordersById.get(notification.related_id) : undefined;
        if (!order) return notification;

        const viewerIsClient = user.id === order.client_id;
        const counterpartyId = viewerIsClient ? order.hunter_id : order.client_id;
        return {
          ...notification,
          counterparty: profilesById.get(counterpartyId) ?? null,
          counterpartyRole: viewerIsClient ? 'Hunter' : 'Client',
          requestTitle: order.request_id ? titlesById.get(order.request_id) ?? null : null,
          orderAmount: Number(order.amount),
        };
      });
    }

    setNotifications(enrichedNotifications);

    if (participationResult.error) {
      console.warn('Failed to load conversation participation:', participationResult.error);
      setConversations([]);
      setIsLoading(false);
      return;
    }

    const conversationIds = [...new Set((participationResult.data ?? []).map((row) => row.conversation_id as string))];
    if (!conversationIds.length) {
      setConversations([]);
      setIsLoading(false);
      return;
    }

    const [conversationResult, otherParticipantsResult, messageResult] = await Promise.all([
      supabase.from('conversations').select('id, created_at').in('id', conversationIds),
      supabase
        .from('conversation_participants')
        .select('conversation_id, user_id, profiles(id, username, avatar_url, active_role, client_rating, client_rating_count, hunter_rating, hunter_rating_count)')
        .in('conversation_id', conversationIds)
        .neq('user_id', user.id),
      supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, attachment_name, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false }),
    ]);

    if (conversationResult.error || otherParticipantsResult.error || messageResult.error) {
      console.warn('Failed to load conversations:', conversationResult.error ?? otherParticipantsResult.error ?? messageResult.error);
      setConversations([]);
      setIsLoading(false);
      return;
    }

    const profileByConversation = new Map<string, ProfileSummary>();
    for (const participant of otherParticipantsResult.data ?? []) {
      const joinedProfile = participant.profiles;
      const profile = Array.isArray(joinedProfile) ? joinedProfile[0] : joinedProfile;
      if (profile) profileByConversation.set(participant.conversation_id, profile as ProfileSummary);
    }
    const latestByConversation = new Map<string, { body: string; attachment_name: string | null; created_at: string | null }>();
    for (const message of messageResult.data ?? []) {
      if (!latestByConversation.has(message.conversation_id)) {
        latestByConversation.set(message.conversation_id, { body: message.body, attachment_name: message.attachment_name, created_at: message.created_at });
      }
    }

    setConversations((conversationResult.data ?? []).map((conversation) => {
      const latest = latestByConversation.get(conversation.id);
      return {
        id: conversation.id,
        created_at: conversation.created_at,
        otherUser: profileByConversation.get(conversation.id) ?? null,
        latestMessage: latest?.body?.trim() || (latest?.attachment_name ? `Attachment: ${latest.attachment_name}` : null),
        latestMessageAt: latest?.created_at ?? conversation.created_at,
      };
    }).sort((first, second) => {
      return new Date(second.latestMessageAt ?? 0).getTime() - new Date(first.latestMessageAt ?? 0).getTime();
    }));
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMessages();
    }, [loadMessages])
  );

  const openNotification = (notification: NotificationRow) => {
    if (notification.type === 'bid_accepted_client' || notification.type === 'bid_accepted_hunter' || notification.type === 'bid_accepted') {
      return;
    }
    setSelectedNotification(notification);
  };

  const displayedCounterpartyRating = (notification: NotificationRow) => {
    const profile = notification.counterparty;
    if (!profile) return { rating: 0, count: 0 };
    return notification.counterpartyRole === 'Hunter'
      ? { rating: Number(profile.hunter_rating ?? 0), count: Number(profile.hunter_rating_count ?? 0) }
      : { rating: Number(profile.client_rating ?? 0), count: Number(profile.client_rating_count ?? 0) };
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.brand}>
          <Text style={styles.brandYellow}>commis</Text><Text style={styles.brandWhite}>.</Text>
        </View>
        <Pressable onPress={() => setIsDrawerOpen(true)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open navigation menu">
          <Svg width={26} height={26} viewBox="0 0 24 24">
            <Path d="M4 6h16M4 12h16M4 18h16" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(['notifications', 'chats'] as const).map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={styles.tabButton} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab }}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab === 'notifications' ? 'Notifications' : 'Chats'}</Text>
            {activeTab === tab ? <View style={styles.tabIndicator} /> : null}
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centerState}><ActivityIndicator color="#FFE600" /><Text style={styles.mutedText}>Loading...</Text></View>
      ) : loadError ? (
        <View style={styles.centerState}><Text style={styles.errorText}>{loadError}</Text><Pressable onPress={() => void loadMessages()}><Text style={styles.retryText}>Try Again</Text></Pressable></View>
      ) : activeTab === 'notifications' ? (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 10) + 86 }]} showsVerticalScrollIndicator={false}>
          {notificationError ? (
            <View style={styles.notificationLoadError}>
              <Text style={styles.errorText}>{notificationError}</Text>
              <Pressable onPress={() => void loadMessages()} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : notifications.length ? notifications.map((notification, index) => {
            const isAccepted = notification.type === 'bid_accepted_client' || notification.type === 'bid_accepted_hunter' || notification.type === 'bid_accepted';
            const rating = displayedCounterpartyRating(notification);
            return (
              <View key={notification.id} style={[styles.notificationRow, index > 0 && styles.rowBorder]}>
                <Pressable onPress={() => openNotification(notification)} style={styles.notificationTop} accessibilityRole="button">
                  {isAccepted && notification.counterparty ? (
                    <ProfileAvatar avatarUrl={notification.counterparty.avatar_url} size={44} style={styles.notificationAvatar} accessibilityLabel="Counterparty profile avatar" />
                  ) : (
                    <View style={styles.logoBadge}>
                      <Image source={require('@/assets/images/logo.png')} style={styles.logoImage} contentFit="contain" />
                    </View>
                  )}
                  <View style={styles.notificationText}>
                    <View style={styles.notificationHeadingRow}>
                      <Text style={styles.notificationTitle} numberOfLines={2}>{notification.title}</Text>
                      <Text style={styles.timeText}>{relativeTime(notification.created_at)}</Text>
                    </View>
                    <Text style={styles.notificationBody} numberOfLines={2}>{notificationPreview(notification.body)}</Text>
                  </View>
                </Pressable>
                {isAccepted ? (
                  <Pressable onPress={() => notification.counterparty && router.push({ pathname: '/profile/[id]', params: { id: notification.counterparty.id } } as any)} style={styles.counterpartyCard} accessibilityRole="button" accessibilityLabel="Open counterparty profile">
                    {notification.counterparty ? (
                      <>
                        <View style={styles.counterpartyInfo}>
                          <Text style={styles.counterpartyName} numberOfLines={1}>
                            {notification.counterparty.username ? `@${notification.counterparty.username}` : notification.counterpartyRole ?? 'Commis member'}
                          </Text>
                          <Text style={styles.counterpartyMeta}>
                            {notification.counterpartyRole} · ★ {rating.rating.toFixed(1)} ({rating.count} reviews)
                          </Text>
                        </View>
                        <View style={styles.profileLink}>
                          <Text style={styles.profileLinkText}>View Profile</Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.counterpartyMeta}>Counterparty profile unavailable.</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          }) : <Text style={styles.emptyTabText}>No notifications yet.</Text>}
        </ScrollView>
      ) : conversations.length ? (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 10) + 86 }]} showsVerticalScrollIndicator={false}>
          {conversations.map((conversation, index) => (
            <Pressable key={conversation.id} onPress={() => router.push({ pathname: '/messages/[id]', params: { id: conversation.id } } as any)} style={[styles.chatRow, index > 0 && styles.rowBorder]} accessibilityRole="button">
              <ProfileAvatar avatarUrl={conversation.otherUser?.avatar_url} size={44} style={styles.chatAvatar} accessibilityLabel="Conversation participant avatar" />
              <View style={styles.chatText}>
                <View style={styles.notificationHeadingRow}>
                  <Text style={styles.notificationTitle} numberOfLines={1}>
                    {conversation.otherUser?.username ? `@${conversation.otherUser.username}` : 'Commis member'}
                  </Text>
                  <Text style={styles.timeText}>{relativeTime(conversation.latestMessageAt)}</Text>
                </View>
                <MarkdownText style={styles.notificationBody} numberOfLines={1}>{notificationPreview(conversation.latestMessage)}</MarkdownText>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Image source={require('@/assets/images/nothing-to-see-here-cat.png')} style={styles.emptyCat} contentFit="contain" />
          <Text style={styles.emptyText}>No conversations yet.</Text>
        </View>
      )}

      <BottomNavBar activeTab="messages" />
      <NavigationDrawer visible={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

      <Modal visible={Boolean(selectedNotification)} transparent animationType="fade" onRequestClose={() => setSelectedNotification(null)}>
        <View style={[styles.detailScreen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.detailHeader}>
            <Pressable onPress={() => setSelectedNotification(null)} style={styles.detailBackButton} accessibilityRole="button" accessibilityLabel="Back to notifications">
              <Svg width={23} height={23} viewBox="0 0 24 24">
                <Path d="M19 12H5m0 0 7-7m-7 7 7 7" stroke="#E5E2E1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
            <View style={styles.detailLogoBadge}>
              <Image source={require('@/assets/images/logo.png')} style={styles.detailLogo} contentFit="contain" />
            </View>
            <Text style={styles.detailHeaderTitle}>Notification Detail</Text>
          </View>
          {selectedNotification ? (
            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.detailTitle}>{selectedNotification.title}</Text>
              <Text style={styles.detailTime}>{notificationDateTime(selectedNotification.created_at)}</Text>
              <Text style={styles.detailBody}>{selectedNotification.body?.trim() || 'No details provided.'}</Text>
              {selectedNotification.type === 'bid_invitation' && selectedNotification.related_id ? (
                <Pressable
                  onPress={() => {
                    const id = selectedNotification.related_id;
                    setSelectedNotification(null);
                    router.push(`/service-request/${id}` as any);
                  }}
                  style={styles.disputeAction}
                  accessibilityRole="button">
                  <Text style={styles.disputeActionText}>View Request</Text>
                </Pressable>
              ) : null}
              {selectedNotification.type === 'review_requested' && selectedNotification.related_id ? (
                <Pressable
                  onPress={() => {
                    const id = selectedNotification.related_id;
                    setSelectedNotification(null);
                    router.push({ pathname: '/commissions/[id]', params: { id, review: '1' } } as any);
                  }}
                  style={styles.disputeAction}
                  accessibilityRole="button">
                  <Text style={styles.disputeActionText}>Write a Review</Text>
                </Pressable>
              ) : null}
              {selectedNotification.type.startsWith('dispute_') && selectedNotification.related_id ? (
                <Pressable
                  onPress={() => {
                    const id = selectedNotification.related_id;
                    setSelectedNotification(null);
                    router.push({ pathname: '/disputes/[id]', params: { id } } as any);
                  }}
                  style={styles.disputeAction}
                  accessibilityRole="button">
                  <Text style={styles.disputeActionText}>
                    {selectedNotification.type === 'dispute_decision_needed' ? 'Open Resolution' : 'View Dispute'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 10 },
  brand: { flexDirection: 'row', alignItems: 'baseline' },
  brandYellow: { color: '#FFE600', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  brandWhite: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 38, lineHeight: 38 },
  menuButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  menuIcon: { width: 27, height: 27 },
  tabs: { height: 52, flexDirection: 'row', alignItems: 'stretch', gap: 26, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#222222' },
  tabButton: { justifyContent: 'center' },
  tabText: { color: '#999999', fontFamily: 'Roboto', fontSize: 14 },
  tabTextActive: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold' },
  tabIndicator: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: 2, backgroundColor: '#FFE600' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  mutedText: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 13 },
  errorText: { color: '#FF7676', fontFamily: 'Roboto', fontSize: 13, textAlign: 'center' },
  retryText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  notificationLoadError: { alignItems: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 12 },
  retryButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, backgroundColor: '#2A2A2A' },
  list: { paddingHorizontal: 20, paddingVertical: 16 },
  notificationRow: { paddingVertical: 14, gap: 11 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#242424' },
  notificationTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  logoBadge: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 22, backgroundColor: '#FFE600' },
  logoImage: { width: 44, height: 44, borderRadius: 22 },
  notificationAvatar: { borderWidth: 1, borderColor: '#3A3A3A' },
  notificationText: { flex: 1, minWidth: 0, paddingTop: 2 },
  notificationHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  notificationTitle: { flex: 1, color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 13, lineHeight: 18 },
  timeText: { color: '#737373', fontFamily: 'Roboto', fontSize: 10 },
  notificationBody: { marginTop: 3, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12, lineHeight: 17 },
  counterpartyCard: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 56, padding: 10, borderRadius: 11, backgroundColor: '#1A1A1A' },
  counterpartyInfo: { flex: 1, minWidth: 0, gap: 3 },
  counterpartyName: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  counterpartyMeta: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 10 },
  profileLink: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: '#2A2A2A' },
  profileLinkText: { color: '#FFE600', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  chatRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  chatAvatar: { borderWidth: 1, borderColor: '#3A3A3A' },
  chatText: { flex: 1, minWidth: 0 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  emptyCat: { width: 172, height: 150 },
  emptyText: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 14 },
  emptyTabText: { paddingVertical: 24, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 13, textAlign: 'center' },
  detailScreen: { flex: 1, backgroundColor: '#131313' },
  detailHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 24 },
  detailBackButton: { width: 34, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  detailLogoBadge: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 19, backgroundColor: '#FFE600' },
  detailLogo: { width: 38, height: 38, borderRadius: 19 },
  detailHeaderTitle: { color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 18 },
  detailContent: { paddingHorizontal: 24, paddingTop: 37, paddingBottom: 30, gap: 8 },
  detailTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 34, lineHeight: 41 },
  detailTime: { color: '#C8C6B9', fontFamily: 'RobotoExtraBold', fontSize: 13, marginBottom: 19 },
  detailBody: { color: '#D0CECF', fontFamily: 'Roboto', fontSize: 18, lineHeight: 28 },
  disputeAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20, paddingHorizontal: 16, backgroundColor: '#FFE600', borderRadius: 12 },
  disputeActionText: { color: '#121212', fontFamily: 'RobotoExtraBold', fontSize: 14 },
});
