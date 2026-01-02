import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { useRouter } from 'next/router';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ThemeContext } from '../theme/ThemeContext';
import { getPreviewSource, subscribePreviewSource } from '../hooks/previewSource';
import { PostRow } from './PostList';
import { formatPostTitle } from '../utils/post-format';
import { favoritePost, unfavoritePost } from '../services/favoritesClient';
import { AUTOPLAY_DEFAULT_DURATION } from '../constants';

export default function FooterPlayer() {
  const { user } = useSupabaseAuth();
  const router = useRouter();
  const { isPlaying, toggle, stop, waveform, masterGain, setMasterGain, fadeGain, setFadeGain } =
    useBytebeatPlayer();
  const {
    currentPost,
    playlist,
    currentIndex,
    next,
    prev,
    updateFavoriteStateForPost,
    removeFromPlaylist,
    reorderPlaylist,
    setCurrentPostById,
    startPlayTracking,
    stopPlayTracking,
    // Auto-skip controls
    autoSkipEnabled,
    setAutoSkip,
    shufflePlaylist,
  } = usePlayerStore();
  const theme = useContext(ThemeContext);
  const [footerFavoritePending, setFooterFavoritePending] = useState(false);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const visualizerAnimationRef = useRef<number | null>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const [preview, setPreview] = useState(getPreviewSource());
  const autoTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const fadeStartGainRef = useRef<number>(1);
  const switchTimerRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const progressAnimationRef = useRef<number | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const lastPostIdRef = useRef<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
  const [queueFavoritePending, setQueueFavoritePending] = useState<Record<string, boolean>>({});
  
  // Refs to store latest handler functions for Media Session API
  const handleFooterPlayPauseRef = useRef<(() => Promise<void>) | null>(null);
  const handleFooterPrevRef = useRef<(() => Promise<void>) | null>(null);
  const handleFooterNextRef = useRef<(() => Promise<void>) | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const playPostRef = useRef<((post: PostRow | null) => Promise<void>) | null>(null);

  useEffect(() => {
    const unsubscribe = subscribePreviewSource(setPreview);
    return () => {
      // Ensure cleanup returns void, ignore boolean return value
      unsubscribe();
    };
  }, []);

  // Create silent audio element to anchor Media Session API
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Create a silent audio element that loops
    const audio = new Audio();
    // Use a data URL for a very short silent audio file
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    audio.loop = true;
    audio.volume = 0;
    silentAudioRef.current = audio;

    return () => {
      if (silentAudioRef.current) {
        silentAudioRef.current.pause();
        silentAudioRef.current = null;
      }
    };
  }, []);

  // Keep silent audio always playing when there's a track loaded
  // This maintains the Media Session even when the actual player is paused
  useEffect(() => {
    const audio = silentAudioRef.current;
    if (!audio) return;

    if (currentPost) {
      // Keep silent audio playing to maintain Media Session
      audio.play().catch(() => {
        // Ignore autoplay errors
      });
    } else {
      // Only stop when no track is loaded
      audio.pause();
    }
  }, [currentPost]);

  // Media Session API: Update metadata when track changes
  useEffect(() => {
    if ('mediaSession' in navigator && currentPost) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: formatPostTitle(currentPost.title),
        artist: currentPost.author_username
          ? `@${currentPost.author_username}`
          : '@unknown',
        album: 'BytebeatCloud',
      });
    }
  }, [currentPost]);

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
        if (fromVar?.trim()) {
          accentColor = fromVar.trim();
        }

        const fromVar2 = style.getPropertyValue('--card-bg-color');
        if (fromVar2?.trim()) {
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

  // Cleanup helper
  const clearTimers = () => {
    if (autoTimerRef.current != null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    if (fadeTimerRef.current != null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (switchTimerRef.current != null) {
      window.clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
  };

  const cancelAutoTransition = useCallback(() => {
    clearTimers();
    setFadeGain(1);
  }, [setFadeGain]);

  const playPost = useCallback(
    async (post: PostRow | null) => {
      if (!post) return;

      console.log('[playPost] Starting playback for post:', post.id);
      cancelAutoTransition();
      stopPlayTracking();
      await stop();

      // Set timestamp BEFORE toggle to ensure it's ready when isPlaying changes
      playStartTimeRef.current = Date.now();
      console.log('[playPost] Set playStartTimeRef to:', playStartTimeRef.current);
      const sr = post.sample_rate;
      await toggle(post.expression, post.mode, sr);
      setCurrentPostById(post.id);
      startPlayTracking(post.id);
    },
    [cancelAutoTransition, stopPlayTracking, stop, toggle, setCurrentPostById, startPlayTracking],
  );

  // Update ref whenever playPost changes
  useEffect(() => {
    playPostRef.current = playPost;
  }, [playPost]);

  // Auto-next timer with 3s fade-out before the switch
  useEffect(() => {
    // Only schedule when playing, auto enabled, have at least 2 tracks, and a current post
    if (isPlaying && autoSkipEnabled && currentPost && (playlist?.length ?? 0) >= 2) {
      const FADE_BEFORE_MS = 3000;
      const TOTAL_DELAY_MS = AUTOPLAY_DEFAULT_DURATION * 1000;
      const MIN_REMAINING_MS = 5000; // Minimum 5 seconds before transition

      // Reset timestamp when the post changes (new post started playing)
      if (lastPostIdRef.current !== currentPost.id) {
        playStartTimeRef.current = Date.now();
        lastPostIdRef.current = currentPost.id;
        console.log('[AutoSkip Effect] New post detected, reset playStartTimeRef to:', playStartTimeRef.current);
      }

      // Calculate elapsed time since playback started
      const elapsedMs = playStartTimeRef.current ? Date.now() - playStartTimeRef.current : 0;
      console.log('[AutoSkip Effect] Running for post:', currentPost.id, 'playStartTimeRef:', playStartTimeRef.current, 'elapsedMs:', elapsedMs);
      const remainingMs = TOTAL_DELAY_MS - elapsedMs;

      // Ensure at least MIN_REMAINING_MS before transition
      const actualRemainingMs = Math.max(MIN_REMAINING_MS, remainingMs);
      const fadeStartDelay = Math.max(0, actualRemainingMs - FADE_BEFORE_MS);

      // For progress bar, use the actual total time (elapsed + remaining)
      const actualTotalMs = elapsedMs + actualRemainingMs;
      const progressStartTime = Date.now();

      // Update progress bar continuously using requestAnimationFrame
      const updateProgress = () => {
        const progressElapsed = Date.now() - progressStartTime;
        const totalElapsed = elapsedMs + progressElapsed;
        const progress = Math.min(100, (totalElapsed / actualTotalMs) * 100);

        if (progressBarRef.current) {
          progressBarRef.current.style.width = `${progress}%`;
        }

        if (progress < 100) {
          progressAnimationRef.current = requestAnimationFrame(updateProgress);
        }
      };

      progressAnimationRef.current = requestAnimationFrame(updateProgress);

      // Schedule fade start
      autoTimerRef.current = window.setTimeout(() => {
        // Begin fade-out over 3 seconds
        const durationMs = FADE_BEFORE_MS;
        const stepMs = 100;
        const steps = Math.ceil(durationMs / stepMs);
        let i = 0;
        fadeStartGainRef.current = fadeGain;

        if (fadeTimerRef.current != null) {
          window.clearInterval(fadeTimerRef.current);
        }
        fadeTimerRef.current = window.setInterval(() => {
          i += 1;
          const t = Math.min(1, i / steps);
          const newGain = fadeStartGainRef.current * (1 - t);
          setFadeGain(newGain);
          if (t >= 1) {
            if (fadeTimerRef.current != null) {
              window.clearInterval(fadeTimerRef.current);
              fadeTimerRef.current = null;
            }
          }
        }, stepMs);

        // Schedule actual next track at 3s after fade start
        switchTimerRef.current = window.setTimeout(async () => {
          // If still playing and auto still enabled, advance
          if (isPlaying && autoSkipEnabled) {
            const nextPost = next();
            if (playPostRef.current) {
              await playPostRef.current(nextPost);
            }
            // Restore volume immediately after switching
            setFadeGain(fadeStartGainRef.current);
          } else {
            // Restore volume if auto canceled
            setFadeGain(fadeStartGainRef.current);
          }
        }, FADE_BEFORE_MS);
      }, fadeStartDelay);

      return () => {
        clearTimers();
        if (progressAnimationRef.current !== null) {
          cancelAnimationFrame(progressAnimationRef.current);
          progressAnimationRef.current = null;
        }
      };
    } else {
      // Reset progress when auto mode is not active
      if (progressBarRef.current) {
        progressBarRef.current.style.width = '0%';
      }
      if (progressAnimationRef.current !== null) {
        cancelAnimationFrame(progressAnimationRef.current);
        progressAnimationRef.current = null;
      }
      // Clear the last post ID when not in auto-skip mode
      lastPostIdRef.current = null;
    }
    // Recreate timers when these change
    // Note: fadeGain is intentionally excluded to prevent timer reset during fade animation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost?.id, isPlaying, autoSkipEnabled, playlist?.length, currentPost]);

  const handleFooterPlayPause = useCallback(async () => {
    if (isPlaying) {
      console.log('[handleFooterPlayPause] Stopping playback');
      cancelAutoTransition();
      stopPlayTracking();
      await stop();
      return;
    }

    if (currentPost) {
      console.log('[handleFooterPlayPause] Resuming playback for current post:', currentPost.id);
      cancelAutoTransition();
      await playPost(currentPost);
      return;
    }

    if (preview) {
      await toggle(preview.expression, preview.mode, preview.sampleRate);
    }
  }, [isPlaying, cancelAutoTransition, stopPlayTracking, stop, currentPost, playPost, preview, toggle]);
  
  // Update ref whenever handler changes
  useEffect(() => {
    handleFooterPlayPauseRef.current = handleFooterPlayPause;
  }, [handleFooterPlayPause]);

  const handleFooterPrev = useCallback(async () => {
    cancelAutoTransition();
    await playPost(prev());
  }, [cancelAutoTransition, playPost, prev]);
  
  // Update ref whenever handler changes
  useEffect(() => {
    handleFooterPrevRef.current = handleFooterPrev;
  }, [handleFooterPrev]);

  const handleFooterNext = useCallback(async () => {
    console.log('[handleFooterNext] Called, current playStartTimeRef:', playStartTimeRef.current);
    cancelAutoTransition();
    await playPost(next());
  }, [cancelAutoTransition, playPost, next]);
  
  // Update ref whenever handler changes
  useEffect(() => {
    handleFooterNextRef.current = handleFooterNext;
  }, [handleFooterNext]);

  const handleToggleAuto = () => {
    // Auto maps to looping behavior for continuous play
    cancelAutoTransition();
    setAutoSkip(!autoSkipEnabled);
  };

  const handleShuffle = () => {
    shufflePlaylist();
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

  // Media Session API: Register action handlers (only once on mount)
  useEffect(() => {
    if ('mediaSession' in navigator) {
      console.log('[MediaSession] Registering action handlers');
      
      navigator.mediaSession.setActionHandler('play', () => {
        console.log('[MediaSession] Play action triggered');
        handleFooterPlayPauseRef.current?.();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        console.log('[MediaSession] Pause action triggered');
        handleFooterPlayPauseRef.current?.();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        console.log('[MediaSession] Previous track action triggered');
        handleFooterPrevRef.current?.();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        console.log('[MediaSession] Next track action triggered');
        handleFooterNextRef.current?.();
      });

      return () => {
        console.log('[MediaSession] Cleaning up action handlers');
        // Clean up action handlers
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
      };
    } else {
      console.warn('[MediaSession] Media Session API not available');
    }
    // Empty dependency array - only register once on mount
  }, []);

  // Media Session API: Update playback state
  useEffect(() => {
    if ('mediaSession' in navigator && currentPost) {
      const state = isPlaying ? 'playing' : 'paused';
      console.log('[MediaSession] Setting playback state to:', state);
      navigator.mediaSession.playbackState = state;
      
      // Set position state to help maintain session when paused
      // Use a fake duration since bytebeat tracks loop infinitely
      try {
        navigator.mediaSession.setPositionState({
          duration: 300, // 5 minutes fake duration
          playbackRate: 1,
          position: 0,
        });
      } catch (e) {
        // Ignore if not supported
      }
    }
  }, [isPlaying, currentPost]);

  const handlePlayedPostInfoClick = () => {
    if (!currentPost) return;
    void router.push(`/post/${currentPost.id}`);
  };

  const handleToggleQueue = () => {
    setIsQueueOpen(!isQueueOpen);
  };

  const handleQueueItemClick = async (post: PostRow) => {
    if (post.id === currentPost?.id) return;
    console.log('[handleQueueItemClick] Clicked post:', post.id, 'current playStartTimeRef:', playStartTimeRef.current);
    cancelAutoTransition();
    await playPost(post);
  };

  const handleRemoveFromQueue = (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromPlaylist(postId);
  };

  const handleQueueItemFavoriteClick = async (post: PostRow, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user) {
      await router.push('/login');
      return;
    }

    if (queueFavoritePending[post.id]) {
      return;
    }

    const userId = (user as any).id as string;
    const baseCount = post.favorites_count ?? 0;
    const isFavorited = !!post.favorited_by_current_user;

    setQueueFavoritePending((prev) => ({ ...prev, [post.id]: true }));

    try {
      if (!isFavorited) {
        const { error } = await favoritePost(userId, post.id);

        if (error) {
          console.warn('Error favoriting post', error.message);
          return;
        }

        updateFavoriteStateForPost(post.id, true, baseCount + 1);
        return;
      }

      const { error: deleteError } = await unfavoritePost(userId, post.id);

      if (deleteError) {
        console.warn('Error removing favorite', deleteError.message);
        return;
      }

      updateFavoriteStateForPost(post.id, false, Math.max(0, baseCount - 1));
    } finally {
      setQueueFavoritePending((prev) => ({ ...prev, [post.id]: false }));
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) {
      setDropIndicatorIndex(null);
      return;
    }

    // Determine if we should show indicator before or after this item
    // If dragging down (draggedIndex < index), show after
    // If dragging up (draggedIndex > index), show before
    const targetIndex = draggedIndex < index ? index + 1 : index;
    setDropIndicatorIndex(targetIndex);
  };

  const handleDragLeave = () => {
    // Don't clear immediately as it causes flicker between items
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      // Calculate the actual target index based on drag direction
      const targetIndex = draggedIndex < index ? index : index;
      if (draggedIndex !== targetIndex) {
        reorderPlaylist(draggedIndex, targetIndex);
      }
    }
    setDraggedIndex(null);
    setDropIndicatorIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropIndicatorIndex(null);
  };

  return (
    <>
      <div className="footer">
        {autoSkipEnabled && isPlaying && currentPost && (
          <div className="footer-progress">
            <div ref={progressBarRef} className="footer-progress-bar" />
          </div>
        )}
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
          <div className="played-post-info" onClick={handlePlayedPostInfoClick}>
            <div className="played-post-author">
              {currentPost
                ? currentPost.author_username
                  ? `@${currentPost.author_username}`
                  : '@unknown'
                : '-'}
            </div>
            <div className="played-post-name" ref={titleRef}>
              <span
                className={`played-post-name-text${isTitleOverflowing ? ' is-overflowing' : ''}`}
              >
                {currentPost ? formatPostTitle(currentPost.title) : '-'}
              </span>
            </div>
          </div>
        </div>

        <div className="player-buttons-group">
          <div className="footer-volume">
            <button type="button" className="volume-button" aria-label="Master volume">
              {masterGain > 0 ? (
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 64 64"
                  fill="none"
                  style={{ height: '100%' }}
                >
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
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 64 64"
                  fill="none"
                  style={{ height: '100%' }}
                >
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
          <button
            type="button"
            className={`volume-button${isQueueOpen ? ' active' : ''}`}
            onClick={handleToggleQueue}
            title="Play queue"
          >
            ▤
          </button>
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
      </div>

      {isQueueOpen && (
        <div className="play-queue-container">
          <div className="play-queue-header">
            <span className="play-queue-title">Play Queue ({playlist.length})</span>
            <button
              type="button"
              className="play-queue-close"
              onClick={handleToggleQueue}
              aria-label="Close queue"
            >
              ×
            </button>
          </div>
          <div className="play-queue-controls">
            <button
              type="button"
              className={`play-queue-button toggle ${autoSkipEnabled ? 'active' : ''}`}
              onClick={handleToggleAuto}
            >
              auto-skip
            </button>
            <button
              type="button"
              className="play-queue-button"
              onClick={handleShuffle}
            >
              shuffle
            </button>
          </div>
          <div className="play-queue-list">
            {playlist.length === 0 ? (
              <div className="play-queue-empty">No tracks in queue</div>
            ) : (
              <>
                {playlist.map((post, index) => {
                  const isCurrent = index === currentIndex;
                  const isDragging = draggedIndex === index;
                  const showDropIndicatorBefore = dropIndicatorIndex === index;

                  return (
                    <div key={post.id}>
                      {showDropIndicatorBefore && <div className="play-queue-drop-indicator" />}
                      <div
                        className={`play-queue-item${isCurrent ? ' current' : ''}${isDragging ? ' dragging' : ''}`}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleQueueItemClick(post)}
                      >
                        <div className="play-queue-item-drag-handle">⋮⋮</div>
                        <div className="play-queue-item-info">
                          <div className="play-queue-item-title">{formatPostTitle(post.title)}</div>
                          <div className="play-queue-item-author">
                            {post.author_username ? `@${post.author_username}` : '@unknown'}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`play-queue-item-favorite${post.favorited_by_current_user ? ' favorited' : ''}${
                            queueFavoritePending[post.id] ? ' pending' : ''
                          }`}
                          onClick={(e) => handleQueueItemFavoriteClick(post, e)}
                          disabled={queueFavoritePending[post.id]}
                          aria-label="Favorite"
                          title={
                            post.favorited_by_current_user
                              ? 'Remove from favorites'
                              : 'Add to favorites'
                          }
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
                        <button
                          type="button"
                          className="play-queue-item-remove"
                          onClick={(e) => handleRemoveFromQueue(post.id, e)}
                          aria-label="Remove from queue"
                          title="Remove from queue"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
                {dropIndicatorIndex === playlist.length && (
                  <div className="play-queue-drop-indicator" />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
