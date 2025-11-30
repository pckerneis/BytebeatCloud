import { useEffect, useState } from 'react';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

const devFakeAuth = process.env.NEXT_PUBLIC_DEV_FAKE_AUTH === '1';
const devFakeEmail = process.env.NEXT_PUBLIC_DEV_FAKE_USER_EMAIL;

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!devFakeAuth);

  useEffect(() => {
    let isMounted = true;

    if (devFakeAuth) {
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        setSession(data.session ?? null);
        setLoading(false);
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, newSession: Session | null) => {
        if (isMounted) {
          setSession(newSession);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    };

    const cleanupPromise = init();

    return () => {
      isMounted = false;
      void cleanupPromise;
    };
  }, []);

  const fakeUser =
    devFakeAuth && devFakeEmail ? ({ email: devFakeEmail } as unknown as Session['user']) : null;

  const user = fakeUser ?? session?.user ?? null;

  return { session, user, loading };
}
