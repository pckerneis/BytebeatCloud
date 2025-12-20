import { useEffect, useRef, RefObject, MutableRefObject } from 'react';

interface UseInfiniteScrollParams {
  hasMore: boolean;
  loadingMoreRef: MutableRefObject<boolean>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  setPage: (updater: (prev: number) => number) => void;
  /** Delay before observer starts watching (prevents immediate trigger on mount) */
  initialDelayMs?: number;
}

export function useInfiniteScroll({
  hasMore,
  loadingMoreRef,
  sentinelRef,
  setPage,
  initialDelayMs = 100,
}: UseInfiniteScrollParams) {
  const isInitializedRef = useRef(false);
  const lastTriggerTimeRef = useRef(0);

  useEffect(() => {
    if (!hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Debounce: prevent rapid successive triggers
    const DEBOUNCE_MS = 300;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const now = Date.now();
        const timeSinceLastTrigger = now - lastTriggerTimeRef.current;

        if (
          entry.isIntersecting &&
          !loadingMoreRef.current &&
          hasMore &&
          isInitializedRef.current &&
          timeSinceLastTrigger > DEBOUNCE_MS
        ) {
          loadingMoreRef.current = true;
          lastTriggerTimeRef.current = now;
          setPage((p) => p + 1);
        }
      });
    });

    // Delay observer activation to prevent immediate trigger on mount/restore
    const timeoutId = setTimeout(() => {
      isInitializedRef.current = true;
      observer.observe(sentinel);
    }, initialDelayMs);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [hasMore, loadingMoreRef, sentinelRef, setPage, initialDelayMs]);

  // Reset initialization flag when hasMore changes to false then back to true
  useEffect(() => {
    if (!hasMore) {
      isInitializedRef.current = false;
    }
  }, [hasMore]);
}
