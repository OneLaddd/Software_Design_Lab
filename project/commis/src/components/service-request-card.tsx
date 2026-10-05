import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { MarkdownText } from '@/components/markdown-text';

export interface ServiceRequestCategory {
  category_id: string;
  categories: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null;
}

export interface ServiceRequestCardData {
  id: string;
  title: string;
  description: string;
  budget_min: number | null;
  budget_max: number | null;
  created_at: string;
  request_categories?: ServiceRequestCategory[];
}

interface ServiceRequestCardProps {
  request: ServiceRequestCardData;
  bidCount: number;
  averageBid: number;
  onPress: () => void;
  isSaved?: boolean;
  onToggleSaved?: () => void;
  actionLabel?: string;
  disabledActionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}

function formatRelativeTime(dateString: string): string {
  const timestamp = new Date(dateString).getTime();
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return `${Math.floor(diffDays / 30)} mo ago`;
}

function formatCategoryTags(categories?: ServiceRequestCategory[]): string {
  const names = (categories ?? []).flatMap((link) => {
    if (!link.categories) return [];
    return Array.isArray(link.categories) ? link.categories.map((category) => category.name) : [link.categories.name];
  });
  if (names.length === 0) return 'No categories';
  if (names.length <= 2) return names.join(' | ');
  return `${names[0]} | ${names[1]} | ${names.length - 2} more`;
}

function formatBudget(minimum: number | null, maximum: number | null): string {
  if (minimum != null && maximum != null) return `₱${minimum.toLocaleString()} - ₱${maximum.toLocaleString()} PHP`;
  if (minimum != null) return `From ₱${minimum.toLocaleString()} PHP`;
  if (maximum != null) return `Up to ₱${maximum.toLocaleString()} PHP`;
  return 'Budget not set (PHP)';
}

export function ServiceRequestCard({
  request,
  bidCount,
  averageBid,
  onPress,
  isSaved,
  onToggleSaved,
  actionLabel,
  disabledActionLabel,
  actionDisabled = false,
  onAction,
}: ServiceRequestCardProps) {
  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.cardContent, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={request.title}>
        <View style={[styles.titleRow, (onAction || onToggleSaved) && styles.titleRowWithAction]}>
          <Text style={styles.cardTitle} numberOfLines={2}>{request.title}</Text>
        </View>
        <Text style={styles.cardBudget}>{formatBudget(request.budget_min, request.budget_max)}</Text>
        <View style={styles.bidStatsRow}>
          <Text style={styles.bidStatsText}>{bidCount} {bidCount === 1 ? 'Bid' : 'Bids'}</Text>
          <Text style={styles.bidStatsText}>•</Text>
          <Text style={styles.bidStatsText}>₱{averageBid.toLocaleString()} PHP Average Bid</Text>
        </View>
        <MarkdownText style={styles.cardDescription} numberOfLines={2}>{request.description}</MarkdownText>
        <View style={styles.cardFooter}>
          <Text style={styles.categoryTags} numberOfLines={1}>{formatCategoryTags(request.request_categories)}</Text>
          <Text style={styles.relativeTime}>{formatRelativeTime(request.created_at)}</Text>
        </View>
      </Pressable>
      {onAction ? (
        <Pressable
          onPress={onAction}
          disabled={actionDisabled}
          style={[styles.actionButton, styles.topAction, actionDisabled && styles.actionButtonDisabled]}
          accessibilityRole="button">
          <Text style={[styles.actionButtonText, actionDisabled && styles.actionButtonTextDisabled]}>{actionDisabled ? disabledActionLabel ?? 'Invited' : actionLabel ?? 'Invite'}</Text>
        </Pressable>
      ) : onToggleSaved ? (
        <Pressable
          onPress={onToggleSaved}
          style={[styles.saveButton, styles.topAction]}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? 'Remove from marked bounties' : 'Mark bounty'}>
          <SymbolView
            name={{ ios: isSaved ? 'bookmark.fill' : 'bookmark', android: isSaved ? 'bookmark' : 'bookmark_border', web: isSaved ? 'bookmark' : 'bookmark_border' }}
            size={21}
            tintColor={isSaved ? '#FFE600' : '#A6A6AB'}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'relative', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#262626' },
  cardContent: { gap: 5 },
  cardPressed: { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleRowWithAction: { paddingRight: 42 },
  cardTitle: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600', lineHeight: 20, letterSpacing: -0.2 },
  saveButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginTop: -5, marginRight: -5, borderRadius: 15 },
  topAction: { position: 'absolute', top: 11, right: 0 },
  actionButton: { minWidth: 68, minHeight: 32, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#FFE600' },
  actionButtonDisabled: { backgroundColor: '#302F1C' },
  actionButtonText: { color: '#201C00', fontSize: 11, fontWeight: '700' },
  actionButtonTextDisabled: { color: '#C4B840' },
  cardBudget: { color: '#FFE600', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  bidStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bidStatsText: { color: '#8E8E93', fontSize: 12, fontWeight: '400' },
  cardDescription: { color: '#D1D5DB', fontSize: 13, lineHeight: 18, paddingTop: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  categoryTags: { flex: 1, color: '#8E8E93', fontSize: 11, fontWeight: '500', marginRight: 8 },
  relativeTime: { color: '#71717A', fontSize: 11 },
});
