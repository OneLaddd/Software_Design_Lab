import { Slot } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
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

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase.from('profiles').select('*');
      console.log('Supabase test:', data, error);
    }
    testConnection();
  }, []);

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
    minHeight: '100vh' as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#353535',
  },
  phoneCanvas: {
    flex: 1,
    width: '100%',
    maxWidth: 360,
    height: '100vh' as any,
    maxHeight: 860,
    overflow: 'hidden',
    backgroundColor: '#131313',
  },
});
