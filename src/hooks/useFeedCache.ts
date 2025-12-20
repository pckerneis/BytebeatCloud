import { useCallback, useEffect, useRef } from 'react';
import { PostRow } from '../components/PostList';

interface FeedCacheEntry {
  posts: PostRow[];
  page: number;
  hasMore: boolean;
  scrollY: number;
  timestamp: number;
}

type FeedCacheKey = string;

// In-memory cache that persists across navigations but not page refreshes
const feedCache = new Map<FeedCacheKey, FeedCacheEntry>();

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(tab: string, userId?: string): FeedCacheKey {
  return `${tab}:${userId ?? 'anon'}`;
}

function isValidCache(entry: FeedCacheEntry | undefined): entry is FeedCacheEntry {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

interface UseFeedCacheParams {
  tab: string;
  userId?: string;
}

interface UseFeedCacheReturn {
  getCachedState: () => FeedCacheEntry | null;
  updateCache: (posts: PostRow[], page: number, hasMore: boolean) => void;
  saveScrollPosition: () => void;
  restoreScrollPosition: () => void;
  clearCache: () => void;
}

export function useFeedCache({ tab, userId }: UseFeedCacheParams): UseFeedCacheReturn {
  const cacheKey = getCacheKey(tab, userId);
  const hasRestoredScroll = useRef(false);

  const getCachedState = useCallback((): FeedCacheEntry | null => {
    const entry = feedCache.get(cacheKey);
    const valid = isValidCache(entry);
    console.log('[FeedCache] getCachedState', { cacheKey, hasEntry: !!entry, valid, entry });
    return valid ? entry : null;
  }, [cacheKey]);

  const updateCache = useCallback(
    (posts: PostRow[], page: number, hasMore: boolean) => {
      console.log('[FeedCache] updateCache', { cacheKey, postsCount: posts.length, page, hasMore });
      feedCache.set(cacheKey, {
        posts,
        page,
        hasMore,
        scrollY: feedCache.get(cacheKey)?.scrollY ?? 0,
        timestamp: Date.now(),
      });
    },
    [cacheKey],
  );

  const saveScrollPosition = useCallback(() => {
    const entry = feedCache.get(cacheKey);
    // Scroll is on the main element, not window
    const mainEl = document.querySelector('main');
    const scrollY = mainEl?.scrollTop ?? window.scrollY;
    console.log('[FeedCache] saveScrollPosition', { cacheKey, hasEntry: !!entry, scrollY });
    if (entry) {
      entry.scrollY = scrollY;
      entry.timestamp = Date.now();
    }
  }, [cacheKey]);

  const restoreScrollPosition = useCallback(() => {
    console.log('[FeedCache] restoreScrollPosition called', { cacheKey, hasRestoredScroll: hasRestoredScroll.current });
    if (hasRestoredScroll.current) return;
    const entry = feedCache.get(cacheKey);
    console.log('[FeedCache] restoreScrollPosition', { hasEntry: !!entry, scrollY: entry?.scrollY });
    if (entry && entry.scrollY > 0) {
      hasRestoredScroll.current = true;
      const targetY = entry.scrollY;
      
      // Wait for DOM to render with multiple attempts
      let attempts = 0;
      const maxAttempts = 10;
      
      const tryScroll = () => {
        attempts++;
        // Scroll is on the main element, not window
        const mainEl = document.querySelector('main');
        if (mainEl) {
          const maxScroll = mainEl.scrollHeight - mainEl.clientHeight;
          if (maxScroll >= targetY || attempts >= maxAttempts) {
            console.log('[FeedCache] Scrolling main to', targetY, 'attempt', attempts);
            mainEl.scrollTo(0, targetY);
          } else {
            // DOM not ready yet, try again
            requestAnimationFrame(tryScroll);
          }
        } else if (attempts >= maxAttempts) {
          // Fallback to window scroll
          window.scrollTo(0, targetY);
        } else {
          requestAnimationFrame(tryScroll);
        }
      };
      
      requestAnimationFrame(tryScroll);
    }
  }, [cacheKey]);

  const clearCache = useCallback(() => {
    feedCache.delete(cacheKey);
  }, [cacheKey]);

  // Reset scroll restoration flag when cache key changes
  useEffect(() => {
    hasRestoredScroll.current = false;
  }, [cacheKey]);

  return {
    getCachedState,
    updateCache,
    saveScrollPosition,
    restoreScrollPosition,
    clearCache,
  };
}

// Clear all feed caches (useful for logout, etc.)
export function clearAllFeedCaches() {
  feedCache.clear();
}
