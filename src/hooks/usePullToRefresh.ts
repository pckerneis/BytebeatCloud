import { useEffect, useRef, useCallback, useState } from 'react';

interface UsePullToRefreshParams {
  onRefresh: () => void;
  enabled?: boolean;
  threshold?: number;
}

export interface PullToRefreshState {
  isPulling: boolean;
  pullDistance: number;
  isRefreshing: boolean;
  canRelease: boolean;
}

export function usePullToRefresh({
  onRefresh,
  enabled = true,
  threshold = 100,
}: UsePullToRefreshParams): PullToRefreshState {
  const isRefreshingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const [pullState, setPullState] = useState<PullToRefreshState>({
    isPulling: false,
    pullDistance: 0,
    isRefreshing: false,
    canRelease: false,
  });

  const handleRefresh = useCallback(() => {
    if (isRefreshingRef.current || !enabled) return;

    isRefreshingRef.current = true;
    setPullState((prev) => ({ ...prev, isRefreshing: true, isPulling: false }));
    onRefresh();

    setTimeout(() => {
      isRefreshingRef.current = false;
      setPullState({ isPulling: false, pullDistance: 0, isRefreshing: false, canRelease: false });
    }, 1000);
  }, [onRefresh, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const mainEl = document.querySelector('main');
    let touchStartY = 0;
    let touchStartX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      const currentScroll = mainEl ? mainEl.scrollTop : window.scrollY;

      if (currentScroll === 0 && !isRefreshingRef.current) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        isDraggingRef.current = true;
        setPullState((prev) => ({ ...prev, isPulling: true, pullDistance: 0 }));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;

      const currentScroll = mainEl ? mainEl.scrollTop : window.scrollY;
      const touchY = e.touches[0].clientY;
      const touchX = e.touches[0].clientX;
      const deltaY = touchY - touchStartY;
      const deltaX = touchX - touchStartX;

      // Cancel pull-to-refresh if horizontal movement is greater than vertical
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        isDraggingRef.current = false;
        setPullState({
          isPulling: false,
          pullDistance: 0,
          isRefreshing: false,
          canRelease: false,
        });
        return;
      }

      // If user has scrolled down past top, cancel pull
      if (currentScroll > 0) {
        isDraggingRef.current = false;
        setPullState({
          isPulling: false,
          pullDistance: 0,
          isRefreshing: false,
          canRelease: false,
        });
        return;
      }

      const actualDistance = Math.max(0, deltaY);
      setPullState({
        isPulling: actualDistance > 0,
        pullDistance: actualDistance,
        isRefreshing: false,
        canRelease: actualDistance >= threshold,
      });

      // If dragged back to start position, cancel
      if (deltaY <= 0) {
        isDraggingRef.current = false;
      }
    };

    const handleTouchEnd = () => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;

      setPullState((prev) => {
        if (prev.canRelease) {
          handleRefresh();
        }
        return {
          isPulling: false,
          pullDistance: 0,
          isRefreshing: prev.canRelease,
          canRelease: false,
        };
      });
    };

    if (mainEl) {
      mainEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      mainEl.addEventListener('touchmove', handleTouchMove, { passive: true });
      mainEl.addEventListener('touchend', handleTouchEnd, { passive: true });
    } else {
      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    return () => {
      if (mainEl) {
        mainEl.removeEventListener('touchstart', handleTouchStart);
        mainEl.removeEventListener('touchmove', handleTouchMove);
        mainEl.removeEventListener('touchend', handleTouchEnd);
      } else {
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [enabled, threshold, handleRefresh]);

  return pullState;
}
