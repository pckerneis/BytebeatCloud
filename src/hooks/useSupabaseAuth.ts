import { useEffect, useState } from 'react';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

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

  const user = session?.user ?? null;

  return { session, user, loading };
}
