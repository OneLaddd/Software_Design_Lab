import { supabase } from '@/lib/supabase';

type RouterLike = {
  push: (href: any) => void;
};

/** Returns false and opens the account prompt when the current visitor is a guest. */
export async function requireAccount(router: RouterLike, action: string): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session?.user) return true;

  router.push({
    pathname: '/no-account',
    params: { required: '1', action },
  });
  return false;
}
