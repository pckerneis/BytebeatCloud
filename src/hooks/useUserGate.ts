import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { CURRENT_TOS_VERSION } from '../constants';

export interface UserGateResult {
  checked: boolean;
  needsOnboarding: boolean;
  needsTosUpdate: boolean;
}

export function useUserGate(userId?: string): UserGateResult {
  const [state, setState] = useState<UserGateResult>({
    checked: !userId,
    needsOnboarding: false,
    needsTosUpdate: false,
  });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = () => setRefreshTick((t) => t + 1);
    window.addEventListener('user:profile-updated', handler);

    return () => {
      window.removeEventListener('user:profile-updated', handler);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ checked: true, needsOnboarding: false, needsTosUpdate: false });
      return;
    }

    let cancelled = false;

    const run = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, tos_version')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setState({ checked: true, needsOnboarding: false, needsTosUpdate: false });
        return;
      }

      const hasUsername = !!data?.username;
      const needsOnboarding = !hasUsername;
      const needsTosUpdate =
        !!data?.username && !!CURRENT_TOS_VERSION && data.tos_version !== CURRENT_TOS_VERSION;

      setState({ checked: true, needsOnboarding, needsTosUpdate });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [userId, refreshTick]);

  return state;
}
