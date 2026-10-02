import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { NavigationDrawer } from '@/components/navigation-drawer';
import { supabase } from '@/lib/supabase';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
}

interface RequestCategoryJoin {
  category_id: string;
  categories: CategoryItem | CategoryItem[] | null;
}

interface ServiceRequestRow {
  id: string;
  client_id: string;
  title: string;
  description: string;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
  request_categories?: RequestCategoryJoin[];
}

interface BidStat {
  count: number;
  avg: number;
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} mo${diffMonths > 1 ? 's' : ''} ago`;
}

function formatCategoryTags(requestCategories?: RequestCategoryJoin[]): string {
  if (!requestCategories || requestCategories.length === 0) {
    return '';
  }

  const names: string[] = [];
  for (const item of requestCategories) {
    if (item.categories) {
      if (Array.isArray(item.categories)) {
        for (const cat of item.categories) {
          if (cat?.name) names.push(cat.name);
        }
      } else if (item.categories.name) {
        names.push(item.categories.name);
      }
    }
  }

  if (names.length === 0) return '';
  if (names.length <= 2) return names.join(' | ');
  return `${names[0]} | ${names[1]} | ${names.length - 2} more`;
}

function formatBudgetRange(min: number | null, max: number | null, currency: string | null): string {
  const curr = currency || 'USD';
  const sym = curr === 'PHP' ? '₱' : '$';

  if (min != null && max != null) {
    return `${sym}${min.toLocaleString()} - ${sym}${max.toLocaleString()} ${curr}`;
  }
  if (min != null) {
    return `From ${sym}${min.toLocaleString()} ${curr}`;
  }
  if (max != null) {
    return `Up to ${sym}${max.toLocaleString()} ${curr}`;
  }
  return `Budget Negotiable (${curr})`;
}

export default function MarketplaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [bidStats, setBidStats] = useState<Record<string, BidStat>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch service requests joining request_categories -> categories
      const { data: reqData, error: reqError } = await supabase
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
            categories (
              id,
              name,
              slug
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (reqError) {
        console.warn('Failed to load service requests:', reqError);
      }

      // 2. Fetch bids to compute count and average bid grouped by request_id
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('request_id, amount');

      if (bidsError) {
        console.warn('Failed to load bids for stats:', bidsError);
      }

      const stats: Record<string, BidStat> = {};
      if (bidsData) {
        const aggregations: Record<string, { count: number; sum: number }> = {};
        for (const bid of bidsData) {
          if (!aggregations[bid.request_id]) {
            aggregations[bid.request_id] = { count: 0, sum: 0 };
          }
          aggregations[bid.request_id].count += 1;
          aggregations[bid.request_id].sum += Number(bid.amount) || 0;
        }

        for (const reqId in aggregations) {
          stats[reqId] = {
            count: aggregations[reqId].count,
            avg: Math.round(aggregations[reqId].sum / aggregations[reqId].count),
          };
        }
      }

      setBidStats(stats);
      setRequests(reqData || []);
    } catch (err) {
      console.warn('Error fetching marketplace data:', err);
      setRequests([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const renderItem = ({ item }: { item: ServiceRequestRow }) => {
    const stats = bidStats[item.id] || { count: 0, avg: 0 };
    const curr = item.currency || 'USD';
    const sym = curr === 'PHP' ? '₱' : '$';
    const budgetText = formatBudgetRange(item.budget_min, item.budget_max, item.currency);
    const categoryText = formatCategoryTags(item.request_categories);
    const relativeTime = formatRelativeTime(item.created_at);

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push(`/service-request/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={item.title}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardBudget}>{budgetText}</Text>
        <View style={styles.bidStatsRow}>
          <Text style={styles.bidStatsText}>
            {stats.count} {stats.count === 1 ? 'Bid' : 'Bids'}
          </Text>
          <Text style={styles.bidStatsDot}>•</Text>
          <Text style={styles.bidStatsText}>
            {sym}
            {stats.avg.toLocaleString()} {curr} Average Bid
          </Text>
        </View>
        <Text style={styles.cardDescription} numberOfLines={2} ellipsizeMode="tail">
          {item.description}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.categoryTags} numberOfLines={1}>
            {categoryText}
          </Text>
          <Text style={styles.relativeTime}>{relativeTime}</Text>
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Image
          source={require('@/assets/images/nothing-to-see-here-cat.png')}
          style={styles.emptyCatImage}
          contentFit="contain"
        />
        <Text style={styles.emptyText}>Nothing to show here.</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.logoRow}>
          <Text style={styles.logoYellow}>commis</Text>
          <Text style={styles.logoWhite}>.</Text>
        </View>
        <Pressable
          onPress={() => setIsDrawerOpen(true)}
          style={({ pressed }) => [styles.hamburgerButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu">
          <Svg width={26} height={26} viewBox="0 0 24 24">
            <Path d="M4 6h16M4 12h16M4 18h16" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>

      {/* Search and Filter Section */}
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Svg width={18} height={18} viewBox="0 0 24 24" style={styles.searchBarIcon}>
              <Circle cx={11} cy={11} r={7} stroke="#D1D5DB" strokeWidth={2} fill="none" />
              <Line x1={16.5} y1={16.5} x2={21} y2={21} stroke="#D1D5DB" strokeWidth={2} strokeLinecap="round" />
            </Svg>
            <TextInput
              style={styles.searchInput}
              placeholder="Search Service Requests"
              placeholderTextColor="#8E8E93"
              editable={false}
              accessibilityLabel="Search Service Requests"
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Sort and Filter">
            <Svg width={22} height={22} viewBox="0 0 24 24" style={styles.sortIcon}>
              <Path d="M3 5h14v2H3V5zm0 6h10v2H3v-2zm0 6h6v2H3v-2z" fill="#FFFFFF" />
              <Path d="M19 10v7.17l2.59-2.58L23 16l-5 5-5-5 1.41-1.41L17 17.17V10h2z" fill="#FFFFFF" />
            </Svg>
          </Pressable>
        </View>

        {/* Sorted By Status Subheader */}
        <View style={styles.sortedByContainer}>
          <Text style={styles.sortedByText}>Sorted by Latest Results</Text>
        </View>
      </View>

      {/* Requests List or Centered Empty State */}
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          requests.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#FFE600"
            colors={['#FFE600']}
          />
        }
      />

      {/* Floating Action Button (FAB) */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: Math.max(insets.bottom, 6) + 68 },
          pressed && styles.fabPressed,
        ]}
        onPress={() => router.push('/post-bounty')}
        accessibilityRole="button"
        accessibilityLabel="Add New Bounty">
        <Image
          source={require('@/assets/svgs/39_add_button.svg')}
          style={styles.fabIcon}
          contentFit="contain"
          tintColor="#000000"
        />
      </Pressable>

      {/* Bottom Navigation Bar */}
      <BottomNavBar activeTab="market" />

      {/* Hamburger Navigation Drawer */}
      <NavigationDrawer
        visible={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  logoYellow: {
    color: '#FFE600',
    fontFamily: 'LeagueSpartanExtraBold',
    fontSize: 38,
    lineHeight: 38,
  },
  logoWhite: {
    color: '#FFFFFF',
    fontFamily: 'LeagueSpartanExtraBold',
    fontSize: 38,
    lineHeight: 38,
  },
  hamburgerButton: {
    padding: 6,
  },
  hamburgerIcon: {
    width: 26,
    height: 26,
  },
  pressed: {
    opacity: 0.7,
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    height: 42,
    backgroundColor: '#202020',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchBarIcon: {
    width: 18,
    height: 18,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#E5E2E1',
    fontSize: 14,
    paddingVertical: 0,
  },
  sortButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortIcon: {
    width: 22,
    height: 22,
  },
  sortedByContainer: {
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
  },
  sortedByText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    gap: 5,
  },
  cardPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  cardBudget: {
    color: '#FFE600',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  bidStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bidStatsText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '400',
  },
  bidStatsDot: {
    color: '#8E8E93',
    fontSize: 12,
  },
  cardDescription: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
    paddingTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  categoryTags: {
    flex: 1,
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '500',
    marginRight: 8,
  },
  relativeTime: {
    color: '#71717A',
    fontSize: 11,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyCatImage: {
    width: 170,
    height: 170,
  },
  emptyText: {
    color: '#8E8E93',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    zIndex: 40,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
  },
  fabIcon: {
    width: 22,
    height: 22,
  },
});
