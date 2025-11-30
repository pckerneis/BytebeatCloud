import Link from 'next/link';
import { useRouter } from 'next/router';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { warmUpBytebeatEngine, useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { supabase } from '../lib/supabaseClient';
import { APP_NAME } from '../constants';
import { ModeOption } from '../model/expression';

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
  const { isPlaying, toggle, stop, level, waveform } = useBytebeatPlayer();
  const { currentPost, next, prev, updateFavoriteStateForPost } = usePlayerStore();
  const titleRef = useRef<HTMLDivElement | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const visualizerAnimationRef = useRef<number | null>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);

  useEffect(() => {
    const devFakeAuth = process.env.NEXT_PUBLIC_DEV_FAKE_AUTH === '1';

    if (!user || devFakeAuth || checkedProfile) return;

    let cancelled = false;

    const checkProfile = async () => {
      if (!supabase) return;

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

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    await router.push('/');
  };

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

    const render = () => {
      ctx.fillStyle = '#eee';
      ctx.fillRect(0, 0, width, height);

      if (isPlaying && waveform && waveform.length > 0) {
        const len = waveform.length;
        ctx.strokeStyle = '#000';
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

      visualizerAnimationRef.current = window.requestAnimationFrame(render);
    };

    if (visualizerAnimationRef.current != null) {
      window.cancelAnimationFrame(visualizerAnimationRef.current);
    }
    visualizerAnimationRef.current = window.requestAnimationFrame(render);

    return () => {
      if (visualizerAnimationRef.current != null) {
        window.cancelAnimationFrame(visualizerAnimationRef.current);
        visualizerAnimationRef.current = null;
      }
    };
  }, [isPlaying, currentPost?.id, waveform]);

  const handleFooterPlayPause = async () => {
    if (!currentPost) return;

    if (isPlaying) {
      await stop();
      return;
    }

    const sr =
      currentPost.sample_rate === '8k' ? 8000 : currentPost.sample_rate === '16k' ? 16000 : 44100;

    const mode: ModeOption = currentPost.mode === 'float' ? ModeOption.Float : ModeOption.Int;

    await toggle(currentPost.expression, mode, sr, true);
  };

  const handleFooterPrev = async () => {
    const post = prev();
    if (!post) return;

    await stop();

    const sr = post.sample_rate === '8k' ? 8000 : post.sample_rate === '16k' ? 16000 : 44100;
    const mode: ModeOption = post.mode === 'float' ? ModeOption.Float : ModeOption.Int;

    await toggle(post.expression, mode, sr, true);
  };

  const handleFooterNext = async () => {
    const post = next();
    if (!post) return;

    await stop();

    const sr = post.sample_rate === '8k' ? 8000 : post.sample_rate === '16k' ? 16000 : 44100;
    const mode: ModeOption = post.mode === 'float' ? ModeOption.Float : ModeOption.Int;

    await toggle(post.expression, mode, sr, true);
  };

  const handleFooterFavoriteClick = async () => {
    if (!supabase) return;
    if (!currentPost) return;

    if (!user) {
      await router.push('/login');
      return;
    }

    const userId = (user as any).id as string;

    const baseCount = currentPost.favorites_count ?? 0;
    const isFavorited = !!currentPost.favorited_by_current_user;

    if (!isFavorited) {
      const { error } = await supabase
        .from('favorites')
        .insert({ profile_id: userId, post_id: currentPost.id });

      if (error) {
        const code = (error as any).code as string | undefined;
        if (code !== '23505') {
          // eslint-disable-next-line no-console
          console.warn('Error favoriting post', error.message);
          return;
        }
      }

      updateFavoriteStateForPost(currentPost.id, true, baseCount + 1);
      return;
    }

    const { error: deleteError } = await supabase
      .from('favorites')
      .delete()
      .eq('profile_id', userId)
      .eq('post_id', currentPost.id);

    if (deleteError) {
      // eslint-disable-next-line no-console
      console.warn('Error removing favorite', deleteError.message);
      return;
    }

    updateFavoriteStateForPost(currentPost.id, false, Math.max(0, baseCount - 1));
  };

  const isFooterFavorited = currentPost ? !!currentPost.favorited_by_current_user : false;

  const handlePlayedPostInfoClick = () => {
    if (!currentPost) return;
    void router.push(`/post/${currentPost.id}`);
  };

  return (
    <div className="root">
      <div className="top-content">
        <nav>
          <div className="app-title">
            <Link href="/">
              <h1>{APP_NAME}</h1>
            </Link>
          </div>
          <ul>
            <NavLink href="/create">Create</NavLink>
            <NavLink href="/explore">Explore</NavLink>
            {user && <NavLink href="/profile">Profile</NavLink>}
            {user ? (
              <li>
                <button type="button" className="nav" onClick={handleSignOut}>
                  Sign out
                </button>
              </li>
            ) : (
              <NavLink href="/login">Login</NavLink>
            )}
          </ul>
        </nav>
        <main>{children}</main>
      </div>
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
        <div className="vizualizer">
          <canvas ref={visualizerRef} width={150} height={26}></canvas>
        </div>
        <div className="played-post-info" onClick={handlePlayedPostInfoClick}>
          <div className="played-post-author">
            {currentPost
              ? currentPost.profiles?.username
                ? `@${currentPost.profiles.username}`
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
          className={`favorite-button${isFooterFavorited ? ' favorited' : ''}`}
          onClick={handleFooterFavoriteClick}
          disabled={!currentPost}
        >
          &lt;3
        </button>
      </div>
    </div>
  );
}
