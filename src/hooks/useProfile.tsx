import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useProfile(username: string | null) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      setLoading(true);
      setError('');

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        setError('Unable to load profile.');
        setProfileId(null);
      } else if (!data) {
        // User not found (no error, but no data)
        setProfileId(null);
      } else {
        setProfileId(data.id);
      }

      setLoading(false);
    };

    void fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [username]);

  return { username, profileId, loading, error };
}