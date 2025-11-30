import { useEffect, RefObject, MutableRefObject } from 'react';

interface UseInfiniteScrollParams {
  hasMore: boolean;
  loadingMoreRef: MutableRefObject<boolean>;
  sentinelRef: RefObject<HTMLDivElement | null>;
  setPage: (updater: (prev: number) => number) => void;
}

export function useInfiniteScroll({ hasMore, loadingMoreRef, sentinelRef, setPage }: UseInfiniteScrollParams) {
  useEffect(() => {
    if (!hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !loadingMoreRef.current && hasMore) {
          loadingMoreRef.current = true;
          setPage((p) => p + 1);
        }
      });
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadingMoreRef, sentinelRef, setPage]);
}
