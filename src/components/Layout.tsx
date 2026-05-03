import Link from 'next/link';
import { useRouter } from 'next/router';
import { PropsWithChildren, useEffect, useState } from 'react';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { warmUpBytebeatEngine } from '../hooks/useBytebeatPlayer';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_THEME_ID, getUiTheme, UI_THEMES } from '../theme/themes';
import { ThemeContext } from '../theme/ThemeContext';
import { useUserGate } from '../hooks/useUserGate';
import FooterPlayer from './FooterPlayer';
import { useTheme } from '../hooks/useTheme';
import { useCustomThemes } from '../hooks/useCustomThemes';
import useAudioWarmup from '../hooks/useAudioWarmup';

function NavLink({ href, children }: PropsWithChildren<{ href: string }>) {
  const router = useRouter();
  const isActive = router.pathname === href;

  return (
    <li>
      <Link href={href} className={isActive ? 'nav active' : 'nav'}>
        {children}
      </Link>
    </li>
  );
}

export function Layout({ children }: Readonly<PropsWithChildren>) {
  const { user } = useSupabaseAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { customThemes } = useCustomThemes(theme);
  useAudioWarmup();

  const [notificationsCount, setNotificationsCount] = useState<number | null>(null);
  const userId = (user as any)?.id as string | undefined;
  const gate = useUserGate(userId);
  const needsOnboarding = !!userId && gate.checked && gate.needsOnboarding;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await router.push('/');
  };

  // Load initial count and subscribe to real-time updates
  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotificationsCount(null);
      return;
    }

    const loadCount = async () => {
      if (!userId) {
        setNotificationsCount(null);
        return;
      }

      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (error) {
        setNotificationsCount(null);
      } else {
        setNotificationsCount(typeof count === 'number' ? count : null);
      }
    };

    // Load initial count
    void loadCount();

    // Subscribe to real-time notifications
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadCount();
        },
      )
      .subscribe();

    // Listen for manual refresh events (e.g., when marking as read)
    const handleRefresh = () => {
      void loadCount();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('notifications:refresh', handleRefresh);
    }

    return () => {
      void supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('notifications:refresh', handleRefresh);
      }
    };
  }, [userId]);

  const allThemes = [
    ...UI_THEMES.map((t) => ({ id: t.id, label: t.label })),
    ...customThemes.map((t) => ({ id: t.id, label: t.label })),
  ];

  const currentThemeLabel = (() => {
    const builtin = UI_THEMES.find((t) => t.id === theme);
    if (builtin) return builtin.label;
    const custom = customThemes.find((t) => t.id === theme);
    if (custom) return custom.label;
    return getUiTheme(theme).label;
  })();

  const handleCycleTheme = () => {
    const idx = allThemes.findIndex((t) => t.id === theme);
    const next = allThemes[(idx + 1) % allThemes.length];
    setTheme(next?.id ?? DEFAULT_THEME_ID);
  };

  if (userId && gate.checked) {
    if (gate.needsOnboarding) {
      if (
        router.pathname !== '/onboarding' &&
        router.pathname !== '/tos-update' &&
        router.pathname !== '/terms' &&
        router.pathname !== '/'
      ) {
        void router.replace('/onboarding');
      }
    }

    if (gate.needsTosUpdate) {
      if (router.pathname !== '/tos-update' && router.pathname !== '/terms') {
        void router.replace('/tos-update');
      }
    }
  }

  const formatNotificationsCount = (count: number) => {
    if (count > 99) {
      return '99+';
    }

    return count.toString();
  };

  return (
    <ThemeContext.Provider value={theme ?? DEFAULT_THEME_ID}>
      <div className="root">
        <div className="top-content">
          <nav>
            <div className="app-title">
              <Link href="/">
                <h1>
                  <span className="app-title-text">BytebeatCloud</span>
                  <span className="app-title-icon" aria-hidden="true" />
                </h1>
              </Link>
            </div>
            <ul>
              <li>
                <Link
                  href={needsOnboarding ? '/onboarding' : '/create'}
                  className={router.pathname === '/create' ? 'nav active' : 'nav'}
                >
                  Create
                </Link>
              </li>
              <NavLink href={needsOnboarding ? '/onboarding' : '/explore'}>Explore</NavLink>
              {user && (
                <NavLink href={needsOnboarding ? '/onboarding' : '/profile'}>Profile</NavLink>
              )}
              {user && (
                <NavLink href={needsOnboarding ? '/onboarding' : '/notifications'}>
                  <span className={'notifications-nav-label'}>Notifications</span>
                  {notificationsCount && notificationsCount > 0 ? (
                    <span className={'notifications-count'}>
                      {formatNotificationsCount(notificationsCount)}
                    </span>
                  ) : (
                    <span></span>
                  )}
                </NavLink>
              )}
              {user && (
                <li className="nav-signout">
                  <button type="button" className="nav" onClick={handleSignOut}>
                    Sign out
                  </button>
                </li>
              )}
              {!user && <NavLink href="/login">Login</NavLink>}
            </ul>
            <div className="theme-switcher">
              <button
                type="button"
                className="theme-toggle-button"
                onClick={handleCycleTheme}
                suppressHydrationWarning
              >
                {currentThemeLabel}
              </button>
              <Link href="/theme-editor" className="theme-editor-link" suppressHydrationWarning>
                customize
              </Link>
            </div>
          </nav>
          <main>{children}</main>
        </div>
        <FooterPlayer />
      </div>
    </ThemeContext.Provider>
  );
}
