import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

interface GoogleSignInResult {
  error: Error | null;
  cancelled: boolean;
}

export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    return { error: error ?? new Error('No auth URL returned'), cancelled: false } satisfies GoogleSignInResult;
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { createTask: false });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { error: null, cancelled: true } satisfies GoogleSignInResult;
  }

  if (result.type !== 'success' || !result.url) {
    return { error: new Error('Google sign-in did not complete'), cancelled: false } satisfies GoogleSignInResult;
  }

  const url = new URL(result.url.replace('#', '?'));
  const access_token = url.searchParams.get('access_token');
  const refresh_token = url.searchParams.get('refresh_token');

  if (!access_token || !refresh_token) {
    return { error: new Error('No tokens in callback URL'), cancelled: false } satisfies GoogleSignInResult;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (sessionError) {
    return { error: sessionError, cancelled: false } satisfies GoogleSignInResult;
  }

  return { error: null, cancelled: false } satisfies GoogleSignInResult;
}
