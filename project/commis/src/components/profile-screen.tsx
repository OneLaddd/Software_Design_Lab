import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';
import { MarkdownText } from '@/components/markdown-text';

type Profile = { id: string; username: string | null; avatar_url: string | null; bio: string | null; active_role: 'client' | 'hunter' | null; created_at: string | null; hunter_rating: number | null; hunter_rating_count: number | null; client_rating: number | null; client_rating_count: number | null };
type Portfolio = { id: string; title: string; subtitle: string | null; description: string | null; skills: string[] | null; project_url: string | null; category_id: string | null; image_url: string | null; created_at: string; categoryName?: string };
type Post = { id: string; title: string | null; body: string | null; media_url: string | null; created_at: string };
type Review = { id: string; reviewer_id: string; rating: number; comment: string | null; created_at: string; reviewer?: { username: string | null; avatar_url: string | null } };
type Commission = { id: string; request_id: string | null; title: string | null; role: 'client' | 'hunter'; completed_at: string | null };
type Tab = 'Portfolio' | 'Posts' | 'Commissions' | 'Reviews';
const tabs: Tab[] = ['Portfolio', 'Posts', 'Commissions', 'Reviews'];
const yellow = '#FFE600';

function EmptyState({ label }: { label: string }) {
  return <View style={styles.empty}><Image source={require('@/assets/images/nothing-to-see-here-cat.png')} style={styles.cat} contentFit="contain" /><Text style={styles.emptyText}>{label}</Text></View>;
}

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return <View style={styles.header}><Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><Svg width={22} height={22} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6M9 12h12" stroke="#E5E2E1" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg></Pressable><Text style={styles.headerTitle}>{title}</Text><View style={styles.headerRight}>{right}</View></View>;
}

