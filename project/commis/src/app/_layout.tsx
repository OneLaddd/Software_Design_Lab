import { Slot } from 'expo-router';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
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

  return <Slot />;
}
