import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

const yellow = '#FFE600';

export default function StartConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const otherUserId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function open() {
      if (!otherUserId) { setError('This profile link is missing its ID.'); return; }
      const { data, error: rpcError } = await supabase.rpc('get_or_create_direct_conversation', { p_other_user_id: otherUserId });
      if (!active) return;
      if (rpcError || typeof data !== 'string') { setError(rpcError?.message ?? 'Could not open this conversation.'); return; }
      router.replace({ pathname: '/messages/[id]', params: { id: data } } as any);
    }
    void open();
    return () => { active = false; };
  }, [otherUserId, router]);

  return <View style={[styles.root, { paddingTop: insets.top }]}>
    {error ? <><Text style={styles.error}>{error}</Text><Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Go Back</Text></Pressable></> : <><ActivityIndicator color={yellow} /><Text style={styles.loading}>Opening conversation…</Text></>}
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#131313', alignItems: 'center', justifyContent: 'center', gap: 15, padding: 24 }, loading: { color: '#A6A6AB', fontFamily: 'Roboto', fontSize: 13 }, error: { color: '#FF8989', fontFamily: 'Roboto', fontSize: 13, textAlign: 'center' }, button: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 22, backgroundColor: yellow }, buttonText: { color: '#201C00', fontFamily: 'RobotoExtraBold', fontSize: 12 } });
