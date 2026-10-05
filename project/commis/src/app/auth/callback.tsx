import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export default function GoogleAuthCallbackScreen() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState('');
  const handledSignIn = useRef(false);

  useEffect(() => {
    let active = true;

    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session || handledSignIn.current) return;
      handledSignIn.current = true;
      setTimeout(() => void routeUser(session), 0);
    });

    async function routeUser(session: Session) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('username, active_role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        handledSignIn.current = false;
        setErrorMessage('Could not load your profile. Please try signing in again.');
        return;
      }

      const hasUsername = typeof profile?.username === 'string' && profile.username.length > 0;
      const hasRole = profile?.active_role === 'client' || profile?.active_role === 'hunter';

      if (hasUsername && hasRole) {
        router.replace((profile?.active_role === 'hunter' ? '/home' : '/marketplace') as any);
      } else {
        router.replace('/google-profile');
      }
    }

    return () => {
      active = false;
      subscription.data.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{errorMessage || 'Finishing Google sign-in...'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#302F2D',
    padding: 24,
  },
  message: {
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    fontSize: 16,
    textAlign: 'center',
  },
});
