import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { supabase } from '../lib/supabaseClient';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'no-user'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;

    // Wait for auth to finish loading before deciding where to redirect.
    if (loading) {
      return;
    }

    if (!user) {
      setStatus('no-user');
      void router.replace('/login');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError('');

    const go = async () => {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', (user as any).id)
        .maybeSingle();

      if (cancelled) return;

      if (profileError || !data?.username) {
        setStatus('error');
        setError('Unable to load your profile.');
        return;
      }

      setStatus('loading');
      void router.replace(`/u/${data.username}`);
    };

    void go();

    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  return (
    <section>
      {status === 'loading' && <p className="text-centered">Loading your profile…</p>}
      {status === 'error' && <p className="error-message">{error}</p>}
    </section>
  );
}
