import { useEffect, useState } from 'react';
import type { PostRow } from '../components/PostList';
import { recordPlayEvent } from '../services/playEventsClient';

interface PlayerStoreState {
  playlist: PostRow[];
  currentIndex: number;
  loopEnabled?: boolean;
  shuffleEnabled?: boolean;
}

interface PlayerStoreSnapshot extends PlayerStoreState {
  currentPost: PostRow | null;
}

// Simple module-level store shared across the app.
let playlist: PostRow[] = [];
let currentIndex = -1;
let loopEnabled = false;
let shuffleEnabled = false;

// Play tracking state
let currentPlayStartTime: number | null = null;
let currentPlayingPostId: string | null = null;
let currentUserId: string | null = null;

const listeners = new Set<(state: PlayerStoreSnapshot) => void>();

function getSnapshot(): PlayerStoreSnapshot {
  return {
    playlist,
    currentIndex,
    currentPost:
      currentIndex >= 0 && currentIndex < playlist.length ? playlist[currentIndex] : null,
  };
}

function emit() {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setPlaylistInternal(newPlaylist: PostRow[], startPostId: string | null) {
  if (shuffleEnabled && newPlaylist.length > 1) {
    // Preserve the starting post at the front if specified
    if (startPostId) {
      const start = newPlaylist.find((p) => p.id === startPostId) ?? newPlaylist[0];
      const rest = newPlaylist.filter((p) => p.id !== start.id);
      playlist = [start, ...shuffleArray(rest)];
    } else {
      playlist = shuffleArray(newPlaylist);
    }
  } else {
    playlist = newPlaylist;
  }
  if (!startPostId) {
    currentIndex = newPlaylist.length > 0 ? 0 : -1;
  } else {
    const idx = newPlaylist.findIndex((p) => p.id === startPostId);
    currentIndex = idx >= 0 ? idx : newPlaylist.length > 0 ? 0 : -1;
  }
  emit();
}

function setCurrentPostByIdInternal(postId: string | null) {
  if (!postId) {
    currentIndex = -1;
  } else {
    currentIndex = playlist.findIndex((p) => p.id === postId);
  }
  emit();
}

function stepInternal(direction: 1 | -1): PlayerStoreSnapshot {
  if (playlist.length === 0) {
    currentIndex = -1;
    emit();
    return getSnapshot();
  }

  if (currentIndex < 0 || currentIndex >= playlist.length) {
    currentIndex = 0;
  } else {
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= playlist.length) {
      if (loopEnabled) {
        currentIndex = nextIndex < 0 ? playlist.length - 1 : 0;
      } else {
        // Clamp at ends; stay on current index.
        currentIndex = Math.max(0, Math.min(currentIndex, playlist.length - 1));
      }
    } else {
      currentIndex = nextIndex;
    }
  }

  emit();
  return getSnapshot();
}

function updateFavoriteStateInternal(postId: string, favorited: boolean, count: number) {
  playlist = playlist.map((p) =>
    p.id === postId
      ? {
          ...p,
          favorites_count: count,
          favorited_by_current_user: favorited,
        }
      : p,
  );
  emit();
}

function setCurrentUserIdInternal(userId: string | null) {
  currentUserId = userId;
}

function startPlayTrackingInternal(postId: string) {
  // If already tracking a different post, flush it first
  if (currentPlayingPostId && currentPlayingPostId !== postId) {
    stopPlayTrackingInternal();
  }
  currentPlayingPostId = postId;
  currentPlayStartTime = Date.now();
}

function stopPlayTrackingInternal() {
  if (currentPlayingPostId && currentPlayStartTime) {
    const durationMs = Date.now() - currentPlayStartTime;
    const durationSeconds = Math.round(durationMs / 1000);

    if (durationSeconds > 0) {
      // Fire and forget - don't block on the API call
      void recordPlayEvent(currentPlayingPostId, durationSeconds, currentUserId ?? undefined);
    }
  }
  currentPlayingPostId = null;
  currentPlayStartTime = null;
}

export function usePlayerStore() {
  const [state, setState] = useState<PlayerStoreSnapshot>(() => getSnapshot());

  useEffect(() => {
    const listener = (s: PlayerStoreSnapshot) => {
      setState(s);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Initialize from localStorage once on first hook usage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const loopStr = window.localStorage.getItem('player-loop-enabled');
      const shuffleStr = window.localStorage.getItem('player-shuffle-enabled');

      let changed = false;

      if (loopStr != null) {
        const v = loopStr === 'true';
        if (loopEnabled !== v) {
          loopEnabled = v;
          changed = true;
        }
      }

      if (shuffleStr != null) {
        const v = shuffleStr === 'true';
        if (shuffleEnabled !== v) {
          shuffleEnabled = v;
          // Re-apply shuffle to current playlist, keeping current first when possible
          if (playlist.length > 0) {
            const current = getSnapshot().currentPost;
            const newOrder = v
              ? current
                ? [current, ...shuffleArray(playlist.filter((p) => p.id !== current.id))]
                : shuffleArray(playlist)
              : playlist.slice();
            playlist = newOrder;
            if (current) {
              currentIndex = newOrder.findIndex((p) => p.id === current.id);
            }
          }
          changed = true;
        }
      }

      if (changed) {
        emit();
      }
    } catch {}
  }, []);

  return {
    playlist: state.playlist,
    currentIndex: state.currentIndex,
    currentPost: state.currentPost,
    setPlaylist: (posts: PostRow[], startPostId: string | null) =>
      setPlaylistInternal(posts, startPostId),
    setCurrentPostById: (postId: string | null) => setCurrentPostByIdInternal(postId),
    next: () => stepInternal(1).currentPost,
    prev: () => stepInternal(-1).currentPost,
    updateFavoriteStateForPost: (postId: string, favorited: boolean, count: number) =>
      updateFavoriteStateInternal(postId, favorited, count),
    setCurrentUserId: (userId: string | null) => setCurrentUserIdInternal(userId),
    startPlayTracking: (postId: string) => startPlayTrackingInternal(postId),
    stopPlayTracking: () => stopPlayTrackingInternal(),
    // Loop & shuffle controls
    loopEnabled: loopEnabled,
    shuffleEnabled: shuffleEnabled,
    setLoop: (enabled: boolean) => {
      loopEnabled = enabled;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('player-loop-enabled', String(enabled));
        }
      } catch {}
      emit();
    },
    setShuffle: (enabled: boolean) => {
      shuffleEnabled = enabled;
      // Re-apply shuffle to current playlist order, keeping current post in place as first
      if (playlist.length > 0) {
        const current = state.currentPost;
        const newOrder = enabled
          ? current
            ? [current, ...shuffleArray(playlist.filter((p) => p.id !== current.id))]
            : shuffleArray(playlist)
          : playlist.slice();
        playlist = newOrder;
        currentIndex = current ? newOrder.findIndex((p) => p.id === current.id) : currentIndex;
      }
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('player-shuffle-enabled', String(enabled));
        }
      } catch {}
      emit();
    },
  };
}

// Initialize persisted flags on first hook mount
// This effect must be outside the returned object but inside the module scope of the hook function.
// It runs when usePlayerStore is called and the component mounts.
export function __initPlayerStorePersistence() {}
