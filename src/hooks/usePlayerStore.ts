import { useEffect, useState } from 'react';
import type { PostRow } from '../components/PostList';

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
    const idx = playlist.findIndex((p) => p.id === postId);
    currentIndex = idx;
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
  };
}
