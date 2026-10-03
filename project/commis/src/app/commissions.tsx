import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

type Order = {
  id: string;
  request_id: string | null;
  client_id: string;
  hunter_id: string;
  amount: number;
  status: string;
  created_at: string;
  request?: { title: string } | null;
  client?: { username: string | null } | null;
  hunter?: { username: string | null } | null;
};

type Perspective = 'client' | 'hunter';

const STATUS_FILTERS = ['All', 'Active', 'Completed', 'Disputed', 'Cancelled'];
const ACTIVE_STATUSES = ['created', 'escrow_locked', 'in_progress', 'delivered'];
const STATUS_LABELS: Record<string, string> = {
  created: 'Awaiting escrow',
  escrow_locked: 'Escrow locked',
  in_progress: 'In progress',
  delivered: 'Delivered',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

function formatPeso(amount: number): string {
  return `₱${Number(amount || 0).toLocaleString()}`;
}

export default function CommissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [perspective, setPerspective] = useState<Perspective>('hunter');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setErrorMessage('Sign in to view your commissions.');
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setUserId(auth.user.id);

    const { data, error: orderError } = await supabase
      .from('orders')
      .select('id, request_id, client_id, hunter_id, amount, status, created_at')
      .or(`client_id.eq.${auth.user.id},hunter_id.eq.${auth.user.id}`)
      .order('created_at', { ascending: false });

    if (orderError) {
      setErrorMessage(orderError.message);
      setOrders([]);
      setIsLoading(false);
      return;
    }

    const fetchedOrders = (data ?? []) as Order[];
    const requestIds = [
      ...new Set(
        fetchedOrders
          .map((order) => order.request_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const profileIds = [
      ...new Set(fetchedOrders.flatMap((order) => [order.client_id, order.hunter_id])),
    ];

    const [requestsResult, profilesResult] = await Promise.all([
      requestIds.length
        ? supabase.from('service_requests').select('id, title').in('id', requestIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? supabase.from('profiles').select('id, username').in('id', profileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const requestTitles = new Map(
      (requestsResult.data ?? []).map((request: any) => [request.id, request.title]),
    );
    const usernames = new Map(
      (profilesResult.data ?? []).map((profile: any) => [profile.id, profile.username]),
    );

    setOrders(
      fetchedOrders.map((order) => ({
        ...order,
        request: {
          title: order.request_id
            ? requestTitles.get(order.request_id) || 'Commission'
            : 'Commission',
        },
        client: { username: usernames.get(order.client_id) || null },
        hunter: { username: usernames.get(order.hunter_id) || null },
      })),
    );
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

  const visibleOrders = orders.filter((order) => {
    const belongsToPerspective =
      perspective === 'client'
        ? order.client_id === userId
        : order.hunter_id === userId;

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Active'
        ? ACTIVE_STATUSES.includes(order.status)
        : statusFilter.toLowerCase() === order.status);

    const otherPartyUsername =
      perspective === 'client' ? order.hunter?.username : order.client?.username;
    const searchTarget = `${order.request?.title} ${otherPartyUsername} ${STATUS_LABELS[order.status]}`;
    const matchesSearch = searchTarget.toLowerCase().includes(searchQuery.toLowerCase());

    return belongsToPerspective && matchesStatus && matchesSearch;
  });

  const hasOrdersInPerspective = orders.some((order) =>
    perspective === 'client' ? order.client_id === userId : order.hunter_id === userId,
  );

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Commissions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.perspectiveSwitch}>
          {(['client', 'hunter'] as const).map((role) => {
            const selected = perspective === role;
            return (
              <Pressable
                key={role}
                onPress={() => setPerspective(role)}
                style={[styles.perspectiveTab, selected && styles.perspectiveTabSelected]}>
                <Text style={[styles.perspectiveText, selected && styles.perspectiveTextSelected]}>
                  {role === 'client' ? 'As Client' : 'As Hunter'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.subtitle}>
          {perspective === 'client'
            ? 'Commissions you posted and hired a hunter for'
            : 'Commissions where a client hired you'}
        </Text>

        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search commissions..."
          placeholderTextColor="#777"
          style={styles.searchInput}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusFilters}>
          {STATUS_FILTERS.map((filter) => {
            const selected = statusFilter === filter;
            return (
              <Pressable
                key={filter}
                onPress={() => setStatusFilter(filter)}
                style={[styles.filterPill, selected && styles.filterPillSelected]}>
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                  {filter}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator color="#ffe600" style={styles.loadingIndicator} />
        ) : errorMessage ? (
          <Text style={styles.emptyState}>{errorMessage}</Text>
        ) : visibleOrders.length === 0 ? (
          <Text style={styles.emptyState}>
            {hasOrdersInPerspective
              ? 'No commissions match your search.'
              : perspective === 'client'
                ? 'Commissions you post and hire for will appear here.'
                : 'Commissions where a client hires you will appear here.'}
          </Text>
        ) : (
          visibleOrders.map((order) => (
            <CommissionCard
              key={order.id}
              order={order}
              perspective={perspective}
              onPress={() => router.push(`/commissions/${order.id}` as any)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function CommissionCard({
  order,
  perspective,
  onPress,
}: {
  order: Order;
  perspective: Perspective;
  onPress: () => void;
}) {
  const otherParty = perspective === 'client' ? order.hunter : order.client;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, order.status === 'disputed' && styles.disputedCard]}>
      <View style={styles.cardRow}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {order.request?.title}
        </Text>
        <Text style={styles.statusBadge}>{STATUS_LABELS[order.status] || order.status}</Text>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.counterparty}>
          @{otherParty?.username || 'user'} · {perspective === 'client' ? 'Hunter' : 'Client'}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>

      <View style={[styles.cardRow, styles.cardFooter]}>
        <Text style={styles.amount}>{formatPeso(order.amount)}</Text>
        <Text style={styles.date}>Created {new Date(order.created_at).toLocaleDateString()}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: {
    width: 36,
  },
  backButtonText: {
    fontSize: 32,
    lineHeight: 36,
    color: '#aaa',
  },
  title: {
    color: '#f2f2f2',
    fontSize: 19,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 32,
  },
  perspectiveSwitch: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginBottom: 12,
    backgroundColor: '#1a1919',
    borderColor: '#2b2a2a',
    borderWidth: 1,
    borderRadius: 12,
  },
  perspectiveTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  perspectiveTabSelected: {
    backgroundColor: '#ffe600',
  },
  perspectiveText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
  },
  perspectiveTextSelected: {
    color: '#121212',
    fontWeight: '800',
  },
  subtitle: {
    color: '#888',
    fontSize: 12,
    marginBottom: 14,
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center'
  },
  searchInput: {
    height: 42,
    paddingHorizontal: 14,
    color: '#f2f2f2',
    fontSize: 14,
    backgroundColor: '#1a1919',
    borderColor: '#2b2a2a',
    borderWidth: 1,
    borderRadius: 12,
  },
  statusFilters: {
    gap: 8,
    paddingVertical: 14,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1a1919',
    borderColor: '#2b2a2a',
    borderWidth: 1,
    borderRadius: 20,
  },
  filterPillSelected: {
    backgroundColor: '#ffe600',
    borderColor: '#ffe600',
  },
  filterText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextSelected: {
    color: '#121212',
  },
  loadingIndicator: {
    marginTop: 45,
  },
  emptyState: {
    marginTop: 48,
    paddingHorizontal: 20,
    color: '#888',
    textAlign: 'center',
  },
  card: {
    gap: 11,
    marginBottom: 10,
    paddingHorizontal: 15,
    paddingVertical: 13,
    backgroundColor: '#181818',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 12,
  },
  disputedCard: {
    backgroundColor: '#201516',
    borderColor: '#56252a',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: '#f2f2f2',
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    color: '#c8c6c8',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#242424',
    borderColor: '#363636',
    borderWidth: 1,
    borderRadius: 20,
  },
  counterparty: {
    color: '#ddd',
    fontSize: 12,
  },
  chevron: {
    color: '#777',
    fontSize: 22,
  },
  cardFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#292929',
  },
  amount: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  date: {
    color: '#888',
    fontSize: 10,
  },
});
