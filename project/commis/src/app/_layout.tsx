import { Slot } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function RootLayout() {

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase.from('profiles').select('*');
      console.log('Supabase test:', data, error);
    }
    testConnection();
  }, []);
  return <Slot />;
}