export function ProfileScreen({ own = false }: { own?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [tab, setTab] = useState<Tab>('Portfolio');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    setViewerId(user?.id ?? null);
    const targetId = own ? user?.id : routeId;
    if (!targetId) { setProfile(null); setLoading(false); if (own) setError('Sign in to view your profile.'); return; }
    const { data: userProfile, error: profileError } = await supabase.from('profiles').select('id, username, avatar_url, bio, active_role, created_at, hunter_rating, hunter_rating_count, client_rating, client_rating_count').eq('id', targetId).maybeSingle();
    if (profileError || !userProfile) { setError(profileError?.message ?? 'Profile not found.'); setLoading(false); return; }
    setProfile(userProfile as Profile);
    const [portfolioResult, postsResult, commissionResult, reviewResult] = await Promise.all([
      supabase.from('portfolio_entries').select('id, title, subtitle, description, skills, project_url, category_id, image_url, created_at').eq('user_id', targetId).order('created_at', { ascending: false }),
      supabase.from('posts').select('id, title, body, media_url, created_at').eq('author_id', targetId).order('created_at', { ascending: false }),
      supabase.rpc('get_public_profile_commissions', { p_profile_id: targetId }),
      supabase.from('reviews').select('id, reviewer_id, rating, comment, created_at').eq('reviewee_id', targetId).order('created_at', { ascending: false }),
    ]);
    const errors = [
      portfolioResult.error && `Portfolio: ${portfolioResult.error.message}`,
      postsResult.error && `Posts: ${postsResult.error.message}`,
      commissionResult.error && `Commissions: ${commissionResult.error.message}`,
      reviewResult.error && `Reviews: ${reviewResult.error.message}`,
    ].filter((message): message is string => Boolean(message));
    if (errors.length) setError(errors.join(' · '));
    const portfolioRows = (portfolioResult.data ?? []) as Portfolio[];
    if (portfolioRows.length) {
      const ids = [...new Set(portfolioRows.map((row) => row.category_id).filter((id): id is string => Boolean(id)))];
      const categories = ids.length ? await supabase.from('categories').select('id, name').in('id', ids) : { data: [], error: null };
      const names = new Map((categories.data ?? []).map((category) => [category.id, category.name]));
      setPortfolio(portfolioRows.map((row) => ({ ...row, categoryName: row.category_id ? names.get(row.category_id) : undefined })));
    } else setPortfolio([]);
    setPosts((postsResult.data ?? []) as Post[]);
    setCommissions((commissionResult.data ?? []) as Commission[]);
    const reviewRows = (reviewResult.data ?? []) as Review[];
    if (reviewRows.length) {
      const ids = [...new Set(reviewRows.map((row) => row.reviewer_id))];
      const reviewerResult = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
      const reviewers = new Map((reviewerResult.data ?? []).map((row) => [row.id, row]));
      setReviews(reviewRows.map((row) => ({ ...row, reviewer: reviewers.get(row.reviewer_id) })));
    } else setReviews([]);
    setLoading(false);
  }, [own, routeId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const counts = useMemo(() => ({ Portfolio: portfolio.length, Posts: posts.length, Commissions: commissions.length, Reviews: reviews.length }), [portfolio, posts, commissions, reviews]);
  const role = profile?.active_role === 'client' ? 'client' : 'hunter';
  const rating = role === 'client' ? profile?.client_rating : profile?.hunter_rating;
  const ratingCount = role === 'client' ? profile?.client_rating_count : profile?.hunter_rating_count;
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';
  const isProfileOwner = Boolean(profile && (own || viewerId === profile.id));

  const action = isProfileOwner ? <Pressable style={styles.editButton} onPress={() => router.push('/profile/edit' as any)}><Text style={styles.editText}>Edit</Text></Pressable> : null;
  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <Header title="Profile" onBack={() => router.back()} right={action} />
    {loading ? <View style={styles.center}><ActivityIndicator color={yellow} /></View> : error && !profile ? <View style={styles.center}><Text style={styles.error}>{error}</Text></View> : profile ? <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 20 }}>
      <View style={styles.identity}>
        <View style={styles.avatarGlow}><ProfileAvatar avatarUrl={profile.avatar_url} size={88} /></View>
        <View style={styles.nameBlock}><Text style={styles.username}>@{profile.username ?? 'member'}</Text><Text style={styles.role}>{role === 'client' ? 'Client' : 'Hunter'}</Text></View>
        <View style={styles.rating}><Text style={styles.stars}>★</Text><Text style={styles.ratingNumber}>{Number(rating ?? 0).toFixed(1)}</Text><Text style={styles.muted}>({ratingCount ?? 0})</Text></View>
        <Text style={styles.completed}>{commissions.length} completed commission{commissions.length === 1 ? '' : 's'}</Text>
        {profile.bio ? <MarkdownText style={styles.bio}>{profile.bio}</MarkdownText> : null}
        {!isProfileOwner ? <View style={styles.actions}>{role === 'hunter' ? <Pressable style={styles.primaryAction} onPress={() => router.push({ pathname: '/profile/invite/[id]', params: { id: profile.id } } as any)}><Text style={styles.primaryText}>Invite to Bid</Text></Pressable> : null}<Pressable style={[styles.secondaryAction, role !== 'hunter' && { flex: 1 }]} onPress={() => router.push({ pathname: '/messages/new/[id]', params: { id: profile.id } } as any)}><Text style={styles.secondaryText}>Message</Text></Pressable></View> : null}
      </View>
      <View style={styles.stats}><Stat label="Posts" value={posts.length} /><Stat label="Completed" value={commissions.length} /><Stat label="Member since" value={memberSince} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{tabs.map((item) => <Pressable key={item} onPress={() => setTab(item)} style={styles.tab}><Text style={[styles.tabText, tab === item && styles.tabActive]}>{item}<Text style={tab === item ? styles.tabActive : styles.tabText}>  {counts[item]}</Text></Text>{tab === item ? <View style={styles.indicator} /> : null}</Pressable>)}</ScrollView>
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
      <View style={styles.tabContent}>
        {tab === 'Portfolio' ? portfolio.length ? <View style={styles.grid}>{portfolio.map((entry) => <Pressable key={entry.id} style={styles.portfolioCard} onPress={() => router.push({ pathname: '/portfolio/[id]', params: { id: entry.id } } as any)}>{entry.image_url ? <Image source={{ uri: entry.image_url }} style={styles.cover} contentFit="cover" /> : <View style={styles.cover} />}<Text style={styles.category}>{entry.categoryName ?? 'PORTFOLIO'}</Text><Text style={styles.cardTitle} numberOfLines={2}>{entry.title}</Text>{(entry.description || entry.subtitle) ? <MarkdownText style={styles.cardSub} numberOfLines={2}>{entry.description ?? entry.subtitle ?? ''}</MarkdownText> : null}</Pressable>)}{isProfileOwner ? <AddPortfolioTile onPress={() => router.push('/profile/portfolio/add' as any)} /> : null}</View> : isProfileOwner ? <View style={styles.grid}><AddPortfolioTile onPress={() => router.push('/profile/portfolio/add' as any)} /></View> : <View style={styles.portfolioEmpty}><Text style={styles.emptyText}>Nothing in the portfolio yet.</Text></View> : null}
        {tab === 'Posts' ? posts.length ? posts.map((post) => <Pressable key={post.id} style={styles.postCard} onPress={() => router.push({ pathname: '/posts/[id]', params: { id: post.id } } as any)} accessibilityRole="button" accessibilityLabel={`Open post ${post.title ?? ''}`}>{post.media_url ? <Image source={{ uri: post.media_url }} style={styles.postImage} contentFit="cover" /> : null}<Text style={styles.cardTitle}>{post.title ?? 'Post'}</Text>{post.body ? <MarkdownText style={styles.postBody}>{post.body}</MarkdownText> : null}<Text style={styles.date}>{new Date(post.created_at).toLocaleDateString()}</Text></Pressable>) : <EmptyState label="No posts yet." /> : null}
        {tab === 'Commissions' ? commissions.length ? commissions.map((commission) => <Pressable key={commission.id} disabled={!commission.request_id} onPress={() => commission.request_id && router.push(`/service-request/${commission.request_id}` as any)} style={styles.commissionCard}><View style={styles.doneMark}><Text style={styles.doneText}>✓</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{commission.title ?? 'Completed commission'}</Text><Text style={styles.date}>{commission.completed_at ? new Date(commission.completed_at).toLocaleDateString() : 'Completed'}</Text></View><Text style={styles.commissionRole}>{commission.role === 'client' ? 'Client' : 'Hunter'}</Text></Pressable>) : <EmptyState label="No completed commissions yet." /> : null}
        {tab === 'Reviews' ? reviews.length ? reviews.map((review) => <View key={review.id} style={styles.reviewCard}><ProfileAvatar avatarUrl={review.reviewer?.avatar_url} size={38} /><View style={{ flex: 1 }}><Text style={styles.reviewer}>@{review.reviewer?.username ?? 'member'} <Text style={styles.stars}>{'★'.repeat(review.rating)}</Text></Text>{review.comment ? <MarkdownText style={styles.postBody}>{review.comment}</MarkdownText> : <Text style={styles.date}>No written comment</Text>}<Text style={styles.date}>{new Date(review.created_at).toLocaleDateString()}</Text></View></View>) : <EmptyState label="No reviews yet." /> : null}
      </View>
    </ScrollView> : null}
  </View>;
}

