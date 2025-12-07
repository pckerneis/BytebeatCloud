import Link from 'next/link';
import { useRouter } from 'next/router';
import { PropsWithChildren, useEffect, useState } from 'react';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { warmUpBytebeatEngine } from '../hooks/useBytebeatPlayer';
import { supabase } from '../lib/supabaseClient';
import { DEFAULT_THEME_ID, getUiTheme, type ThemeId, UI_THEMES } from '../theme/themes';
import { ThemeContext } from '../theme/ThemeContext';
import { useUserGate } from '../hooks/useUserGate';
import FooterPlayer from './FooterPlayer';

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

export function Layout({ children }: PropsWithChildren) {
  const { user } = useSupabaseAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeId | null>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME_ID;

    const stored = window.localStorage.getItem('ui-theme') as ThemeId | null;

    if (stored && UI_THEMES.some((t) => t.id === stored)) {
      return stored;
    } else {
      return DEFAULT_THEME_ID;
    }
  });

  const [notificationsCount, setNotificationsCount] = useState<number | null>(null);
  const userId = (user as any)?.id as string | undefined;
  const gate = useUserGate(userId);
  const needsOnboarding = !!userId && gate.checked && gate.needsOnboarding;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await router.push('/');
  };

  const loadCount = async () => {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false);

    if (error) {
      setNotificationsCount(null);
    } else {
      setNotificationsCount(typeof count === 'number' ? count : null);
    }
  };

  const handleRefresh = () => {
    void loadCount();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('notifications:refresh', handleRefresh);
  }

  void loadCount();

  useEffect(() => {
    const interval = setInterval(() => {
      void loadCount();
    }, 30000);

    return () => {
      if (typeof window !== 'undefined') {
        window.clearInterval(interval);
        window.removeEventListener('notifications:refresh', handleRefresh);
      }
    };
  });

  useEffect(() => {
    if (theme) {
      const root = document.body;

      UI_THEMES.forEach((t) => {
        root.classList.remove(`theme-${t.id}`);
      });

      root.classList.add(`theme-${theme}`);
      window.localStorage.setItem('ui-theme', theme);
    }
  }, [theme]);

  const handleCycleTheme = () => {
    if (!theme) {
      setTheme(DEFAULT_THEME_ID);
      return;
    }

    const idx = UI_THEMES.findIndex((t) => t.id === theme);
    const next = UI_THEMES[(idx + 1 + UI_THEMES.length) % UI_THEMES.length];
    setTheme(next.id);
  };

  if (userId && gate.checked) {
    if (gate.needsOnboarding) {
      if (
        router.pathname !== '/onboarding' &&
        router.pathname !== '/tos-update' &&
        router.pathname !== '/terms'
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

  // Warm up the audio engine on the very first user interaction anywhere
  // in the app, so the initial AudioContext/worklet cost is paid upfront.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let warmedUp = false;

    const handleFirstInteraction = () => {
      if (warmedUp) return;
      warmedUp = true;
      void warmUpBytebeatEngine();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { once: false });
    window.addEventListener('keydown', handleFirstInteraction, { once: false });

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

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
              <button type="button" className="theme-toggle-button" onClick={handleCycleTheme}>
                {getUiTheme(theme ?? DEFAULT_THEME_ID).label}
              </button>
            </div>
          </nav>
          <main>{children}</main>
        </div>
        <FooterPlayer />
      </div>
    </ThemeContext.Provider>
  );
}
