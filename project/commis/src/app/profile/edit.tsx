import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';
import { RichTextInput } from '@/components/rich-text-input';

const yellow = '#FFE600';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [role, setRole] = useState<'client' | 'hunter'>('hunter');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pickedImage, setPickedImage] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Sign in to edit your profile.'); setLoading(false); return; }
      setUserId(user.id);
      const { data, error: profileError } = await supabase.from('profiles').select('username, bio, active_role, avatar_url').eq('id', user.id).maybeSingle();
      if (profileError || !data) setError(profileError?.message ?? 'Profile not found.');
      else { setUsername(data.username ?? ''); setBio(data.bio ?? ''); setRole(data.active_role === 'client' ? 'client' : 'hunter'); setAvatarUrl(data.avatar_url); }
      setLoading(false);
    }
    void loadProfile();
  }, []);

  const pickPhoto = async () => {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false });
    if (!result.canceled && result.assets[0]) setPickedImage(result.assets[0]);
  };

  const save = async () => {
    const cleanedUsername = username.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanedUsername)) { setError('Username must be 3–20 letters, numbers, or underscores.'); return; }
    if (bio.length > 280) { setError('Bio must be 280 characters or fewer.'); return; }
    if (!userId) return;
    setSaving(true); setError('');
    let nextAvatarUrl = avatarUrl;
    try {
      if (pickedImage) {
        const response = await fetch(pickedImage.uri);
        const body = await response.arrayBuffer();
        const extension = (pickedImage.name.split('.').pop() ?? 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        const path = `${userId}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(path, body, { contentType: pickedImage.mimeType ?? 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        nextAvatarUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }
      const { error: saveError } = await supabase.from('profiles').update({ username: cleanedUsername, bio: bio.trim() || null, active_role: role, avatar_url: nextAvatarUrl }).eq('id', userId);
      if (saveError) throw saveError;
      router.back();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Profile could not be saved.';
      setError(message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique') ? 'That username is already taken.' : message);
    } finally { setSaving(false); }
  };

  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.headerTitle}>Edit Profile</Text><View style={{ width: 40 }} /></View>
    {loading ? <View style={styles.center}><ActivityIndicator color={yellow} /></View> : <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 20 }]}>
      <View style={styles.section}><Text style={styles.sectionTitle}>Profile Photo</Text><View style={styles.photoRow}><ProfileAvatar avatarUrl={pickedImage?.uri ?? avatarUrl} size={76} /><View style={styles.photoActions}><Pressable style={styles.changeButton} onPress={pickPhoto}><Text style={styles.changeText}>Change Photo</Text></Pressable><Pressable style={styles.removeButton} onPress={() => { setAvatarUrl(null); setPickedImage(null); }}><Text style={styles.removeText}>Remove</Text></Pressable><Text style={styles.help}>JPG, PNG or WEBP</Text></View></View></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>Username</Text><View style={styles.usernameInput}><Text style={styles.at}>@</Text><TextInput value={username} onChangeText={setUsername} maxLength={20} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="username" placeholderTextColor="#777" /></View><Text style={styles.help}>3–20 characters, letters, numbers, and underscores.</Text></View>
      <View style={styles.section}><View style={styles.rowBetween}><Text style={styles.sectionTitle}>Bio</Text><Text style={styles.help}>{bio.length}/280</Text></View><RichTextInput value={bio} onChangeText={setBio} maxLength={280} multiline textAlignVertical="top" style={[styles.input, styles.bioInput]} placeholder="Tell us a little about yourself..." placeholderTextColor="#777" /></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>Active Role</Text><Text style={styles.help}>Choose which Commis experience is active on your profile.</Text><View style={styles.roles}>{(['client', 'hunter'] as const).map((item) => <Pressable key={item} onPress={() => setRole(item)} style={[styles.roleCard, role === item && styles.roleSelected]}><Text style={[styles.roleName, role === item && { color: yellow }]}>{item === 'client' ? 'Client' : 'Hunter'}</Text><Text style={styles.help}>{item === 'client' ? 'I hire creators and post requests.' : 'I showcase skills and fulfill work.'}</Text></Pressable>)}</View></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.footer}><Pressable style={[styles.saveButton, saving && styles.disabled]} disabled={saving} onPress={save}>{saving ? <ActivityIndicator color="#171717" /> : <Text style={styles.saveText}>Save Changes</Text>}</Pressable><Pressable style={styles.cancelButton} onPress={() => router.back()}><Text style={styles.cancelText}>Cancel</Text></Pressable></View>
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#131313' }, header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#242424' }, back: { width: 40, height: 44, justifyContent: 'center' }, backText: { color: '#E5E2E1', fontSize: 34, lineHeight: 36 }, headerTitle: { flex: 1, color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 20 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: 18, gap: 15 }, section: { backgroundColor: '#1D1D1D', borderRadius: 13, padding: 15, gap: 11 }, sectionTitle: { color: '#F5F5F5', fontFamily: 'LeagueSpartanBold', fontSize: 17 }, photoRow: { flexDirection: 'row', gap: 15, alignItems: 'center' }, photoActions: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, changeButton: { backgroundColor: yellow, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }, changeText: { color: '#171717', fontFamily: 'RobotoExtraBold', fontSize: 11 }, removeButton: { backgroundColor: '#2A2A2A', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }, removeText: { color: '#FF8989', fontFamily: 'RobotoExtraBold', fontSize: 11 }, help: { color: '#888888', fontFamily: 'Roboto', fontSize: 10, lineHeight: 15 }, usernameInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#292929', borderRadius: 10, paddingHorizontal: 11 }, at: { color: '#AAAAAA', fontFamily: 'LeagueSpartanBold', fontSize: 17 }, input: { flex: 1, minHeight: 43, color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 13 }, bioInput: { backgroundColor: '#292929', borderRadius: 10, padding: 11, minHeight: 104 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, roles: { gap: 9 }, roleCard: { padding: 13, gap: 5, backgroundColor: '#292929', borderWidth: 1, borderColor: '#303030', borderRadius: 10 }, roleSelected: { backgroundColor: '#302F1C', borderColor: '#746900' }, roleName: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 13 }, error: { color: '#FF8989', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center' }, footer: { gap: 9 }, saveButton: { height: 46, backgroundColor: yellow, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.65 }, saveText: { color: '#171717', fontFamily: 'RobotoExtraBold', fontSize: 13 }, cancelButton: { height: 42, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: '#AAAAAA', fontFamily: 'RobotoExtraBold', fontSize: 12 } });
