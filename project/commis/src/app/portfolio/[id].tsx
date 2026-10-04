import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';
import { MarkdownText } from '@/components/markdown-text';

type Entry = { id: string; user_id: string; title: string; subtitle: string | null; description: string | null; category_id: string | null; image_url: string | null; skills: string[] | null; project_url: string | null; created_at: string };
type Owner = { id: string; username: string | null; avatar_url: string | null };
const yellow = '#FFE600';

export default function PortfolioEntryDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [entry, setEntry] = useState<Entry | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [category, setCategory] = useState('');
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data: { user } } = await supabase.auth.getUser(); setViewerId(user?.id ?? null);
    if (!entryId) { setError('Portfolio entry not found.'); setLoading(false); return; }
    const { data, error: entryError } = await supabase.from('portfolio_entries').select('id, user_id, title, subtitle, description, category_id, image_url, skills, project_url, created_at').eq('id', entryId).maybeSingle();
    if (entryError || !data) { setError(entryError?.message ?? 'Portfolio entry not found.'); setLoading(false); return; }
    const loadedEntry = data as Entry; setEntry(loadedEntry);
    const [ownerResult, categoryResult] = await Promise.all([
      supabase.from('profiles').select('id, username, avatar_url').eq('id', loadedEntry.user_id).maybeSingle(),
      loadedEntry.category_id ? supabase.from('categories').select('name').eq('id', loadedEntry.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    setOwner(ownerResult.data as Owner | null); setCategory(categoryResult.data?.name ?? '');
    setLoading(false);
  }, [entryId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const isOwner = Boolean(entry && viewerId === entry.user_id);

  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.headerTitle}>Project Detail</Text>{isOwner ? <Pressable onPress={() => router.push({ pathname: '/profile/portfolio/[id]', params: { id: entry!.id } } as any)} style={styles.edit}><Text style={styles.editText}>Edit</Text></Pressable> : <View style={{ width: 48 }} />}</View>
    {loading ? <View style={styles.center}><ActivityIndicator color={yellow} /></View> : error ? <View style={styles.center}><Text style={styles.error}>{error}</Text></View> : entry ? <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
      {entry.image_url ? <Image source={{ uri: entry.image_url }} style={styles.hero} contentFit="cover" /> : <View style={styles.heroPlaceholder}><Text style={styles.placeholderText}>Project cover</Text></View>}
      <View style={styles.content}>
        <Pressable style={styles.ownerRow} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: entry.user_id } } as any)}><ProfileAvatar avatarUrl={owner?.avatar_url} size={40} /><View style={{ flex: 1 }}><Text style={styles.ownerName}>@{owner?.username ?? 'member'}</Text><Text style={styles.ownerSub}>Portfolio project</Text></View></Pressable>
        {category ? <Text style={styles.category}>{category.toLocaleUpperCase()}</Text> : null}
        <Text style={styles.title}>{entry.title}</Text>
        {entry.description || entry.subtitle ? <MarkdownText style={styles.description}>{entry.description ?? entry.subtitle ?? ''}</MarkdownText> : null}
        {entry.skills?.length ? <View style={styles.section}><Text style={styles.sectionTitle}>Skills used</Text><View style={styles.skills}>{entry.skills.map((skill) => <View key={skill} style={styles.skill}><Text style={styles.skillText}>{skill}</Text></View>)}</View></View> : null}
        {entry.project_url ? <View style={styles.section}><Text style={styles.sectionTitle}>Project link</Text><Pressable onPress={() => void Linking.openURL(entry.project_url!)} style={styles.linkButton}><Text numberOfLines={2} style={styles.linkText}>{entry.project_url}</Text><Text style={styles.linkArrow}>↗</Text></Pressable></View> : null}
        <Text style={styles.created}>Added {new Date(entry.created_at).toLocaleDateString()}</Text>
      </View>
    </ScrollView> : null}
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#131313' }, header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#252525' }, back: { width: 35, height: 42, justifyContent: 'center' }, backText: { color: '#FFFFFF', fontSize: 31 }, headerTitle: { flex: 1, color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 19 }, edit: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9, backgroundColor: '#292929' }, editText: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 12 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, error: { color: '#FF8989', fontFamily: 'Roboto', textAlign: 'center' }, hero: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#222222' }, heroPlaceholder: { width: '100%', aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#202020' }, placeholderText: { color: '#777777', fontFamily: 'Roboto', fontSize: 12 }, content: { padding: 20, gap: 12 }, ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }, ownerName: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 12 }, ownerSub: { color: '#888888', fontFamily: 'Roboto', fontSize: 10, marginTop: 3 }, category: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 1 }, title: { color: '#FFFFFF', fontFamily: 'LeagueSpartanExtraBold', fontSize: 26, lineHeight: 32 }, description: { color: '#CBC9C9', fontFamily: 'Roboto', fontSize: 14, lineHeight: 21, marginTop: 2 }, section: { gap: 9, marginTop: 11 }, sectionTitle: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 13 }, skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, skill: { paddingHorizontal: 11, paddingVertical: 7, backgroundColor: '#242424', borderRadius: 18 }, skillText: { color: '#CBC9C9', fontFamily: 'Roboto', fontSize: 11 }, linkButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#202020' }, linkText: { flex: 1, color: yellow, fontFamily: 'Roboto', fontSize: 12 }, linkArrow: { color: yellow, fontSize: 18 }, created: { color: '#777777', fontFamily: 'Roboto', fontSize: 10, marginTop: 12 } });
