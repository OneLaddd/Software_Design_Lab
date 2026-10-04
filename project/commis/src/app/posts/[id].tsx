import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, findNodeHandle, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { ArrowLeft, Ellipsis, Link as LinkIcon, List, MessageCircle, Pencil, Share2, Trash2 } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavBar } from '@/components/bottom-nav-bar';
import { ProfileAvatar } from '@/components/profile-avatar';
import { PostVoteBar } from '@/components/post-vote-bar';
import { MarkdownText } from '@/components/markdown-text';
import { usePostVotes } from '@/hooks/use-post-votes';
import { supabase } from '@/lib/supabase';
import { requireAccount } from '@/lib/require-auth';

type Post = { id: string; author_id: string; community_id: string | null; title: string | null; body: string | null; media_url: string | null; created_at: string | null; view_count: number | null };
type Comment = { id: string; post_id: string; author_id: string; parent_comment_id: string | null; body: string; created_at: string | null; deleted_at?: string | null; profile?: { username: string | null; avatar_url: string | null } | null };
type CommentNode = { comment: Comment; depth: number; children: CommentNode[] };
type Community = { id: string; name: string; icon_url: string | null };
type ActionTarget = { kind: 'post' } | { kind: 'comment'; id: string };

export default function PostDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const galleryRef = useRef<ScrollView>(null);
  const commentsScrollRef = useRef<ScrollView>(null);
  const focusedInputRef = useRef<TextInput | null>(null);
  const [galleryWidth, setGalleryWidth] = useState(360);
  const [activeImage, setActiveImage] = useState(0);
  const [post, setPost] = useState<Post | null>(null);
  const [author, setAuthor] = useState<any>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [media, setMedia] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [sort, setSort] = useState<'Top' | 'New' | 'Old'>('New');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewerUsername, setViewerUsername] = useState('member');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [actionMenu, setActionMenu] = useState<ActionTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActionTarget | null>(null);
  const { votes, viewerId, vote } = usePostVotes(id ? [id] : []);

  const relativeTime = (value: string | null) => {
    if (!value) return '';
    const minutes = Math.floor(Math.max(0, Date.now() - new Date(value).getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}hr ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  };

  const sharePost = async () => {
    if (!id) return;
    const title = post?.title ?? 'Commis post';
    const shareText = post?.body ? `${title}\n${post.body}` : title;
    if (Platform.OS === 'android') {
      await Share.share({ message: shareText }, { dialogTitle: title });
      return;
    }
    await Share.share({ title, message: shareText });
  };

  useEffect(() => {
    if (!viewerId) return;
    void supabase.from('profiles').select('username').eq('id', viewerId).maybeSingle().then(({ data }) => {
      if (data?.username) setViewerUsername(data.username);
    });
  }, [viewerId]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    const { data, error: postError } = await supabase.from('posts').select('id,author_id,community_id,title,body,media_url,created_at,view_count').eq('id', id).maybeSingle();
    if (postError || !data) {
      setError(postError?.message ?? 'This post could not be found.'); setPost(null); setLoading(false); return;
    }
    setPost(data as Post);
    const [profileResult, communityResult, mediaResult, commentResult] = await Promise.all([
      supabase.from('profiles').select('id,username,avatar_url').eq('id', data.author_id).maybeSingle(),
      data.community_id ? supabase.from('communities').select('id,name,icon_url').eq('id', data.community_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('post_media').select('media_url,position').eq('post_id', id).order('position'),
      supabase.from('comments').select('id,post_id,author_id,parent_comment_id,body,created_at,deleted_at').eq('post_id', id).order('created_at', { ascending: true }),
    ]);
    setAuthor(profileResult.data); setCommunity(communityResult.data as Community | null);
    const mediaUrls = (mediaResult.data ?? []).map((row: any) => row.media_url as string);
    setMedia(mediaUrls.length ? mediaUrls : data.media_url ? [data.media_url] : []);
    setActiveImage(0);
    const rows = (commentResult.data ?? []) as Comment[];
    const authorIds = [...new Set(rows.filter((row) => !row.deleted_at).map((row) => row.author_id))];
    const { data: profiles } = authorIds.length ? await supabase.from('profiles').select('id,username,avatar_url').in('id', authorIds) : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    setComments(rows.map((row) => ({ ...row, profile: row.deleted_at ? null : profileMap.get(row.author_id) ?? null })));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load();
    if (id) void supabase.rpc('increment_post_view', { p_post_id: id }).then(({ error: viewError }) => { if (viewError) console.warn('Could not record post view:', viewError); });
  }, [id, load]));

  const commentTree = useMemo(() => {
    const children = new Map<string | null, Comment[]>();
    for (const comment of comments) {
      const parent = comment.parent_comment_id;
      children.set(parent, [...(children.get(parent) ?? []), comment]);
    }
    const orderedChildren = (parent: string | null) => [...(children.get(parent) ?? [])].sort((a, b) => sort === 'Old'
        ? new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
        : new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    const flattenAtThirdLevel = (parent: string): CommentNode[] => orderedChildren(parent).flatMap((comment) => [
      { comment, depth: 3, children: [] },
      ...flattenAtThirdLevel(comment.id),
    ]);
    const build = (parent: string | null, depth: number): CommentNode[] => orderedChildren(parent).map((comment) => ({
      comment,
      depth,
      children: depth < 2 ? build(comment.id, depth + 1) : depth === 2 ? flattenAtThirdLevel(comment.id) : [],
    }));
    return build(null, 0);
  }, [comments, sort]);

  const sendComment = async (parent: string | null) => {
    if (!viewerId) { await requireAccount(router, 'comment or reply to posts'); return; }
    const text = (parent ? replies[parent] : draft).trim();
    if (!text) return;
    const { error: insertError } = await supabase.from('comments').insert({ post_id: id, author_id: viewerId, parent_comment_id: parent, body: text });
    if (insertError) { setError(insertError.message); return; }
    if (parent) { setReplies((value) => ({ ...value, [parent]: '' })); setReplying(null); }
    else setDraft('');
    await load();
  };

  const saveComment = async (commentId: string) => {
    const body = editDraft.trim();
    if (!body) return;
    setSaving(true); setError('');
    const { error: updateError } = await supabase.from('comments').update({ body }).eq('id', commentId).eq('author_id', viewerId);
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setEditingComment(null); setEditDraft(''); await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setSaving(true); setError('');
    if (target.kind === 'comment') {
      const { error: deleteError } = await supabase.rpc('remove_comment', { p_comment_id: target.id });
      setSaving(false); setDeleteTarget(null);
      if (deleteError) { setError(deleteError.message); return; }
      await load();
      return;
    }
    const { error: deleteError } = await supabase.from('posts').delete().eq('id', id).eq('author_id', viewerId);
    if (deleteError) { setSaving(false); setDeleteTarget(null); setError(deleteError.message); return; }
    const marker = '/storage/v1/object/public/post-media/';
    const paths = [...new Set([...media, ...(post?.media_url ? [post.media_url] : [])].map((url) => decodeURIComponent(url.split(marker)[1] ?? '')).filter((path) => path.startsWith(`${viewerId}/`)))];
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('post-media').remove(paths);
      if (storageError) console.warn('Post deleted, but its media files could not be removed:', storageError);
    }
    setSaving(false); setDeleteTarget(null); router.replace('/posts');
  };

  const openCommentEdit = (comment: Comment) => {
    setEditingComment(comment.id); setEditDraft(comment.body); setActionMenu(null);
  };

  const showImage = (index: number) => {
    const next = Math.max(0, Math.min(index, media.length - 1));
    setActiveImage(next);
    galleryRef.current?.scrollTo({ x: next * galleryWidth, animated: true });
  };
  const scrollFocusedInputAboveKeyboard = () => {
    if (Platform.OS === 'web' || !focusedInputRef.current || !commentsScrollRef.current) return;
    const nodeHandle = findNodeHandle(focusedInputRef.current);
    if (nodeHandle != null) commentsScrollRef.current.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, 120, true);
  };
  const onComposerFocus = (input: TextInput | null) => {
    focusedInputRef.current = input;
    setTimeout(scrollFocusedInputAboveKeyboard, 280);
  };
  useEffect(() => {
    if (!keyboardVisible) return;
    const timer = setTimeout(scrollFocusedInputAboveKeyboard, 160);
    return () => clearTimeout(timer);
  }, [keyboardVisible]);

  const renderCommentNode = (node: CommentNode): React.ReactNode => {
    const { comment } = node;
    const isDeleted = Boolean(comment.deleted_at);
    const repliedTo = node.depth === 3 && comment.parent_comment_id
      ? comments.find((row) => row.id === comment.parent_comment_id)?.profile?.username
      : null;
    return <View key={comment.id} style={styles.commentNode}>
      {node.children.length ? <View pointerEvents="none" style={styles.commentRail} /> : null}
      <View style={styles.comment}>
        {isDeleted ? <View style={styles.deletedAvatar} /> : <Pressable onPress={() => router.push({ pathname: '/profile/[id]', params: { id: comment.author_id } } as any)} accessibilityRole="button" accessibilityLabel={`Open @${comment.profile?.username ?? 'member'} profile`}><ProfileAvatar avatarUrl={comment.profile?.avatar_url} size={30} /></Pressable>}
        <View style={styles.commentCopy}>
          <View style={styles.commentHead}><View style={styles.commentIdentity}><View style={styles.commentMetaRow}>{isDeleted ? <Text style={styles.commentAuthor}>[deleted]</Text> : <Pressable onPress={() => router.push({ pathname: '/profile/[id]', params: { id: comment.author_id } } as any)} accessibilityRole="button"><Text style={styles.commentAuthor}>@{comment.profile?.username ?? 'member'}</Text></Pressable>}<Text style={[styles.date, styles.commentTime]}>{relativeTime(comment.created_at)}</Text></View>{!isDeleted && repliedTo ? <Text style={styles.replyingTo}>Replying to @{repliedTo}</Text> : null}</View>
            {!isDeleted && comment.author_id === viewerId ? <Pressable onPress={() => setActionMenu({ kind: 'comment', id: comment.id })} style={styles.commentMore} accessibilityRole="button" accessibilityLabel="Comment options"><Ellipsis size={19} color="#999" /></Pressable> : null}
          </View>
          {isDeleted ? <Text style={styles.removedComment}>Comment removed by user</Text> : editingComment === comment.id ? <CommentComposer label={`Editing @${comment.profile?.username ?? 'member'}`} value={editDraft} onChange={setEditDraft} placeholder="Edit your comment..." submitLabel="Save" disabled={saving} onSubmit={() => void saveComment(comment.id)} onCancel={() => { setEditingComment(null); setEditDraft(''); }} onInputFocus={onComposerFocus} /> : <MarkdownText style={styles.commentBody}>{comment.body}</MarkdownText>}
          <Pressable onPress={() => setReplying(replying === comment.id ? null : comment.id)} style={styles.replyButton}><Text style={styles.replyButtonText}>Reply</Text></Pressable>
          {replying === comment.id ? <CommentComposer replyContext label={`Reply as @${viewerUsername}`} value={replies[comment.id] ?? ''} onChange={(value) => setReplies((current) => ({ ...current, [comment.id]: value }))} placeholder="Write your reply..." submitLabel="Reply" onSubmit={() => void sendComment(comment.id)} onCancel={() => setReplying(null)} onInputFocus={onComposerFocus} autoFocus /> : null}
        </View>
      </View>
      {node.children.length ? <View style={styles.replyThread}>{node.children.map(renderCommentNode)}</View> : null}
    </View>;
  };

  // Android already resizes the app window (softwareKeyboardLayoutMode=resize).
  // Applying KeyboardAvoidingView's height behavior there applies the keyboard inset twice.
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 48 : 0}>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft size={24} color="#E7E7E7" /></Pressable>
      <Text style={styles.headerCommunity} numberOfLines={1}>{community?.name ?? 'Post'}</Text>
      <View style={styles.headerSpacer} />
    </View>
      {loading ? <View style={styles.center}><ActivityIndicator color="#FFE600" /></View> : !post ? <View style={styles.center}><Text style={styles.error}>{error || 'Post not found.'}</Text></View> : <ScrollView ref={commentsScrollRef} style={styles.scrollView} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, keyboardVisible && styles.keyboardContent]}>
      <View style={styles.meta}>
        <Pressable onPress={() => author && router.push({ pathname: '/profile/[id]', params: { id: author.id } } as any)} style={styles.author}>
          <ProfileAvatar avatarUrl={author?.avatar_url} size={38} />
          <View><Text style={styles.username}>@{author?.username ?? 'member'}</Text><Text style={styles.date}>{relativeTime(post.created_at)}</Text></View>
        </Pressable>
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{post.title ?? 'Untitled post'}</Text>
        {post.author_id === viewerId ? <Pressable onPress={() => setActionMenu({ kind: 'post' })} style={styles.more} accessibilityRole="button" accessibilityLabel="Post options"><Ellipsis size={23} color="#C7C7C7" /></Pressable> : null}
      </View>
      {post.body ? <MarkdownText style={styles.body}>{post.body}</MarkdownText> : null}
      {media.length ? <View style={styles.galleryWrap} onLayout={(event) => setGalleryWidth(event.nativeEvent.layout.width)}>
        <ScrollView ref={galleryRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery} onMomentumScrollEnd={(event) => setActiveImage(Math.round(event.nativeEvent.contentOffset.x / galleryWidth))}>
          {media.map((url, index) => <Image key={`${url}-${index}`} source={{ uri: url }} contentFit="contain" style={[styles.image, { width: galleryWidth }]} />)}
        </ScrollView>
        {media.length > 1 ? <>
          {activeImage > 0 ? <Pressable onPress={() => showImage(activeImage - 1)} style={[styles.galleryArrow, styles.galleryArrowLeft]} accessibilityRole="button" accessibilityLabel="Previous image"><Text style={styles.galleryArrowText}>‹</Text></Pressable> : null}
          {activeImage < media.length - 1 ? <Pressable onPress={() => showImage(activeImage + 1)} style={[styles.galleryArrow, styles.galleryArrowRight]} accessibilityRole="button" accessibilityLabel="Next image"><Text style={styles.galleryArrowText}>›</Text></Pressable> : null}
          <View style={styles.galleryCount}><Text style={styles.galleryCountText}>{activeImage + 1} / {media.length}</Text></View>
        </> : null}
      </View> : null}
      <View style={styles.postActions}>
        <PostVoteBar score={votes[id]?.score ?? 0} userVote={votes[id]?.userVote ?? 0} onVote={(value) => void vote(id, value)} />
        <Pressable onPress={() => void sharePost()} style={styles.iconAction} accessibilityRole="button" accessibilityLabel="Share post"><Share2 size={18} color="#B7B7B7" /></Pressable>
        <View style={styles.iconAction}><MessageCircle size={18} color="#B7B7B7" /><Text style={styles.actionCount}>{comments.length}</Text></View>
      </View>
      <View style={styles.commentHeader}><Text style={styles.sectionTitle}>Comments ({comments.length})</Text><View style={styles.sortRow}>{(['Top', 'New', 'Old'] as const).map((value) => <Pressable key={value} onPress={() => setSort(value)}><Text style={[styles.sortText, sort === value && styles.sortSelected]}>{value}</Text></Pressable>)}</View></View>
      <CommentComposer label={`Comment as @${viewerUsername}`} value={draft} onChange={setDraft} placeholder="Write your comment..." submitLabel="Publish" onSubmit={() => void sendComment(null)} onInputFocus={onComposerFocus} />
      {commentTree.map(renderCommentNode)}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>}

    <Modal visible={actionMenu !== null} transparent animationType="fade" onRequestClose={() => setActionMenu(null)}>
      <Pressable style={styles.modalShade} onPress={() => setActionMenu(null)}><View style={styles.menuCard}>
        <Text style={styles.menuTitle}>{actionMenu?.kind === 'post' ? 'Post options' : 'Comment options'}</Text>
        {actionMenu?.kind === 'post' ? <Pressable style={styles.menuOption} onPress={() => { setActionMenu(null); router.push({ pathname: '/posts/edit/[id]', params: { id } } as any); }}><Pencil size={18} color="#E6E6E6" /><Text style={styles.menuOptionText}>Edit post</Text></Pressable> : null}
        {actionMenu?.kind === 'comment' ? <Pressable style={styles.menuOption} onPress={() => { const comment = comments.find((row) => row.id === actionMenu.id); if (comment) openCommentEdit(comment); }}><Pencil size={18} color="#E6E6E6" /><Text style={styles.menuOptionText}>Edit comment</Text></Pressable> : null}
        {actionMenu ? <Pressable style={styles.menuOption} onPress={() => { setDeleteTarget(actionMenu); setActionMenu(null); }}><Trash2 size={18} color="#FF7979" /><Text style={styles.deleteOptionText}>{actionMenu.kind === 'post' ? 'Delete post' : 'Delete comment'}</Text></Pressable> : null}
        <Pressable style={styles.menuCancel} onPress={() => setActionMenu(null)}><Text style={styles.menuCancelText}>Cancel</Text></Pressable>
      </View></Pressable>
    </Modal>
    <Modal visible={deleteTarget !== null} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
      <Pressable style={styles.modalShade} onPress={() => setDeleteTarget(null)}><View style={styles.menuCard}>
        <Text style={styles.menuTitle}>{deleteTarget?.kind === 'post' ? 'Delete post?' : 'Remove comment?'}</Text><Text style={styles.deleteHint}>{deleteTarget?.kind === 'post' ? 'This action cannot be undone.' : 'Your comment will be marked as removed. Replies will stay in the thread.'}</Text>
        <Pressable style={styles.confirmDelete} onPress={() => void confirmDelete()} disabled={saving}><Text style={styles.confirmDeleteText}>{saving ? 'Removing…' : deleteTarget?.kind === 'post' ? 'Delete' : 'Remove comment'}</Text></Pressable>
        <Pressable style={styles.menuCancel} onPress={() => setDeleteTarget(null)} disabled={saving}><Text style={styles.menuCancelText}>Cancel</Text></Pressable>
      </View></Pressable>
    </Modal>
    {!keyboardVisible ? <BottomNavBar activeTab="ideas" /> : null}
  </KeyboardAvoidingView>;
}

