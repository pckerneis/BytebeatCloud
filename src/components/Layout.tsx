import Link from 'next/link';
import { useRouter } from 'next/router';
import type { PropsWithChildren } from 'react';
import { useContext, useEffect, useRef, useState } from 'react';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { warmUpBytebeatEngine, useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { supabase } from '../lib/supabaseClient';
import { favoritePost, unfavoritePost } from '../services/favoritesClient';
import { ModeOption } from '../model/expression';
import { PostRow } from './PostList';
import { DEFAULT_THEME_ID, UI_THEMES, type ThemeId, getUiTheme } from '../theme/themes';
import { ThemeContext } from '../theme/ThemeContext';

const CURRENT_TOS_VERSION = '2025-11-30-v1';

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
  const [checkedProfile, setCheckedProfile] = useState(false);
  const [theme, setTheme] = useState<ThemeId | null>(null);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await router.push('/');
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem('ui-theme') as ThemeId | null;
    if (stored && UI_THEMES.some((t) => t.id === stored)) {
      setTheme(stored);
    } else {
      setTheme(DEFAULT_THEME_ID);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!theme) return;

    const root = document.body;

    UI_THEMES.forEach((t) => {
      root.classList.remove(`theme-${t.id}`);
    });

    root.classList.add(`theme-${theme}`);
    window.localStorage.setItem('ui-theme', theme);
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

  useEffect(() => {
    const devFakeAuth = process.env.NEXT_PUBLIC_DEV_FAKE_AUTH === '1';

    if (!user || devFakeAuth || checkedProfile) return;

    let cancelled = false;

    const checkProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, tos_version')
        .eq('id', (user as any).id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.warn('Error checking profile', error.message);
        setCheckedProfile(true);
        return;
      }

      const hasUsername = !!data?.username;
      const hasCurrentTos = data?.tos_version === CURRENT_TOS_VERSION;

      if (!hasUsername) {
        if (
          router.pathname !== '/onboarding' &&
          router.pathname !== '/tos-update' &&
          router.pathname !== '/terms'
        ) {
          void router.push('/onboarding');
        }
      } else if (!hasCurrentTos) {
        if (router.pathname !== '/tos-update' && router.pathname !== '/terms') {
          void router.push('/tos-update');
        }
      } else {
        setCheckedProfile(true);
      }
    };

    void checkProfile();

    return () => {
      cancelled = true;
    };
  }, [user, checkedProfile, router.pathname, router]);

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
              <NavLink href="/create">Create</NavLink>
              <NavLink href="/explore">Explore</NavLink>
              {user && <NavLink href="/profile">Profile</NavLink>}
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

