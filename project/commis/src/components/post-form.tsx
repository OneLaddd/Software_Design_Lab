import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { ArrowLeft, ImagePlus, Link as LinkIcon, List } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import type { PostWithRelations } from '@/components/post-card';

type Community = { id: string; name: string; icon_url?: string | null };
type Media = { url: string; asset?: DocumentPicker.DocumentPickerAsset; file?: ExpoFile };
const BUCKET = 'post-media';

export function PostForm({ postId, communityId }: { postId?: string; communityId?: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bodyRef = useRef<TextInput>(null);
  const editing = Boolean(postId);
  const fixedCommunity = Boolean(communityId);
  const [viewerId, setViewerId] = useState('');
  const [post, setPost] = useState<PostWithRelations | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(communityId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [media, setMedia] = useState<Media[]>([]);
  const [originalMedia, setOriginalMedia] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedCommunityRow = communities.find((community) => community.id === selectedCommunity);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setError('Sign in to create a post.'); setLoading(false); return; }
      setViewerId(user.id);
      if (communityId) {
        const { data: row } = await supabase.from('communities').select('id,name,icon_url').eq('id', communityId).maybeSingle();
        if (active && row) setCommunities((current) => current.some((item) => item.id === row.id) ? current : [...current, row]);
      }
      if (!fixedCommunity && !editing) {
        const { data: memberships } = await supabase.from('community_members').select('community_id').eq('user_id', user.id);
        const ids = (memberships ?? []).map((row) => row.community_id);
        if (ids.length) {
          const { data } = await supabase.from('communities').select('id,name,icon_url').in('id', ids).order('name');
          if (active) setCommunities(data ?? []);
        }
      }
      if (postId) {
        const [{ data: postData, error: postError }, { data: mediaRows }] = await Promise.all([
          supabase.from('posts').select('id,author_id,community_id,title,body,media_url,created_at').eq('id', postId).maybeSingle(),
          supabase.from('post_media').select('media_url,position').eq('post_id', postId).order('position'),
        ]);
        if (postError || !postData) setError(postError?.message ?? 'Post not found.');
        else if (postData.author_id !== user.id) setError('Only the post author can edit it.');
        else {
          setPost(postData as PostWithRelations); setTitle(postData.title ?? ''); setBody(postData.body ?? ''); setSelectedCommunity(postData.community_id);
          const urls = (mediaRows ?? []).map((row) => row.media_url as string);
          const initialUrls = urls.length ? urls : postData.media_url ? [postData.media_url] : [];
          setOriginalMedia(initialUrls); setMedia(initialUrls.map((url) => ({ url })));
          if (postData.community_id) {
            const { data: row } = await supabase.from('communities').select('id,name,icon_url').eq('id', postData.community_id).maybeSingle();
            if (active && row) setCommunities((current) => current.some((item) => item.id === row.id) ? current : [...current, row]);
          }
        }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [communityId, editing, postId, fixedCommunity]);

  const pickImages = async () => {
    if (media.length >= 4) return;
    if (Platform.OS === 'web') {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: true, base64: false });
      if (result.canceled) return;
      const selected = result.assets.slice(0, 4 - media.length).filter((asset) => asset.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)$/i.test(asset.name));
      setMedia((current) => [...current, ...selected.map((asset) => ({ url: asset.uri, asset }))].slice(0, 4));
      return;
    }
    const result = await ExpoFile.pickFileAsync({ mimeTypes: ['image/*'], multipleFiles: true });
    if (result.canceled) return;
    const selected = result.result.slice(0, 4 - media.length).filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)$/i.test(file.name));
    setMedia((current) => [...current, ...selected.map((file) => ({ url: file.uri, file }))].slice(0, 4));
  };

  const formatSelection = (kind: 'bold' | 'italic' | 'link' | 'list') => {
    const { start, end } = selection;
    const selected = body.slice(start, end);
    let next = body;
    let caret = start;
    if (kind === 'bold' || kind === 'italic') {
      const marker = kind === 'bold' ? '**' : '*';
      const value = selected || 'text';
      const wrapped = `${marker}${value}${marker}`;
      next = `${body.slice(0, start)}${wrapped}${body.slice(end)}`;
      caret = selected ? start + wrapped.length : start + marker.length;
    } else if (kind === 'link') {
      const value = selected || 'link text';
      const wrapped = `[${value}](https://)`;
      next = `${body.slice(0, start)}${wrapped}${body.slice(end)}`;
      caret = start + value.length + 3;
    } else {
      const lineStart = body.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      next = `${body.slice(0, lineStart)}- ${body.slice(lineStart)}`;
      caret = start + 2;
    }
    setBody(next);
    setSelection({ start: caret, end: caret });
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  const save = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 5 || trimmedTitle.length > 300) { setError('Title must be between 5 and 300 characters.'); return; }
    if (!viewerId || (editing && (!post || post.author_id !== viewerId))) { setError('You do not have permission to save this post.'); return; }
    setSaving(true); setError('');
    const uploaded: string[] = [];
    try {
      const urls: string[] = [];
      for (const [index, item] of media.entries()) {
        if (!item.asset && !item.file) { urls.push(item.url); continue; }
        const asset = item.asset;
        const file = item.file;
        const name = file?.name ?? asset?.name ?? 'image';
        const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'image';
        const ext = safeName.includes('.') ? safeName.split('.').pop() : 'jpg';
        const path = `${viewerId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const fileBody = file ? await file.bytes() : asset?.file;
        if (!fileBody) throw new Error('The selected image is no longer accessible. Please remove it and attach it again.');
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, fileBody, { contentType: file?.type || asset?.mimeType || 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push(path); urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }
      const { data: savedId, error: saveError } = await supabase.rpc('save_post_with_media', { p_post_id: postId ?? null, p_community_id: selectedCommunity, p_title: trimmedTitle, p_body: body.trim() || null, p_media_urls: urls });
      if (saveError) throw saveError;
      if (!savedId) throw new Error('The post was saved without returning its id.');
      if (postId) {
        const marker = '/storage/v1/object/public/post-media/';
        const removedPaths = originalMedia.filter((url) => !urls.includes(url)).map((url) => decodeURIComponent(url.split(marker)[1] ?? '')).filter((path) => path.startsWith(`${viewerId}/`));
        if (removedPaths.length) {
          const { error: cleanupError } = await supabase.storage.from(BUCKET).remove(removedPaths);
          if (cleanupError) console.warn('Post images saved, but removed image files could not be cleaned up:', cleanupError);
        }
      }
      router.replace({ pathname: '/posts/[id]', params: { id: savedId } } as any);
    } catch (failure) {
      if (uploaded.length) {
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove(uploaded);
        if (cleanupError) console.warn('Could not clean up uploaded post images:', cleanupError);
      }
      const backendError = failure as { message?: string; details?: string; hint?: string; code?: string };
      const message = [backendError?.message, backendError?.details, backendError?.hint, backendError?.code]
        .filter((part): part is string => Boolean(part))
        .join(' · ');
      console.error('Could not save post:', failure);
      setError(message || (failure instanceof Error ? failure.message : String(failure)) || 'Could not save this post.');
    } finally { setSaving(false); }
  };

  const leaveComposer = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/posts');
  };
  const wordCount = body.trim() ? body.replace(/\*\*/g, '').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim().split(/\s+/).filter(Boolean).length : 0;
  if (loading) return <View style={styles.center}><ActivityIndicator color="#FFE600" /></View>;

  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
      <Pressable onPress={leaveComposer} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft size={23} color="#EAEAEA" /></Pressable>
      <Text style={styles.heading}>{editing ? 'Edit Post' : 'Create Post'}</Text><View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionLabel}>POST TO COMMUNITY</Text>
      <Pressable onPress={() => !fixedCommunity && setPickerOpen(true)} disabled={fixedCommunity} style={styles.communityCard} accessibilityRole="button" accessibilityLabel="Choose a community">
        {selectedCommunityRow?.icon_url ? <Image source={{ uri: selectedCommunityRow.icon_url }} style={styles.communityIcon} contentFit="cover" /> : <View style={styles.communityIconFallback}><Text style={styles.communityEmoji}>✿</Text></View>}
        <View style={styles.communityCopy}><Text style={styles.communityLabel}>POST TO COMMUNITY</Text><Text style={[styles.communityName, !selectedCommunityRow && styles.communityPlaceholder]}>{selectedCommunityRow?.name ?? 'Choose a community'}</Text></View>
        {!fixedCommunity ? <Text style={styles.changeMark}>⌄</Text> : null}
      </Pressable>
      {!fixedCommunity && !selectedCommunityRow ? <Text style={styles.helper}>Choose one of your communities, or publish without one.</Text> : null}

      <View style={styles.labelRow}><Text style={styles.sectionLabel}>TITLE <Text style={styles.required}>*</Text></Text><Text style={styles.counter}>{title.length} / 300 · Min 5 chars</Text></View>
      <TextInput value={title} onChangeText={(value) => setTitle(value.slice(0, 300))} placeholder="What's on your mind?" placeholderTextColor="#858585" style={styles.titleInput} maxLength={300} />

      <Text style={[styles.sectionLabel, styles.contentLabel]}>CONTENT</Text>
      <TextInput ref={bodyRef} value={body} onChangeText={setBody} onSelectionChange={(event) => setSelection(event.nativeEvent.selection)} selection={selection} placeholder="Text (optional) or write post details..." placeholderTextColor="#A2A2A2" style={styles.bodyInput} multiline textAlignVertical="top" />
      <View style={styles.toolbar}>
        <Pressable onPress={() => formatSelection('bold')} style={styles.toolButton} accessibilityLabel="Bold"><Text style={styles.boldTool}>B</Text></Pressable>
        <Pressable onPress={() => formatSelection('italic')} style={styles.toolButton} accessibilityLabel="Italic"><Text style={styles.italicTool}>I</Text></Pressable>
        <Pressable onPress={() => formatSelection('link')} style={styles.toolButton} accessibilityLabel="Insert link"><LinkIcon size={17} color="#C9C4A6" /></Pressable>
        <Pressable onPress={() => formatSelection('list')} style={styles.toolButton} accessibilityLabel="Insert list"><List size={18} color="#C9C4A6" /></Pressable>
        <Text style={styles.wordCount}>{wordCount} words</Text>
      </View>

      <View style={styles.mediaHeading}><Text style={styles.sectionLabel}>ATTACHED MEDIA <Text style={styles.mediaCount}>{media.length}</Text></Text><Text style={styles.maxFiles}>Max 4 files</Text></View>
      <Pressable onPress={() => void pickImages()} disabled={media.length >= 4} style={[styles.mediaButton, media.length >= 4 && styles.disabled]} accessibilityRole="button"><ImagePlus size={17} color="#FFE600" /><Text style={styles.mediaButtonText}>+ Add Media</Text></Pressable>
      {media.length > 0 ? <View style={styles.mediaGrid}>{media.map((item, index) => <View key={`${item.url}-${index}`} style={styles.mediaItem}><Image source={{ uri: item.url }} contentFit="cover" style={styles.preview} /><Pressable onPress={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.remove}><Text style={styles.removeText}>×</Text></Pressable><Text style={styles.position}>{index === 0 ? 'Primary' : `Image ${index + 1}`}</Text></View>)}</View> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => void save()} disabled={saving} style={[styles.submit, saving && styles.disabled]} accessibilityRole="button"><Text style={styles.submitText}>{saving ? 'Posting…' : editing ? 'Save Changes' : 'Post'}</Text></Pressable>
      <Pressable onPress={leaveComposer} disabled={saving} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
    </ScrollView>
    <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
      <Pressable style={styles.modalShade} onPress={() => setPickerOpen(false)}><View style={styles.modalCard}><Text style={styles.modalTitle}>Post to a community</Text>
        <Pressable onPress={() => { setSelectedCommunity(null); setPickerOpen(false); }} style={styles.option}><View style={styles.communityIconFallback}><Text style={styles.communityEmoji}>•</Text></View><Text style={styles.optionName}>No community</Text>{!selectedCommunity ? <Text style={styles.selectedMark}>✓</Text> : null}</Pressable>
        {communities.map((community) => <Pressable key={community.id} onPress={() => { setSelectedCommunity(community.id); setPickerOpen(false); }} style={styles.option}>{community.icon_url ? <Image source={{ uri: community.icon_url }} style={styles.communityIcon} contentFit="cover" /> : <View style={styles.communityIconFallback}><Text style={styles.communityEmoji}>✿</Text></View>}<Text style={styles.optionName}>{community.name}</Text>{selectedCommunity === community.id ? <Text style={styles.selectedMark}>✓</Text> : null}</Pressable>)}
        {!communities.length ? <Text style={styles.helper}>You have not joined any communities yet.</Text> : null}
      </View></Pressable>
    </Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#131313' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#131313' },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: '#202020' }, back: { width: 34, height: 38, alignItems: 'flex-start', justifyContent: 'center' }, heading: { color: '#F6F6F6', fontFamily: 'RobotoExtraBold', fontSize: 17 },
  content: { paddingHorizontal: 13, paddingTop: 12, paddingBottom: 26 }, sectionLabel: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: .35 }, required: { color: '#F09C87' },
  communityCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1D1D1D', borderRadius: 13, padding: 11, marginTop: 7, marginBottom: 16, minHeight: 52 }, communityIcon: { width: 29, height: 29, borderRadius: 15, backgroundColor: '#252525' }, communityIconFallback: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#292929' }, communityEmoji: { color: '#FFE600', fontSize: 17 }, communityCopy: { flex: 1 }, communityLabel: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontSize: 8, letterSpacing: .4 }, communityName: { color: '#F4F4F4', fontFamily: 'RobotoExtraBold', fontSize: 15, marginTop: 2 }, communityPlaceholder: { color: '#AFAFAF' }, changeMark: { color: '#AAA', fontSize: 19, paddingHorizontal: 5 }, helper: { color: '#888', fontFamily: 'Roboto', fontSize: 10, marginTop: -8, marginBottom: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }, counter: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontSize: 9 }, titleInput: { minHeight: 68, borderRadius: 11, backgroundColor: '#292929', color: '#F5F5F5', fontFamily: 'RobotoExtraBold', fontSize: 16, paddingHorizontal: 11, paddingVertical: 10 }, contentLabel: { marginTop: 16, marginBottom: 7 }, bodyInput: { minHeight: 140, maxHeight: 330, borderWidth: 0, borderTopLeftRadius: 11, borderTopRightRadius: 11, backgroundColor: '#303030', color: '#E6E6E6', fontFamily: 'Roboto', fontSize: 13, lineHeight: 20, paddingHorizontal: 11, paddingVertical: 12, outlineStyle: 'none' as any, outlineWidth: 0 as any }, toolbar: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomLeftRadius: 11, borderBottomRightRadius: 11, backgroundColor: '#202020', paddingHorizontal: 10 }, toolButton: { minWidth: 18, alignItems: 'center', justifyContent: 'center' }, boldTool: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontSize: 16 }, italicTool: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontStyle: 'italic', fontSize: 16 }, wordCount: { marginLeft: 'auto', color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontSize: 9 },
  mediaHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 17, marginBottom: 11 }, mediaCount: { color: '#FFF', backgroundColor: '#333', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 5 }, maxFiles: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontSize: 9 }, mediaButton: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, backgroundColor: '#1D1D1D' }, mediaButtonText: { color: '#F5F5F5', fontFamily: 'RobotoExtraBold', fontSize: 12 }, mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }, mediaItem: { width: '48%', aspectRatio: 1, position: 'relative' }, preview: { width: '100%', height: '100%', borderRadius: 10, backgroundColor: '#222' }, remove: { position: 'absolute', right: 6, top: 6, width: 25, height: 25, borderRadius: 13, backgroundColor: '#111D', alignItems: 'center', justifyContent: 'center' }, removeText: { color: '#FFF', fontSize: 18, lineHeight: 20 }, position: { position: 'absolute', bottom: 6, left: 6, color: '#FFF', backgroundColor: '#111B', fontFamily: 'RobotoExtraBold', fontSize: 9, padding: 5, borderRadius: 8 }, disabled: { opacity: .55 }, error: { color: '#FF7777', fontFamily: 'Roboto', fontSize: 11, marginTop: 11 },
  submit: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE600', borderRadius: 24, marginTop: 18 }, submitText: { color: '#151515', fontFamily: 'RobotoExtraBold', fontSize: 14 }, cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1D1D1D', borderRadius: 22, marginTop: 8 }, cancelText: { color: '#F2F2F2', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  modalShade: { flex: 1, backgroundColor: '#000A', justifyContent: 'center', padding: 20 }, modalCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 15, maxHeight: '75%' }, modalTitle: { color: '#FFF', fontFamily: 'RobotoExtraBold', fontSize: 16, marginBottom: 10 }, option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#2A2A2A' }, optionName: { flex: 1, color: '#EEE', fontFamily: 'RobotoExtraBold', fontSize: 13 }, selectedMark: { color: '#FFE600', fontSize: 17 },
});