function Stat({ label, value }: { label: string; value: string | number }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function AddPortfolioTile({ onPress }: { onPress: () => void }) { return <Pressable onPress={onPress} style={styles.addTile}><Svg width={23} height={23} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={yellow} strokeWidth={2} strokeLinecap="round" /></Svg><Text style={styles.addTitle}>Add Entry</Text><Text style={styles.addSub}>Upload project</Text></Pressable>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' }, header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#242424' }, back: { width: 38, height: 42, justifyContent: 'center' }, headerTitle: { flex: 1, color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 20 }, headerRight: { minWidth: 45, alignItems: 'flex-end' }, editButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: '#2A2A2A' }, editText: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 13 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, error: { color: '#FF8989', fontFamily: 'Roboto', textAlign: 'center' }, inlineError: { color: '#FF8989', fontFamily: 'Roboto', fontSize: 11, paddingHorizontal: 18, paddingTop: 8 }, identity: { padding: 20, gap: 9 }, avatarGlow: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25241D', borderWidth: 2, borderColor: '#514B16', shadowColor: yellow, shadowOpacity: 0.14, shadowRadius: 12 }, nameBlock: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9 }, username: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 25 }, role: { color: yellow, backgroundColor: '#2A2A2A', overflow: 'hidden', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, fontFamily: 'RobotoExtraBold', fontSize: 11 }, rating: { flexDirection: 'row', alignItems: 'center', gap: 5 }, stars: { color: yellow }, ratingNumber: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 13 }, muted: { color: '#999999', fontFamily: 'Roboto', fontSize: 11 }, completed: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 }, bio: { color: '#D0CECF', fontFamily: 'Roboto', fontSize: 13, lineHeight: 19, marginTop: 4 }, actions: { flexDirection: 'row', gap: 9, marginTop: 7 }, primaryAction: { flex: 1, backgroundColor: yellow, borderRadius: 10, minHeight: 42, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#171717', fontFamily: 'RobotoExtraBold', fontSize: 13 }, secondaryAction: { flex: 1, backgroundColor: '#292929', borderRadius: 10, minHeight: 42, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 13 }, stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#292929', marginHorizontal: 18 }, stat: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3 }, statValue: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 14 }, statLabel: { color: '#888888', fontFamily: 'Roboto', fontSize: 10 }, tabs: { paddingHorizontal: 15, gap: 21, borderBottomWidth: 1, borderBottomColor: '#272727' }, tab: { minHeight: 46, justifyContent: 'center' }, tabText: { color: '#898989', fontFamily: 'Roboto', fontSize: 12 }, tabActive: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 12 }, indicator: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: yellow, borderRadius: 3 }, tabContent: { paddingHorizontal: 18, paddingTop: 15 }, empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 25, gap: 8 }, cat: { width: 150, height: 130 }, portfolioEmpty: { alignItems: 'center', paddingVertical: 20 }, emptyText: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 15 }, portfolioCard: { width: '48.5%', paddingBottom: 8 }, cover: { width: '100%', aspectRatio: 4 / 3, borderRadius: 11, backgroundColor: '#222222' }, category: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 9, marginTop: 8, letterSpacing: 0.8 }, cardTitle: { color: '#F5F5F5', fontFamily: 'RobotoExtraBold', fontSize: 13, lineHeight: 18, marginTop: 4 }, cardSub: { color: '#9A9A9A', fontFamily: 'Roboto', fontSize: 11, marginTop: 3 }, addTile: { width: '48.5%', aspectRatio: 4 / 3, borderWidth: 1, borderStyle: 'dashed', borderColor: '#5A541A', borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingBottom: Platform.OS === 'web' ? 0 : 20, backgroundColor: '#19190F', gap: 4 }, addTitle: { color: '#E9E2A0', fontFamily: 'RobotoExtraBold', fontSize: 12, lineHeight: 15, includeFontPadding: false }, addSub: { color: '#89836A', fontFamily: 'Roboto', fontSize: 9, lineHeight: 12, includeFontPadding: false }, postCard: { padding: 13, marginBottom: 11, backgroundColor: '#1E1E1E', borderRadius: 12 }, postImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 9, marginBottom: 8 }, postBody: { color: '#C8C6C8', fontFamily: 'Roboto', fontSize: 12, lineHeight: 18, marginTop: 5 }, date: { color: '#777777', fontFamily: 'Roboto', fontSize: 10, marginTop: 5 }, commissionCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, marginBottom: 9, backgroundColor: '#1E1E1E', borderRadius: 11 }, commissionRole: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 10, backgroundColor: '#302F1C', borderRadius: 10, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 }, doneMark: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#292710', alignItems: 'center', justifyContent: 'center' }, doneText: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 18 }, reviewCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, marginBottom: 9, backgroundColor: '#1E1E1E', borderRadius: 11 }, reviewer: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 12 },
});