function FooterPlayer() {
  const { user } = useSupabaseAuth();
  const router = useRouter();
  const { isPlaying, toggle, stop, waveform } = useBytebeatPlayer();
  const { currentPost, next, prev, updateFavoriteStateForPost } = usePlayerStore();
  const theme = useContext(ThemeContext);
  const [footerFavoritePending, setFooterFavoritePending] = useState(false);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const visualizerAnimationRef = useRef<number | null>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);

  useEffect(() => {
    const container = titleRef.current;
    if (!container) {
      setIsTitleOverflowing(false);
      return;
    }

    const textEl = container.querySelector<HTMLElement>('.played-post-name-text');
    if (!textEl) {
      setIsTitleOverflowing(false);
      return;
    }

    const update = () => {
      const overflow = textEl.scrollWidth - container.clientWidth;
      if (overflow > 1) {
        setIsTitleOverflowing(true);
        const distance = -overflow;
        textEl.style.setProperty('--marquee-offset', `${distance}px`);

        const pixelsPerSecond = 20;
        const durationSeconds = Math.max(8, Math.abs(distance) / pixelsPerSecond);
        textEl.style.setProperty('--marquee-duration', `${durationSeconds}s`);
      } else {
        setIsTitleOverflowing(false);
        textEl.style.removeProperty('--marquee-offset');
        textEl.style.removeProperty('--marquee-duration');
      }
    };

    update();

    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
  }, [currentPost?.title]);

  useEffect(() => {
    const canvas = visualizerRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const drawFrame = () => {
      // Read the current theme accent/background color from CSS variables on each frame,
      // so that theme changes are reflected immediately.
      let accentColor: string = '#000';
      let backgroundColor: string = '#fff';
      if (typeof window !== 'undefined') {
        const style = window.getComputedStyle(canvas);
        const fromVar = style.getPropertyValue('--accent-color');
        if (fromVar && fromVar.trim()) {
          accentColor = fromVar.trim();
        }

        const fromVar2 = style.getPropertyValue('--card-bg-color');
        if (fromVar2 && fromVar2.trim()) {
          backgroundColor = fromVar2.trim();
        }
      }

      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      if (isPlaying && waveform && waveform.length > 0) {
        const len = waveform.length;
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let x = 0; x < width; x += 1) {
          const idx = Math.min(len - 1, Math.floor((x / width) * len));
          const sample = waveform[idx]; // [-1, 1]
          const y = height * 0.5 - sample * (height * 0.45);

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      }
    };

    const loop = () => {
      drawFrame();
      if (isPlaying) {
        visualizerAnimationRef.current = window.requestAnimationFrame(loop);
      }
    };

    if (visualizerAnimationRef.current != null) {
      window.cancelAnimationFrame(visualizerAnimationRef.current);
    }

    // Defer the first draw to the next animation frame so that the Layout
    // theme effect has applied the new body class before we read CSS variables.
    visualizerAnimationRef.current = window.requestAnimationFrame(() => {
      // Always draw at least once so that theme changes are reflected even when not playing.
      drawFrame();

      if (isPlaying) {
        visualizerAnimationRef.current = window.requestAnimationFrame(loop);
      }
    });

    return () => {
      if (visualizerAnimationRef.current != null) {
        window.cancelAnimationFrame(visualizerAnimationRef.current);
        visualizerAnimationRef.current = null;
      }
    };
  }, [isPlaying, currentPost?.id, waveform, theme]);

  const playPost = async (post: PostRow | null) => {
    if (!post) return;

    await stop();

    const sr = post.sample_rate === '8k' ? 8000 : post.sample_rate === '16k' ? 16000 : 44100;
    const mode: ModeOption = post.mode === 'float' ? ModeOption.Float : ModeOption.Int;

    await toggle(post.expression, mode, sr);
  };

  const handleFooterPlayPause = async () => {
    if (!currentPost) return;

    if (isPlaying) {
      await stop();
    } else {
      await playPost(currentPost);
    }
  };

  const handleFooterPrev = async () => {
    await playPost(prev());
  };

  const handleFooterNext = async () => {
    await playPost(next());
  };

  const handleFooterFavoriteClick = async () => {
    if (!currentPost) return;

    if (!user) {
      await router.push('/login');
      return;
    }

    if (footerFavoritePending) {
      return;
    }

    const userId = (user as any).id as string;

    const baseCount = currentPost.favorites_count ?? 0;
    const isFavorited = !!currentPost.favorited_by_current_user;

    setFooterFavoritePending(true);

    try {
      if (!isFavorited) {
        const { error } = await favoritePost(userId, currentPost.id);

        if (error) {
          // eslint-disable-next-line no-console
          console.warn('Error favoriting post', error.message);
          return;
        }

        updateFavoriteStateForPost(currentPost.id, true, baseCount + 1);
        return;
      }

      const { error: deleteError } = await unfavoritePost(userId, currentPost.id);

      if (deleteError) {
        // eslint-disable-next-line no-console
        console.warn('Error removing favorite', deleteError.message);
        return;
      }

      updateFavoriteStateForPost(currentPost.id, false, Math.max(0, baseCount - 1));
    } finally {
      setFooterFavoritePending(false);
    }
  };

  const isFooterFavorited = currentPost ? !!currentPost.favorited_by_current_user : false;

  const handlePlayedPostInfoClick = () => {
    if (!currentPost) return;
    void router.push(`/post/${currentPost.id}`);
  };

  return (
    <div className="footer">
      <div className="transport-buttons">
        <button
          type="button"
          className="transport-button"
          onClick={handleFooterPrev}
          disabled={!currentPost}
        >
          «
        </button>
        <button
          type="button"
          className={`transport-button play ${isPlaying ? 'playing' : 'pause'}`}
          onClick={handleFooterPlayPause}
          disabled={!currentPost}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="transport-button"
          onClick={handleFooterNext}
          disabled={!currentPost}
        >
          »
        </button>
      </div>
      <div className="visualizer">
        <canvas ref={visualizerRef} width={150} height={26}></canvas>
      </div>
      <div className="played-post-info" onClick={handlePlayedPostInfoClick}>
        <div className="played-post-author">
          {currentPost
            ? currentPost.author_username
              ? `@${currentPost.author_username}`
              : '@unknown'
            : '-'}
        </div>
        <div className="played-post-name" ref={titleRef}>
          <span className={`played-post-name-text${isTitleOverflowing ? ' is-overflowing' : ''}`}>
            {currentPost ? currentPost.title || '(untitled)' : '-'}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={`favorite-button${isFooterFavorited ? ' favorited' : ''}${
          footerFavoritePending ? ' pending' : ''
        }`}
        onClick={handleFooterFavoriteClick}
        disabled={!currentPost || footerFavoritePending}
      >
        &lt;3
      </button>
    </div>
  );
}
