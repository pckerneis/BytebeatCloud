import { useEffect, useState } from 'react';
import type { PostRow } from '../components/PostList';
import { recordPlayEvent } from '../services/playEventsClient';

interface PlayerStoreState {
  playlist: PostRow[];
  currentIndex: number;
}

interface PlayerStoreSnapshot extends PlayerStoreState {
  currentPost: PostRow | null;
}

// Simple module-level store shared across the app.
let playlist: PostRow[] = [];
let currentIndex = -1;

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

function setPlaylistInternal(newPlaylist: PostRow[], startPostId: string | null) {
  playlist = newPlaylist;
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
      // Clamp at ends; stay on current index.
      currentIndex = Math.max(0, Math.min(currentIndex, playlist.length - 1));
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
  };
}
