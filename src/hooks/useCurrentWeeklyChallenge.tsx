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
    let refreshTimer: NodeJS.Timeout | null = null;

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
          const endsAtDate = endsAtStr ? new Date(endsAtStr) : null;
          setEndsAt(endsAtDate);

          // Schedule a refresh for next Saturday at 20:10 UTC
          // Weekly challenges start at 20:00 UTC, we refresh at 20:10 to ensure DB is updated
          const now = new Date();
          const nextSaturday = new Date(now);

          // Find next Saturday
          const daysUntilSaturday = (6 - now.getUTCDay() + 7) % 7;
          if (daysUntilSaturday === 0) {
            // Today is Saturday - check if we're past 20:10 UTC
            const todayAt2010 = new Date(now);
            todayAt2010.setUTCHours(20, 10, 0, 0);
            if (now >= todayAt2010) {
              // Already past 20:10, schedule for next Saturday
              nextSaturday.setUTCDate(now.getUTCDate() + 7);
            }
          } else {
            nextSaturday.setUTCDate(now.getUTCDate() + daysUntilSaturday);
          }

          nextSaturday.setUTCHours(20, 10, 0, 0);
          const timeUntilRefresh = nextSaturday.getTime() - now.getTime();

          if (timeUntilRefresh > 0) {
            refreshTimer = setTimeout(() => {
              if (!cancelled) {
                void loadCurrentWeek();
              }
            }, timeUntilRefresh);
          }
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

    // Also refresh every hour to catch any stale data
    const hourlyRefresh = setInterval(
      () => {
        if (!cancelled) {
          void loadCurrentWeek();
        }
      },
      60 * 60 * 1000,
    ); // 1 hour

    return () => {
      cancelled = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      clearInterval(hourlyRefresh);
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
