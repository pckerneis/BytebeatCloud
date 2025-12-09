import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from './useSupabaseAuth';

export type ProfileStatus = 'idle' | 'loading' | 'error' | 'no-user';

export function useCurrentUserProfile() {
  const { user, loading } = useSupabaseAuth();

  const [status, setStatus] = useState<ProfileStatus>('idle');
  const [error, setError] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [socialLinks, setSocialLinks] = useState<string[]>([]);

  useEffect(() => {
    // Wait for auth to finish loading before deciding where to redirect.
    if (loading) {
      return;
    }

    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('no-user');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError('');

    const go = async () => {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('username, bio, social_links')
        .eq('id', (user as any).id)
        .maybeSingle();

      if (cancelled) return;

      if (profileError || !data?.username) {
        setStatus('error');
        setError('Unable to load your profile.');
        return;
      }

      setUsername(data.username);
      setBio(data.bio ?? null);
      setSocialLinks((data.social_links as string[]) ?? []);
      setStatus('idle');
    };

    void go();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  return { user, loading, status, error, username, bio, socialLinks };
}
