import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { useContext, useEffect, useRef, useState } from 'react';
import { ThemeContext } from '../theme/ThemeContext';
import { getPreviewSource, subscribePreviewSource } from '../hooks/previewSource';
import { PostRow } from './PostList';
import { formatPostTitle } from '../utils/post-format';
import { favoritePost, unfavoritePost } from '../services/favoritesClient';

export default function FooterPlayer() {
  const { user } = useSupabaseAuth();
  const router = useRouter();
  const { isPlaying, toggle, stop, waveform, masterGain, setMasterGain } = useBytebeatPlayer();
  const {
    currentPost,
    next,
    prev,
    updateFavoriteStateForPost,
    startPlayTracking,
    stopPlayTracking,
  } = usePlayerStore();
  const theme = useContext(ThemeContext);
  const [footerFavoritePending, setFooterFavoritePending] = useState(false);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const visualizerAnimationRef = useRef<number | null>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const [preview, setPreview] = useState(getPreviewSource());

  useEffect(() => {
    const unsubscribe = subscribePreviewSource(setPreview);
    return () => {
      // Ensure cleanup returns void, ignore boolean return value
      unsubscribe();
    };
  }, []);

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

    stopPlayTracking();
    await stop();

    const sr = post.sample_rate;
    await toggle(post.expression, post.mode, sr);
    startPlayTracking(post.id);
  };

  const handleFooterPlayPause = async () => {
    if (isPlaying) {
      stopPlayTracking();
      await stop();
      return;
    }

    if (currentPost) {
      await playPost(currentPost);
      return;
    }

    if (preview) {
      await toggle(preview.expression, preview.mode, preview.sampleRate);
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
          console.warn('Error favoriting post', error.message);
          return;
        }

        updateFavoriteStateForPost(currentPost.id, true, baseCount + 1);
        return;
      }

      const { error: deleteError } = await unfavoritePost(userId, currentPost.id);

      if (deleteError) {
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
          disabled={!currentPost && !preview && !isPlaying}
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

      <div className="footer-volume">
        <button type="button" className="volume-button" aria-label="Master volume">
          {masterGain > 0 ? (
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ height: '100%' }}>
              <rect x="1" y="18" width="22" height="29" rx="2" fill="currentColor" />
              <path
                d="M14 23.9613C14 23.3537 14.2762 22.7791 14.7506 22.3995L35.7506 5.59951C37.0601 4.55189 39 5.48424 39 7.16125V57.8387C39 59.5158 37.0601 60.4481 35.7506 59.4005L14.7506 42.6005C14.2762 42.2209 14 41.6463 14 41.0387V23.9613Z"
                fill="currentColor"
              />
              <line
                x1="48"
                y1="20"
                x2="48"
                y2="44"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
              />
              {masterGain > 0.7 && (
                <line
                  x1="59"
                  y1="11"
                  x2="59"
                  y2="53"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              )}
            </svg>
          ) : (
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ height: '100%' }}>
              <rect x="1" y="18" width="22" height="29" rx="2" fill="currentColor" />
              <path
                d="M14 23.9613C14 23.3537 14.2762 22.7791 14.7506 22.3995L35.7506 5.59951C37.0601 4.55189 39 5.48424 39 7.16125V57.8387C39 59.5158 37.0601 60.4481 35.7506 59.4005L14.7506 42.6005C14.2762 42.2209 14 41.6463 14 41.0387V23.9613Z"
                fill="currentColor"
              />
              <line
                x1="60"
                y1="26.2426"
                x2="46.2426"
                y2="40"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <line
                x1="3"
                y1="-3"
                x2="22.4558"
                y2="-3"
                transform="matrix(-0.707107 -0.707107 -0.707107 0.707107 60 44)"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
        <div className="volume-slider-backdrop">
          <div className="volume-slider-container">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterGain}
              onChange={(e) => setMasterGain(Number(e.target.value))}
              className="volume-slider"
            />
          </div>
        </div>
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
            {currentPost ? formatPostTitle(currentPost.title) : '-'}
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
        <svg
          className="heart-icon"
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M31.9823 58.7827L5.69823 32.4986C3.60164 30.402 2.20391 27.9645 1.50505 25.1861C0.823232 22.4077 0.831755 19.6463 1.53062 16.902C2.22948 14.1406 3.61869 11.7372 5.69823 9.69176C7.82891 7.59517 10.2579 6.20596 12.9852 5.52415C15.7295 4.82528 18.4653 4.82528 21.1926 5.52415C23.9369 6.22301 26.3744 7.61222 28.5051 9.69176L31.9823 13.0668L35.4596 9.69176C37.6073 7.61222 40.0448 6.22301 42.7721 5.52415C45.4994 4.82528 48.2266 4.82528 50.9539 5.52415C53.6982 6.20596 56.1357 7.59517 58.2664 9.69176C60.346 11.7372 61.7352 14.1406 62.434 16.902C63.1329 19.6463 63.1329 22.4077 62.434 25.1861C61.7522 27.9645 60.363 30.402 58.2664 32.4986L31.9823 58.7827Z" />
        </svg>
      </button>
    </div>
  );
}
