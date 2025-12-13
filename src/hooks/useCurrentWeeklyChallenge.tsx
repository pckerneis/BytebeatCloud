import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';

type WeeklyChallengeInfo = {
  weekNumber: number | null;
  theme: string;
  tag: string | null;
  endsAt: Date | null;
  isLoading: boolean;
};

const WeeklyChallengeContext = createContext<WeeklyChallengeInfo>({
  weekNumber: null,
  theme: '',
  tag: null,
  endsAt: null,
  isLoading: true,
});

export function WeeklyChallengeProvider({ children }: { children: ReactNode }) {
  const [weekNumber, setWeekNumber] = useState<number | null>(null);
  const [theme, setTheme] = useState<string>('');
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentWeek = async () => {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_current_weekly_challenge');
      if (cancelled) return;

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data;
        const week = (row as any)?.week_number as number | null | undefined;
        const nextTheme = (row as any)?.theme as string | null | undefined;

        if (week && nextTheme) {
          setWeekNumber(week);
          setTheme(nextTheme);
          const endsAtStr = (row as any)?.ends_at as string | null | undefined;
          setEndsAt(endsAtStr ? new Date(endsAtStr) : null);
        } else {
          setWeekNumber(null);
          setTheme('');
          setEndsAt(null);
        }
      } else {
        setWeekNumber(null);
        setTheme('');
        setEndsAt(null);
      }

      setIsLoading(false);
    };

    void loadCurrentWeek();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<WeeklyChallengeInfo>(() => {
    const tag = weekNumber ? `week${weekNumber}` : null;
    return { weekNumber, theme, tag, endsAt, isLoading };
  }, [weekNumber, theme, endsAt, isLoading]);

  return (
    <WeeklyChallengeContext.Provider value={value}>{children}</WeeklyChallengeContext.Provider>
  );
}

export function useCurrentWeeklyChallenge() {
  return useContext(WeeklyChallengeContext);
}
