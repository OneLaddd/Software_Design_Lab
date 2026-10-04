import React from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MessageCircle, Share2 } from 'lucide-react-native';
import { ProfileAvatar } from '@/components/profile-avatar';
import { PostVoteBar } from '@/components/post-vote-bar';
import { MarkdownText } from '@/components/markdown-text';

export type PostWithRelations = {
  id: string; title: string | null; body: string | null; media_url: string | null; created_at: string | null; view_count?: number | null;
  author_id: string; community_id: string | null;
  author?: { id: string; username: string | null; avatar_url: string | null } | null;
  community?: { id: string; name: string; icon_url?: string | null } | null;
  commentCount?: number;
};

function relativeTime(value: string | null): string {
  if (!value) return '';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatViews(value: number | null | undefined): string {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return count.toLocaleString();
}

export function PostCard({ post, score, userVote, onVote, joined = false, onToggleJoin, showJoinButton = true, showAuthor = false, onOpen }: {
  post: PostWithRelations; score: number; userVote: -1 | 0 | 1; onVote: (value: -1 | 1) => void;
  joined?: boolean; onToggleJoin?: () => void; showJoinButton?: boolean; showAuthor?: boolean; onOpen?: () => void;
}) {
  const router = useRouter();
  const open = onOpen ?? (() => router.push({ pathname: '/posts/[id]', params: { id: post.id } } as any));
  const community = post.community;
  return <View style={styles.card}>
    <View style={styles.header}>
      {showAuthor ? <Pressable onPress={() => post.author && router.push({ pathname: '/profile/[id]', params: { id: post.author.id } } as any)} disabled={!post.author} style={styles.authorRow} accessibilityRole="button">
        <ProfileAvatar avatarUrl={post.author?.avatar_url} size={36} />
        <View style={styles.communityCopy}><Text style={styles.authorName}>@{post.author?.username ?? 'member'} <Text style={styles.authorTime}>· {relativeTime(post.created_at)} ago</Text></Text></View>
      </Pressable> : <Pressable onPress={() => community && router.push({ pathname: '/communities/[id]', params: { id: community.id } } as any)} disabled={!community} style={styles.communityRow} accessibilityRole="button" accessibilityLabel={community?.name ?? 'Commis community'}>
        {community?.icon_url ? <Image source={{ uri: community.icon_url }} contentFit="cover" style={styles.communityAvatar} /> : <View style={styles.communityAvatarFallback}><Text style={styles.communityInitial}>{community?.name?.replace(/^c\//i, '').charAt(0).toUpperCase() ?? 'C'}</Text></View>}
        <View style={styles.communityCopy}><Text style={styles.communityName} numberOfLines={1}>{community?.name ?? 'Commis'}</Text><Text style={styles.communityMeta}>{relativeTime(post.created_at)}{relativeTime(post.created_at) ? ' | ' : ''}{formatViews(post.view_count)} views</Text></View>
      </Pressable>}
      {!showAuthor && community && showJoinButton ? <Pressable onPress={onToggleJoin} style={[styles.joinButton, joined && styles.joinedButton]} accessibilityRole="button" accessibilityLabel={joined ? 'Leave community' : 'Join community'} accessibilityState={{ selected: joined }}><Text style={[styles.joinMark, joined && styles.joinedMark]}>＋</Text></Pressable> : null}
    </View>
    <Pressable onPress={open} accessibilityRole="button">
      {post.title ? <Text style={styles.title}>{post.title}</Text> : null}
      {post.body ? <MarkdownText style={styles.body} numberOfLines={3}>{post.body}</MarkdownText> : null}
      {post.media_url ? <Image source={{ uri: post.media_url }} contentFit="cover" style={styles.media} /> : null}
    </Pressable>
    <View style={styles.footer}>
      <PostVoteBar score={score} userVote={userVote} onVote={onVote} compact />
      <Pressable onPress={open} style={styles.iconAction} accessibilityRole="button" accessibilityLabel="Open post replies"><MessageCircle size={18} color="#B7B7B7" /><Text style={styles.count}>{post.commentCount ?? 0}</Text></Pressable>
      <Pressable onPress={() => Share.share({ message: post.title ?? post.body ?? 'Commis post' })} style={[styles.iconAction, styles.shareAction]} accessibilityRole="button" accessibilityLabel="Share post"><Share2 size={18} color="#B7B7B7" /></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 15, marginBottom: 12, borderRadius: 16, padding: 13, backgroundColor: '#1D1D1D', borderWidth: 1, borderColor: '#292929' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  communityRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  communityAvatar: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#202020' },
  communityAvatarFallback: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#202020', borderWidth: 1, borderColor: '#343434' },
  communityInitial: { color: '#C9C9C9', fontFamily: 'RobotoExtraBold', fontSize: 14 },
  communityCopy: { flex: 1, minWidth: 0 },
  communityName: { color: '#F2F2F2', fontFamily: 'RobotoExtraBold', fontSize: 13 },
  communityMeta: { color: '#929292', fontFamily: 'Roboto', fontSize: 10, marginTop: 3 },
  joinButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FFFFFF' },
  joinedButton: { backgroundColor: '#353535', borderColor: '#505050' },
  joinMark: { color: '#151515', fontFamily: 'Roboto', fontSize: 23, lineHeight: 25, marginTop: -2 },
  joinedMark: { color: '#898989' },
  authorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  authorName: { color: '#E8E8E8', fontFamily: 'RobotoExtraBold', fontSize: 11 },
  authorTime: { color: '#A3A3A3', fontFamily: 'Roboto', fontSize: 11 },
  title: { color: '#FFF', fontFamily: 'RobotoExtraBold', fontSize: 17, lineHeight: 23, marginBottom: 7 },
  body: { color: '#D2D2D2', fontFamily: 'Roboto', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  media: { width: '100%', aspectRatio: 1.05, borderRadius: 12, backgroundColor: '#111', marginTop: 3 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  iconAction: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 18, borderWidth: 1, borderColor: '#3A3A3A' },
  shareAction: { width: 36, paddingHorizontal: 0, marginLeft: 'auto' },
  count: { color: '#D0D0D0', fontFamily: 'RobotoExtraBold', fontSize: 11 },
});
