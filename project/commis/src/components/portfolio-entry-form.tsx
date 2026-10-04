import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { RichTextInput } from '@/components/rich-text-input';

type Category = { id: string; name: string };
type Entry = { id: string; user_id: string; title: string; subtitle: string | null; description: string | null; category_id: string | null; image_url: string | null; skills: string[] | null; project_url: string | null };
const yellow = '#FFE600';

export function PortfolioEntryForm({ edit = false }: { edit?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [userId, setUserId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: { user } }, categoryResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('categories').select('id, name').order('name'),
      ]);
      if (!user) { setError('Sign in to manage portfolio entries.'); setLoading(false); return; }
      setUserId(user.id);
      setCategories((categoryResult.data ?? []) as Category[]);
      if (categoryResult.error) setError(`Categories could not be loaded: ${categoryResult.error.message}`);
      if (edit && entryId) {
        const { data, error: entryError } = await supabase.from('portfolio_entries').select('id, user_id, title, subtitle, description, category_id, image_url, skills, project_url').eq('id', entryId).maybeSingle();
        if (entryError || !data) setError(entryError?.message ?? 'Portfolio entry not found.');
        else {
          const entry = data as Entry;
          if (entry.user_id !== user.id) setError('You can only edit your own portfolio entries.');
          else {
            setTitle(entry.title);
            setDescription(entry.description ?? entry.subtitle ?? '');
            setCategoryId(entry.category_id);
            setProjectUrl(entry.project_url ?? '');
            setSkills(entry.skills ?? []);
            setImageUrl(entry.image_url);
          }
        }
      }
      setLoading(false);
    }
    void load();
  }, [edit, entryId]);

  const addSkill = () => {
    const value = skillInput.trim().replace(/\s+/g, ' ');
    if (!value || skills.some((skill) => skill.toLocaleLowerCase() === value.toLocaleLowerCase())) { setSkillInput(''); return; }
    setSkills((current) => [...current, value]); setSkillInput(''); Keyboard.dismiss();
  };

  const selectedCategory = categories.find((category) => category.id === categoryId);
  const matchingCategories = categorySearch.trim()
    ? categories.filter((category) => category.name.toLocaleLowerCase().includes(categorySearch.trim().toLocaleLowerCase())).slice(0, 8)
    : [];

  const pickCover = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false });
    if (!result.canceled && result.assets[0]) setImageFile(result.assets[0]);
  };

  const submit = async () => {
    setError('');
    const cleanTitle = title.trim();
    if (!cleanTitle) { setError('Add a title for this project.'); return; }
    if (description.trim().length > 1000) { setError('Description must be 1000 characters or fewer.'); return; }
    if (projectUrl.trim()) {
      try { const parsed = new URL(projectUrl.trim()); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
      catch { setError('Enter a valid link beginning with https://'); return; }
    }
    if (!userId) return;
    setSaving(true);
    try {
      let nextImageUrl = imageUrl;
      if (imageFile) {
        const response = await fetch(imageFile.uri);
        const fileBody = await response.arrayBuffer();
        const extension = (imageFile.name.split('.').pop() ?? 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        const path = `${userId}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('portfolio-media').upload(path, fileBody, { contentType: imageFile.mimeType ?? 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        nextImageUrl = supabase.storage.from('portfolio-media').getPublicUrl(path).data.publicUrl;
      }
      const values = {
        title: cleanTitle,
        subtitle: description.trim() ? description.trim().slice(0, 160) : null,
        description: description.trim() || null,
        category_id: categoryId,
        image_url: nextImageUrl,
        skills,
        project_url: projectUrl.trim() || null,
      };
      const result = edit && entryId
        ? await supabase.from('portfolio_entries').update(values).eq('id', entryId).eq('user_id', userId)
        : await supabase.from('portfolio_entries').insert({ ...values, user_id: userId });
      if (result.error) throw result.error;
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this portfolio entry.');
    } finally { setSaving(false); }
  };

  const deleteEntry = async () => {
    if (!entryId || !userId) return;
    setDeleting(true); setError('');
    const { error: deleteError } = await supabase.from('portfolio_entries').delete().eq('id', entryId).eq('user_id', userId);
    setDeleting(false);
    if (deleteError) { setShowDelete(false); setError(deleteError.message); return; }
    setShowDelete(false); router.replace('/profile' as any);
  };

  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.headerTitle}>{edit ? 'Edit Portfolio Entry' : 'Add Portfolio Entry'}</Text><View style={{ width: 35 }} /></View>
    {loading ? <View style={styles.center}><ActivityIndicator color={yellow} /></View> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
      <View style={styles.field}><Text style={styles.label}>Project Title <Text style={styles.required}>*</Text></Text><TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g., E-Commerce Mobile App UI" placeholderTextColor="#777" style={styles.input} /></View>
      <View style={styles.field}><View style={styles.labelRow}><Text style={styles.label}>Description</Text><Text style={styles.counter}>{description.length} / 1000</Text></View><RichTextInput value={description} onChangeText={setDescription} multiline maxLength={1000} textAlignVertical="top" placeholder="Describe the project, what you worked on, and the result..." placeholderTextColor="#777" style={[styles.input, styles.multiline]} /></View>
      <View style={styles.field}><Text style={styles.label}>Category</Text><Text style={styles.hint}>Search and select the closest category for this project.</Text><View style={styles.categorySearchBox}><Text style={styles.searchIcon}>⌕</Text><TextInput value={categorySearch} onChangeText={setCategorySearch} placeholder="Search categories..." placeholderTextColor="#777" style={styles.categorySearchInput} returnKeyType="search" /></View>{selectedCategory ? <View style={styles.selectedCategory}><Text style={styles.selectedCategoryText}>{selectedCategory.name}</Text><Pressable onPress={() => setCategoryId(null)} accessibilityRole="button" accessibilityLabel="Clear selected category"><Text style={styles.clearCategory}>×</Text></Pressable></View> : null}{categorySearch.trim() ? <View style={styles.categoryResults}>{matchingCategories.length ? matchingCategories.map((category) => <Pressable key={category.id} onPress={() => { setCategoryId(category.id); setCategorySearch(''); Keyboard.dismiss(); }} style={styles.categoryResult}><Text style={styles.categoryResultText}>{category.name}</Text></Pressable>) : <Text style={styles.noCategories}>No matching categories.</Text>}</View> : null}</View>
      <View style={styles.field}><Text style={styles.label}>Skills <Text style={styles.optional}>(Optional)</Text></Text><View style={styles.skillInputRow}><TextInput value={skillInput} onChangeText={setSkillInput} onSubmitEditing={addSkill} returnKeyType="done" placeholder="Type a skill and hit enter..." placeholderTextColor="#777" style={styles.skillInput} /><Pressable onPress={addSkill} style={styles.addSkill}><Text style={styles.addSkillText}>＋ Add</Text></Pressable></View><View style={styles.chips}>{skills.map((skill) => <Pressable key={skill} onPress={() => setSkills((current) => current.filter((item) => item !== skill))} style={styles.skillChip}><Text style={styles.categoryText}>{skill}  ×</Text></Pressable>)}</View></View>
      <View style={styles.field}><Text style={styles.label}>Project Link <Text style={styles.optional}>(Optional)</Text></Text><TextInput value={projectUrl} onChangeText={setProjectUrl} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor="#777" style={styles.input} /></View>
      <View style={styles.field}><View style={styles.labelRow}><Text style={styles.label}>Cover Image</Text><Text style={styles.optional}>(Optional)</Text></View><Pressable onPress={pickCover} style={styles.coverPicker}>{imageFile?.uri || imageUrl ? <Image source={{ uri: imageFile?.uri ?? imageUrl! }} style={styles.coverPreview} contentFit="cover" /> : <View style={styles.coverPlaceholder}><Text style={styles.coverPlus}>＋</Text><Text style={styles.coverTitle}>Add Cover Image</Text><Text style={styles.hint}>Recommended 16:9 or 4:3 · JPG, PNG or WEBP</Text></View>}</Pressable>{imageFile || imageUrl ? <View style={styles.coverActions}><Text style={styles.hint}>{imageFile?.name ?? 'Cover image added'}</Text><Pressable onPress={() => { setImageFile(null); setImageUrl(null); }}><Text style={styles.removeText}>Remove image</Text></Pressable></View> : null}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={() => void submit()} disabled={saving} style={[styles.primaryButton, saving && { opacity: 0.6 }]}>{saving ? <ActivityIndicator color="#201C00" /> : <Text style={styles.primaryText}>{edit ? 'Save Changes' : 'Add to Portfolio'}</Text>}</Pressable>
      <Pressable onPress={() => router.back()} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      {edit ? <Pressable onPress={() => setShowDelete(true)} style={styles.deleteEntryButton}><Text style={styles.deleteEntryText}>Delete Entry</Text></Pressable> : null}
    </ScrollView>}
    <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalTitle}>Delete Portfolio Entry?</Text><Text style={styles.modalBody}>This will permanently remove “{title}” from your portfolio.</Text><View style={styles.modalActions}><Pressable onPress={() => setShowDelete(false)} style={styles.modalCancel}><Text style={styles.modalCancelText}>Keep Entry</Text></Pressable><Pressable onPress={() => void deleteEntry()} disabled={deleting} style={styles.modalDelete}>{deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalDeleteText}>Delete</Text>}</Pressable></View></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#131313' }, header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#242424' }, back: { width: 35, height: 44, justifyContent: 'center' }, backText: { color: '#E5E2E1', fontSize: 32 }, headerTitle: { flex: 1, color: '#E5E2E1', fontFamily: 'LeagueSpartanBold', fontSize: 18 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: 18, gap: 19 }, field: { gap: 8 }, labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, label: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 14 }, required: { color: yellow }, optional: { color: '#898989', fontFamily: 'Roboto', fontSize: 11 }, counter: { color: '#898989', fontFamily: 'Roboto', fontSize: 10 }, hint: { color: '#898989', fontFamily: 'Roboto', fontSize: 10, lineHeight: 15 }, input: { minHeight: 47, paddingHorizontal: 13, borderRadius: 11, backgroundColor: '#1E1E1E', color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 13 }, multiline: { minHeight: 128, paddingTop: 12, lineHeight: 19 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, categorySearchBox: { minHeight: 47, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#303030' }, searchIcon: { color: '#A5A5A5', fontSize: 22, marginRight: 8 }, categorySearchInput: { flex: 1, minHeight: 45, color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 13 }, categoryResults: { maxHeight: 210, overflow: 'hidden', borderRadius: 10, backgroundColor: '#202020', borderWidth: 1, borderColor: '#303030' }, categoryResult: { minHeight: 41, justifyContent: 'center', paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: '#303030' }, categoryResultText: { color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 12 }, noCategories: { padding: 13, color: '#898989', fontFamily: 'Roboto', fontSize: 11 }, selectedCategory: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, paddingLeft: 11, paddingRight: 8, borderRadius: 18, backgroundColor: '#34300F', borderWidth: 1, borderColor: '#5A541A' }, selectedCategoryText: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 11 }, clearCategory: { color: yellow, fontSize: 17, lineHeight: 18 }, skillInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: 11, backgroundColor: '#1E1E1E' }, skillInput: { flex: 1, minHeight: 46, color: '#E5E2E1', fontFamily: 'Roboto', fontSize: 12 }, addSkill: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, backgroundColor: '#303030' }, addSkillText: { color: yellow, fontFamily: 'RobotoExtraBold', fontSize: 11 }, categoryText: { color: '#C8C6C8', fontFamily: 'Roboto', fontSize: 11 }, skillChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, backgroundColor: '#292929' }, coverPicker: { overflow: 'hidden', minHeight: 170, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: '#4A451A', backgroundColor: '#1B1B1B' }, coverPreview: { width: '100%', aspectRatio: 16 / 9 }, coverPlaceholder: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 12 }, coverPlus: { color: yellow, fontSize: 28 }, coverTitle: { color: '#E5E2E1', fontFamily: 'RobotoExtraBold', fontSize: 13 }, coverActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, removeText: { color: '#FF8888', fontFamily: 'RobotoExtraBold', fontSize: 11 }, error: { color: '#FF8989', fontFamily: 'Roboto', fontSize: 12, textAlign: 'center' }, primaryButton: { minHeight: 48, borderRadius: 24, backgroundColor: yellow, alignItems: 'center', justifyContent: 'center', marginTop: 1 }, primaryText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 13 }, cancelButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#202020' }, cancelText: { color: '#C8C6C8', fontFamily: 'RobotoExtraBold', fontSize: 12 }, deleteEntryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' }, deleteEntryText: { color: '#FF7777', fontFamily: 'RobotoExtraBold', fontSize: 12 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 22 }, modalCard: { width: '100%', maxWidth: 360, padding: 21, borderRadius: 17, backgroundColor: '#292929', gap: 12 }, modalTitle: { color: '#FFFFFF', fontFamily: 'LeagueSpartanBold', fontSize: 20 }, modalBody: { color: '#C8C6C8', fontFamily: 'Roboto', fontSize: 13, lineHeight: 19 }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 }, modalCancel: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#414141' }, modalCancelText: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 12 }, modalDelete: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#B93838' }, modalDeleteText: { color: '#FFFFFF', fontFamily: 'RobotoExtraBold', fontSize: 12 } });
