import { useEffect, useRef } from 'react';
import type { PostRow } from '../components/PostList';
import { formatPostTitle } from '../utils/post-format';

interface UseMediaSessionProps {
  currentPost: PostRow | null;
  isPlaying: boolean;
  onPlayPause: () => Promise<void>;
  onPrevious: () => Promise<void>;
  onNext: () => Promise<void>;
}

export function useMediaSession({
  currentPost,
  isPlaying,
  onPlayPause,
  onPrevious,
  onNext,
}: UseMediaSessionProps) {
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const onPlayPauseRef = useRef<(() => Promise<void>) | null>(null);
  const onPreviousRef = useRef<(() => Promise<void>) | null>(null);
  const onNextRef = useRef<(() => Promise<void>) | null>(null);

  // Update refs whenever handlers change
  useEffect(() => {
    onPlayPauseRef.current = onPlayPause;
  }, [onPlayPause]);

  useEffect(() => {
    onPreviousRef.current = onPrevious;
  }, [onPrevious]);

  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);

  // Create silent audio element to anchor Media Session API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create a silent audio element that loops
    const audio = new Audio();
    // Use a data URL for a very short silent audio file
    audio.src =
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
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

  // Update metadata when track changes
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

  // Register action handlers (only once on mount)
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        onPlayPauseRef.current?.();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        onPlayPauseRef.current?.();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        onPreviousRef.current?.();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        onNextRef.current?.();
      });

      return () => {
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

  // Update playback state
  useEffect(() => {
    if ('mediaSession' in navigator && currentPost) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

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
}
