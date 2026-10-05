import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const isBrowser = Platform.OS === 'web' && typeof window !== 'undefined';
const storage = Platform.OS === 'web'
  ? isBrowser ? window.localStorage : undefined
  : AsyncStorage;

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      ...(storage ? { storage } : {}),
      autoRefreshToken: Platform.OS !== 'web' || isBrowser,
      persistSession: true,
      // On web, Supabase must consume the OAuth callback URL after the browser
      // returns from Google. Native flows receive tokens through WebBrowser.
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);
