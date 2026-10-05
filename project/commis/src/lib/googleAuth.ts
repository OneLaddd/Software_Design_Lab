import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const NATIVE_AUTH_REDIRECT = 'commis://auth/callback';

interface GoogleSignInResult {
  error: Error | null;
  cancelled: boolean;
  redirecting?: boolean;
}

export async function signInWithGoogle() {
  const isWeb = Platform.OS === 'web';
  // Use the registered app scheme on native so the callback survives changing
  // Metro IPs. The web build still returns to its current web origin.
  const redirectTo = isWeb
    ? Linking.createURL('auth/callback')
    : NATIVE_AUTH_REDIRECT;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return { error: error ?? new Error('No auth URL returned'), cancelled: false } satisfies GoogleSignInResult;
  }

  if (isWeb) {
    // Use a same-tab redirect. Supabase consumes the returned session at
    // /auth/callback, which then routes the signed-in user.
    window.location.assign(data.url);
    return { error: null, cancelled: false, redirecting: true } satisfies GoogleSignInResult;
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

  const signedInUser = sessionData.user;
  const googleAvatar = signedInUser?.user_metadata?.avatar_url ?? signedInUser?.user_metadata?.picture;
  if (signedInUser && typeof googleAvatar === 'string' && googleAvatar.length > 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', signedInUser.id)
      .maybeSingle();
    // Populate missing Google photos but preserve a profile photo the user chose.
    if (!profile?.avatar_url) {
      await supabase.from('profiles').update({ avatar_url: googleAvatar }).eq('id', signedInUser.id);
    }
  }

  return { error: null, cancelled: false } satisfies GoogleSignInResult;
}

export async function getSignInDestination(): Promise<'/home' | '/marketplace' | '/google-profile'> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error('Google sign-in session was not found.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('username, active_role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const hasUsername = typeof profile?.username === 'string' && profile.username.length > 0;
  if (!hasUsername || (profile?.active_role !== 'client' && profile?.active_role !== 'hunter')) {
    return '/google-profile';
  }
  return profile.active_role === 'hunter' ? '/home' : '/marketplace';
}