function CommentComposer({ label, value, onChange, placeholder, submitLabel, onSubmit, onCancel, onInputFocus, disabled = false, autoFocus = false, replyContext = false }: {
  label: string; value: string; onChange: (value: string) => void; placeholder: string; submitLabel: string; onSubmit: () => void; onCancel?: () => void; onInputFocus?: (input: TextInput | null) => void; disabled?: boolean; autoFocus?: boolean; replyContext?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const format = (kind: 'bold' | 'italic' | 'link' | 'list') => {
    const start = selection.start; const end = selection.end; const selected = value.slice(start, end);
    let next = value; let caret = start;
    if (kind === 'bold' || kind === 'italic') {
      const marker = kind === 'bold' ? '**' : '*'; const text = selected || 'text'; const wrapped = `${marker}${text}${marker}`;
      next = `${value.slice(0, start)}${wrapped}${value.slice(end)}`; caret = selected ? start + wrapped.length : start + marker.length;
    } else if (kind === 'link') {
      const text = selected || 'link text'; const wrapped = `[${text}](https://)`;
      next = `${value.slice(0, start)}${wrapped}${value.slice(end)}`; caret = start + text.length + 3;
    } else {
      const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      next = `${value.slice(0, lineStart)}- ${value.slice(lineStart)}`; caret = start + 2;
    }
    onChange(next); setSelection({ start: caret, end: caret });
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  return <View style={[styles.composerCard, replyContext && styles.replyComposerCard]}>
    <Text style={styles.composerLabel}>{label}</Text>
    <TextInput ref={inputRef} value={value} onChangeText={onChange} onSelectionChange={(event) => setSelection(event.nativeEvent.selection)} onFocus={() => onInputFocus?.(inputRef.current)} selection={selection} placeholder={placeholder} placeholderTextColor="#A4A4A4" style={styles.composerInput} multiline autoFocus={autoFocus} />
    <View style={styles.composerToolbar}>
      <Pressable onPress={() => format('bold')} style={styles.formatButton} accessibilityLabel="Bold"><Text style={styles.formatBold}>B</Text></Pressable>
      <Pressable onPress={() => format('italic')} style={styles.formatButton} accessibilityLabel="Italic"><Text style={styles.formatItalic}>I</Text></Pressable>
      <Pressable onPress={() => format('link')} style={styles.formatButton} accessibilityLabel="Insert link"><LinkIcon size={16} color="#C9C4A6" /></Pressable>
      <Pressable onPress={() => format('list')} style={styles.formatButton} accessibilityLabel="Insert list"><List size={17} color="#C9C4A6" /></Pressable>
    </View>
    <View style={styles.composerActions}>
      {onCancel ? <Pressable onPress={onCancel} style={styles.composerCancel}><Text style={styles.composerCancelText}>Cancel</Text></Pressable> : null}
      <Pressable onPress={onSubmit} disabled={disabled || !value.trim()} style={[styles.composerSubmit, (disabled || !value.trim()) && styles.composerSubmitDisabled]}><Text style={styles.composerSubmitText}>{submitLabel} ▷</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' }, header: { minHeight: 53, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#202020' }, back: { width: 38, height: 40, justifyContent: 'center' }, headerCommunity: { color: '#E5E5E5', fontFamily: 'RobotoExtraBold', fontSize: 13, marginLeft: 4, flex: 1 }, headerSpacer: { width: 38 },
  scrollView: { flex: 1 }, content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28 }, keyboardContent: { paddingBottom: 320 }, meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, author: { flexDirection: 'row', alignItems: 'center', gap: 8 }, username: { color: '#EEE', fontFamily: 'RobotoExtraBold', fontSize: 12 }, date: { color: '#888', fontFamily: 'Roboto', fontSize: 9, marginTop: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' }, title: { flex: 1, color: '#FFF', fontFamily: 'LeagueSpartanBold', fontSize: 26, lineHeight: 31, marginBottom: 10 }, more: { width: 34, height: 32, alignItems: 'center', justifyContent: 'center' }, body: { color: '#D0D0D0', fontFamily: 'Roboto', fontSize: 13, lineHeight: 21, marginBottom: 15 }, galleryWrap: { height: 330, position: 'relative', marginHorizontal: -16, marginBottom: 12, backgroundColor: '#1B1B1B' }, gallery: { height: '100%', backgroundColor: '#1B1B1B' }, image: { height: 330, backgroundColor: '#1B1B1B' }, galleryArrow: { position: 'absolute', top: '43%', width: 38, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#111B' }, galleryArrowLeft: { left: 9 }, galleryArrowRight: { right: 9 }, galleryArrowText: { color: '#FFF', fontSize: 32, lineHeight: 36 }, galleryCount: { position: 'absolute', bottom: 9, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#111C' }, galleryCountText: { color: '#FFF', fontFamily: 'RobotoExtraBold', fontSize: 10 },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#2A2A2A' }, iconAction: { minHeight: 34, minWidth: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 18, borderWidth: 1, borderColor: '#3A3A3A' }, actionCount: { color: '#D0D0D0', fontFamily: 'RobotoExtraBold', fontSize: 11 }, commentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 12 }, sectionTitle: { color: '#FFF', fontFamily: 'LeagueSpartanBold', fontSize: 18 }, sortRow: { flexDirection: 'row', gap: 11 }, sortText: { color: '#888', fontFamily: 'Roboto', fontSize: 10 }, sortSelected: { color: '#FFE600', fontFamily: 'RobotoExtraBold' },
  composerCard: { padding: 14, borderRadius: 14, backgroundColor: '#1D1D1D', marginBottom: 14, borderWidth: 1, borderColor: '#282828' }, replyComposerCard: { marginTop: 12, marginBottom: 12, marginLeft: 3, padding: 12 }, composerLabel: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontSize: 11, marginBottom: 8 }, composerInput: { minHeight: 66, maxHeight: 180, borderRadius: 10, backgroundColor: '#2B2B2B', color: '#F0F0F0', fontFamily: 'Roboto', fontSize: 13, lineHeight: 19, paddingHorizontal: 10, paddingVertical: 9, textAlignVertical: 'top' }, composerToolbar: { minHeight: 35, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 3, borderBottomWidth: 1, borderColor: '#333' }, formatButton: { minWidth: 20, alignItems: 'center', justifyContent: 'center' }, formatBold: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontSize: 15 }, formatItalic: { color: '#C9C4A6', fontFamily: 'RobotoExtraBold', fontStyle: 'italic', fontSize: 15 }, composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 10 }, composerCancel: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 10 }, composerCancelText: { color: '#BBB', fontFamily: 'RobotoExtraBold', fontSize: 11 }, composerSubmit: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 17, borderRadius: 20, backgroundColor: '#FFE600' }, composerSubmitDisabled: { opacity: .5 }, composerSubmitText: { color: '#171717', fontFamily: 'RobotoExtraBold', fontSize: 11 }, commentNode: { position: 'relative' }, commentRail: { position: 'absolute', left: 14, top: 0, bottom: 0, width: 1, backgroundColor: '#343434' }, comment: { flexDirection: 'row', gap: 9, paddingVertical: 10, marginBottom: 5 }, replyThread: { marginLeft: 18, paddingLeft: 12 }, commentCopy: { flex: 1 }, deletedAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#383838' }, commentHead: { flexDirection: 'row', alignItems: 'center' }, commentIdentity: { flex: 1 }, commentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, commentTime: { marginTop: 0 }, commentAuthor: { color: '#E7E7E7', fontFamily: 'RobotoExtraBold', fontSize: 10 }, replyingTo: { color: '#C9C4A6', fontFamily: 'Roboto', fontSize: 9, marginTop: 2 }, commentMore: { paddingHorizontal: 3, paddingVertical: 1 }, commentBody: { color: '#C4C4C4', fontFamily: 'Roboto', fontSize: 12, lineHeight: 18, marginTop: 5 }, removedComment: { color: '#888', fontFamily: 'Roboto', fontStyle: 'italic', fontSize: 12, lineHeight: 18, marginTop: 5 }, replyButton: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', marginTop: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 17 }, replyButtonText: { color: '#B6B6B6', fontFamily: 'RobotoExtraBold', fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, error: { color: '#FF7777', fontFamily: 'Roboto', fontSize: 11, padding: 12 }, modalShade: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009', padding: 14, paddingBottom: 26 }, menuCard: { padding: 15, borderRadius: 16, backgroundColor: '#202020', borderWidth: 1, borderColor: '#363636' }, menuTitle: { color: '#FFF', fontFamily: 'RobotoExtraBold', fontSize: 15, marginBottom: 8 }, menuOption: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, borderTopColor: '#343434' }, menuOptionText: { color: '#EEE', fontFamily: 'RobotoExtraBold', fontSize: 13 }, deleteOptionText: { color: '#FF7979', fontFamily: 'RobotoExtraBold', fontSize: 13 }, menuCancel: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: '#343434', marginTop: 3 }, menuCancelText: { color: '#BBB', fontFamily: 'RobotoExtraBold', fontSize: 12 }, deleteHint: { color: '#AAA', fontFamily: 'Roboto', fontSize: 12, marginBottom: 15 }, confirmDelete: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#8C2929', marginBottom: 6 }, confirmDeleteText: { color: '#FFF', fontFamily: 'RobotoExtraBold', fontSize: 12 },
});
