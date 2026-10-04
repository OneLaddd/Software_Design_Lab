import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';
import { RichTextInput } from '@/components/rich-text-input';
import { MarkdownText } from '@/components/markdown-text';

type Profile = { id: string; username: string | null; avatar_url: string | null; active_role: string | null };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; read_at: string | null; attachment_path: string | null; attachment_name: string | null; attachment_mime_type: string | null; attachment_size: number | null; attachmentUrl?: string | null };
const yellow = '#FFE600';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function messageTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function readableSize(size: number | null): string {
  if (!size) return '';
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [viewerId, setViewerId] = useState('');
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const messageScrollRef = useRef<ScrollView>(null);

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => messageScrollRef.current?.scrollToEnd({ animated }));
  }, []);

  const loadMessages = useCallback(async () => {
    if (!conversationId) { setError('This conversation link is missing its ID.'); setLoading(false); return; }
    setError('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { setError('Sign in to view this conversation.'); setLoading(false); return; }
    setViewerId(user.id);
    const [participantsResult, messagesResult] = await Promise.all([
      supabase.from('conversation_participants').select('user_id').eq('conversation_id', conversationId),
      supabase.from('messages').select('id, conversation_id, sender_id, body, created_at, read_at, attachment_path, attachment_name, attachment_mime_type, attachment_size').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
    ]);
    if (participantsResult.error || messagesResult.error) {
      setError((participantsResult.error ?? messagesResult.error)?.message ?? 'Could not load this conversation.');
      setLoading(false);
      return;
    }
    const participantIds = [...new Set((participantsResult.data ?? []).map((row) => row.user_id as string))];
    if (!participantIds.includes(user.id)) { setError('You do not have access to this conversation.'); setLoading(false); return; }
    const otherId = participantIds.find((id) => id !== user.id);
    if (!otherId) { setError('The other participant could not be found.'); setLoading(false); return; }
    const [profileResult, rowsWithLinks] = await Promise.all([
      supabase.from('profiles').select('id, username, avatar_url, active_role').eq('id', otherId).maybeSingle(),
      Promise.all(((messagesResult.data ?? []) as Message[]).map(async (message) => {
        if (!message.attachment_path) return message;
        const { data } = await supabase.storage.from('message-attachments').createSignedUrl(message.attachment_path, 60 * 60);
        return { ...message, attachmentUrl: data?.signedUrl ?? null };
      })),
    ]);
    setOtherUser(profileResult.data as Profile | null);
    setMessages(rowsWithLinks);
    const unreadIds = (messagesResult.data ?? []).filter((message) => message.sender_id !== user.id && !message.read_at).map((message) => message.id);
    if (unreadIds.length) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
    }
    setLoading(false);
  }, [conversationId]);

  useFocusEffect(useCallback(() => { void loadMessages(); }, [loadMessages]));

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase.channel(`direct-message-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, () => { void loadMessages(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, loadMessages]);

  const canSend = useMemo(() => Boolean(draft.trim() || file) && !sending, [draft, file, sending]);

  const pickFile = async (imagesOnly: boolean) => {
    setShowAttachments(false);
    const result = await DocumentPicker.getDocumentAsync({ type: imagesOnly ? 'image/*' : '*/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    if (picked.size != null && picked.size > MAX_FILE_SIZE) { setSendError('Attachments must be 10 MB or smaller.'); return; }
    const mimeType = picked.mimeType ?? (imagesOnly ? 'image/jpeg' : 'application/octet-stream');
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'application/octet-stream'];
    if (!allowedMimeTypes.includes(mimeType)) { setSendError('Choose a JPG, PNG, GIF, WEBP, PDF, ZIP, Office, or text file.'); return; }
    setSendError(''); setFile(picked);
  };

  const sendMessage = async () => {
    if (!conversationId || !viewerId || !canSend) return;
    setSending(true); setSendError('');
    let attachmentPath: string | null = null;
    try {
      let attachmentMimeType: string | null = null;
      if (file) {
        const response = await fetch(file.uri);
        const body = await response.arrayBuffer();
        attachmentMimeType = file.mimeType ?? 'application/octet-stream';
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'attachment';
        const extension = safeName.includes('.') ? safeName.split('.').pop()! : 'bin';
        attachmentPath = `${conversationId}/${viewerId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('message-attachments').upload(attachmentPath, body, { contentType: attachmentMimeType, upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error: insertError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: viewerId,
        body: draft.trim(),
        attachment_path: attachmentPath,
        attachment_name: file?.name ?? null,
        attachment_mime_type: attachmentMimeType,
        attachment_size: file?.size ?? null,
      });
      if (insertError) throw insertError;
      setDraft(''); setFile(null); setShowAttachments(false);
      await loadMessages();
    } catch (sendFailure) {
      if (attachmentPath) await supabase.storage.from('message-attachments').remove([attachmentPath]);
      setSendError(sendFailure instanceof Error ? sendFailure.message : 'Your message could not be sent.');
    } finally { setSending(false); }
  };

  const openProfile = () => {
    if (otherUser) router.push({ pathname: '/profile/[id]', params: { id: otherUser.id } } as any);
  };

  return <KeyboardAvoidingView
    style={[styles.root, { paddingTop: insets.top }]}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><Text style={styles.backText}>‹</Text></Pressable>
      <Pressable style={styles.identity} onPress={openProfile} disabled={!otherUser} accessibilityRole="button" accessibilityLabel="View profile">
        <ProfileAvatar avatarUrl={otherUser?.avatar_url} size={40} />
        <View style={styles.identityText}><Text style={styles.username} numberOfLines={1}>@{otherUser?.username ?? 'Commis member'}</Text><Text style={styles.role}>{otherUser?.active_role === 'client' ? 'Client' : 'Hunter'}</Text></View>
      </Pressable>
      <Pressable onPress={openProfile} style={styles.profileAction} accessibilityRole="button" accessibilityLabel="View profile"><Text style={styles.profileActionText}>Profile</Text></Pressable>
    </View>

    {loading ? <View style={styles.center}><ActivityIndicator color={yellow} /><Text style={styles.muted}>Loading conversation…</Text></View> : error ? <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable onPress={() => void loadMessages()} style={styles.retry}><Text style={styles.retryText}>Try Again</Text></Pressable></View> : <>
      <ScrollView
        ref={messageScrollRef}
        style={styles.messageScroll}
        contentContainerStyle={[styles.messageContent, messages.length === 0 && styles.emptyMessageContent]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollToLatest(false)}>
        {messages.length === 0 ? <View style={styles.emptyConversation}>
          <ProfileAvatar avatarUrl={otherUser?.avatar_url} size={78} style={styles.emptyAvatar} />
          <Text style={styles.emptyName}>@{otherUser?.username ?? 'Commis member'}</Text>
          <Text style={styles.emptyDescription}>This is the beginning of your conversation with <Text style={styles.emptyNameInline}>@{otherUser?.username ?? 'this member'}</Text>.</Text>
        </View> : messages.map((message) => {
          const mine = message.sender_id === viewerId;
          const isImage = Boolean(message.attachment_mime_type?.startsWith('image/'));
          return <View key={message.id} style={[styles.messageRow, mine ? styles.sentRow : styles.receivedRow]}>
            <View style={[styles.bubble, mine ? styles.sentBubble : styles.receivedBubble]}>
              {message.attachment_path ? <Pressable onPress={() => message.attachmentUrl && void Linking.openURL(message.attachmentUrl)} disabled={!message.attachmentUrl} style={styles.attachment}>
                {isImage && message.attachmentUrl ? <Image source={{ uri: message.attachmentUrl }} style={styles.attachmentImage} contentFit="cover" /> : <View style={[styles.fileIcon, mine && styles.fileIconMine]}><Text style={styles.fileIconText}>↧</Text></View>}
                <View style={styles.fileInfo}><Text numberOfLines={2} style={[styles.fileName, mine && styles.fileNameMine]}>{message.attachment_name ?? 'Attachment'}</Text><Text style={[styles.fileSize, mine && styles.fileSizeMine]}>{readableSize(message.attachment_size)}{!message.attachmentUrl ? ' · Unavailable' : ''}</Text></View>
                {isImage ? null : <Text style={[styles.openFile, mine && styles.openFileMine]}>Open</Text>}
              </Pressable> : null}
              {message.body.trim() ? <MarkdownText linkColor={mine ? '#171500' : '#FFE600'} style={[styles.body, mine && styles.bodyMine]}>{message.body}</MarkdownText> : null}
            </View>
            <View style={[styles.messageMeta, mine && styles.sentMeta]}><Text style={styles.time}>{messageTime(message.created_at)}</Text>{mine && message.read_at ? <Text style={styles.readMark}>✓✓</Text> : null}</View>
          </View>;
        })}
      </ScrollView>

      {showAttachments ? <View style={styles.attachmentPanel}>
        <View style={styles.panelHeader}><Text style={styles.panelTitle}>Share Attachment</Text><Pressable onPress={() => setShowAttachments(false)}><Text style={styles.closePanel}>×</Text></Pressable></View>
        <View style={styles.panelOptions}>
          <Pressable onPress={() => void pickFile(true)} style={styles.panelOption}><Text style={styles.optionIcon}>▧</Text><View><Text style={styles.optionTitle}>Photo</Text><Text style={styles.optionHint}>JPG, PNG, GIF, WEBP</Text></View></Pressable>
          <Pressable onPress={() => void pickFile(false)} style={styles.panelOption}><Text style={[styles.optionIcon, styles.documentIcon]}>▤</Text><View><Text style={styles.optionTitle}>File</Text><Text style={styles.optionHint}>PDF, ZIP, Office, text</Text></View></Pressable>
        </View>
      </View> : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 20) + 14 }]}>
        {file ? <View style={styles.pendingFile}><Text numberOfLines={1} style={styles.pendingFileName}>{file.name} · {readableSize(file.size ?? null)}</Text><Pressable onPress={() => setFile(null)}><Text style={styles.removeFile}>×</Text></Pressable></View> : null}
        {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
        <RichTextInput value={draft} onChangeText={setDraft} multiline maxLength={4000} placeholder="Type a message..." placeholderTextColor="#858585" style={styles.chatInput} toolbarStyle={styles.chatToolbar} buttonColor="#BFC0C1" returnKeyType="default" onFocus={() => scrollToLatest()} />
        <View style={styles.composerRow}>
          <Pressable onPress={() => { setSendError(''); setShowAttachments((value) => !value); }} style={styles.plusButton} accessibilityRole="button" accessibilityLabel="Add attachment"><Text style={styles.plus}>＋</Text></Pressable>
          <Pressable onPress={() => void sendMessage()} disabled={!canSend} style={[styles.sendButton, canSend && styles.sendActive]} accessibilityRole="button" accessibilityLabel="Send message"><Text style={[styles.sendText, canSend && styles.sendTextActive]}>{sending ? '…' : 'Send'}</Text><Text style={[styles.sendArrow, canSend && styles.sendTextActive]}>➤</Text></Pressable>
        </View>
      </View>
    </>}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#131313' }, header: { minHeight: 63, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#262626' }, back: { width: 32, height: 44, justifyContent: 'center' }, backText: { color: '#E5E2E1', fontSize: 33 }, identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }, identityText: { flex: 1, minWidth: 0 }, username: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 13 }, role: { alignSelf: 'flex-start', color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 9, marginTop: 4, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: '#292929', borderRadius: 5 }, profileAction: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#242424' }, profileActionText: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 10 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 11, padding: 24 }, muted: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12 }, error: { color: '#FF8989', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center' }, retry: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: '#2A2A2A' }, retryText: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 11 }, messageScroll: { flex: 1 }, messageContent: { paddingHorizontal: 17, paddingTop: 18, paddingBottom: 20, gap: 13 }, emptyMessageContent: { flexGrow: 1 }, emptyConversation: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 36, gap: 10 }, emptyAvatar: { borderWidth: 1, borderColor: '#444444', marginBottom: 3 }, emptyName: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 14 }, emptyDescription: { maxWidth: 250, color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 4 }, emptyNameInline: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold' }, messageRow: { maxWidth: '83%', gap: 4 }, sentRow: { alignSelf: 'flex-end', alignItems: 'flex-end' }, receivedRow: { alignSelf: 'flex-start', alignItems: 'flex-start' }, bubble: { maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 }, sentBubble: { backgroundColor: yellow, borderBottomRightRadius: 4 }, receivedBubble: { backgroundColor: '#1F1E1E', borderWidth: 1, borderColor: '#2B2B2B', borderBottomLeftRadius: 4 }, body: { color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 13, lineHeight: 19 }, bodyMine: { color: '#111111' }, messageMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7 }, sentMeta: { justifyContent: 'flex-end' }, time: { color: '#777777', fontFamily: 'Roboto', fontSize: 9 }, readMark: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 10 }, attachment: { maxWidth: 230, minWidth: 170, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }, attachmentImage: { width: 196, height: 130, borderRadius: 11, backgroundColor: '#222222' }, fileIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#333333' }, fileIconMine: { backgroundColor: 'rgba(0,0,0,0.1)' }, fileIconText: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 20 }, fileInfo: { flex: 1, minWidth: 0 }, fileName: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 11 }, fileNameMine: { color: '#141414' }, fileSize: { color: '#999999', fontFamily: 'Roboto', fontSize: 9, marginTop: 3 }, fileSizeMine: { color: '#444000' }, openFile: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 10 }, openFileMine: { color: '#141414' }, attachmentPanel: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#181818', borderTopWidth: 1, borderTopColor: '#282828' }, panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }, panelTitle: { color: '#A6A6AB', fontFamily: 'RobotoExtraBold', fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' }, closePanel: { color: '#A6A6AB', fontSize: 22, lineHeight: 24 }, panelOptions: { flexDirection: 'row', gap: 9 }, panelOption: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderRadius: 11, backgroundColor: '#202020', borderWidth: 1, borderColor: '#303030' }, optionIcon: { color: yellow, fontSize: 21 }, documentIcon: { color: '#8BB7FF' }, optionTitle: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 11 }, optionHint: { color: '#999999', fontFamily: 'Roboto', fontSize: 9, marginTop: 3 }, composer: { paddingHorizontal: 13, paddingTop: 10, gap: 9, backgroundColor: '#161616', borderTopWidth: 1, borderTopColor: '#292929' }, composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, plusButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#292929' }, plus: { color: '#FFFFFF', fontFamily: 'Roboto', fontSize: 25, lineHeight: 28 }, input: { flex: 1, minHeight: 42, maxHeight: 110, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 9, borderRadius: 22, backgroundColor: '#1F1E1E', borderWidth: 1, borderColor: '#383838', color: '#FFFFFF', fontFamily: 'Roboto', fontSize: 12 }, chatInput: { minHeight: 48, maxHeight: 110, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderRadius: 18, backgroundColor: '#1F1E1E', borderWidth: 1, borderColor: '#383838', color: '#FFFFFF', fontFamily: 'Roboto', fontSize: 13 }, chatToolbar: { minHeight: 32, backgroundColor: '#191919', paddingHorizontal: 5 }, sendButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 13, borderRadius: 22, backgroundColor: '#292929' }, sendActive: { backgroundColor: yellow }, sendText: { color: '#747474', fontFamily: 'RobotoExtraBold', fontSize: 10 }, sendTextActive: { color: '#151515' }, sendArrow: { color: '#747474', fontSize: 11 }, pendingFile: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%', marginBottom: 8, paddingLeft: 11, paddingRight: 7, borderRadius: 17, backgroundColor: '#292929' }, pendingFileName: { maxWidth: 245, color: '#DADADA', fontFamily: 'Roboto', fontSize: 10 }, removeFile: { color: '#FFFFFF', fontSize: 18, paddingHorizontal: 3 }, sendError: { color: '#FF8989', fontFamily: 'Roboto', fontSize: 10, marginBottom: 6, paddingHorizontal: 4 },
});
