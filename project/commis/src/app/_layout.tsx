import { Slot, usePathname, useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';

const fontAssets = {
  Agrandir: require('@/assets/fonts/Agrandir-Regular.otf'),
  LeagueSpartanBold: require('@/assets/fonts/LeagueSpartan-Bold.ttf'),
  LeagueSpartanExtraBold: require('@/assets/fonts/LeagueSpartan-ExtraBold.ttf'),
  OpenSauceOneBold: require('@/assets/fonts/OpenSauceOne-Bold.ttf'),
  OpenSauceOneExtraBold: require('@/assets/fonts/OpenSauceOne-ExtraBold.ttf'),
  Roboto: require('@/assets/fonts/Roboto-Regular.ttf'),
  RobotoExtraBold: require('@/assets/fonts/Roboto-ExtraBold.ttf'),
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);
  const pathname = usePathname();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasAccount(Boolean(data.session?.user));
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasAccount(Boolean(session?.user));
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || hasAccount || pathname === '/no-account' || pathname === '/login' || pathname === '/register' || pathname === '/google-profile' || pathname === '/auth/callback') return;
    const privateRoots = [
      '/funds', '/messages', '/commissions', '/marked-bounties', '/post-bounty',
      '/manage-bids', '/disputes', '/liked-posts', '/joined-communities',
      '/profile/edit', '/profile/invite', '/profile/portfolio/add',
      '/posts/create', '/posts/edit',
    ];
    const privatePath = pathname === '/profile' || privateRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
    if (privatePath) {
      router.replace({ pathname: '/no-account', params: { required: '1', action: 'access this feature' } } as any);
    }
  }, [authReady, hasAccount, pathname, router]);

  if (!fontsLoaded) return null;

  if (Platform.OS !== 'web') return <Slot />;

  return (
    <View style={styles.webViewport}>
      <View style={styles.phoneCanvas}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webViewport: {
    flex: 1,
    height: '100dvh' as any,
    minHeight: '100dvh' as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#353535',
  },
  phoneCanvas: {
    flex: 1,
    width: '100%',
    maxWidth: 360,
    height: '100dvh' as any,
    maxHeight: 860,
    overflow: 'hidden',
    backgroundColor: '#131313',
  },
});
