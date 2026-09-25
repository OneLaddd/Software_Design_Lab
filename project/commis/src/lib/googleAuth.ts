import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth/callback');
  console.log('redirectTo:', redirectTo);
  

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    return { error: error ?? new Error('No auth URL returned') };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    return { error: new Error('Sign-in was cancelled') };
  }

  const url = new URL(result.url.replace('#', '?'));
  const access_token = url.searchParams.get('access_token');
  const refresh_token = url.searchParams.get('refresh_token');

  if (!access_token || !refresh_token) {
    return { error: new Error('No tokens in callback URL') };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (sessionError) {
    return { data: sessionData, error: sessionError, needsProfileSetup: false };
  }

  const userId = sessionData.session?.user.id;
  if (!userId) {
    return {
      data: sessionData,
      error: new Error('No user returned from Google sign-in'),
      needsProfileSetup: false,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('username, active_role')
    .eq('id', userId)
    .maybeSingle();

  return {
    data: sessionData,
    error: profileError,
    needsProfileSetup: !profile?.username,
  };
}
