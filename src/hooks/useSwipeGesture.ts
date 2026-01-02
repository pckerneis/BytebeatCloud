import { useEffect, useRef, useState } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
}

export interface SwipeState {
  isDragging: boolean;
  translateX: number;
}

/**
 * Hook to detect horizontal swipe gestures on touch devices.
 * Calls onSwipeLeft when user swipes left, onSwipeRight when user swipes right.
 * Returns swipe state for visual feedback.
 */
export function useSwipeGesture(options: SwipeGestureOptions): SwipeState {
  const { onSwipeLeft, onSwipeRight, threshold = 50, enabled = true } = options;
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const [swipeState, setSwipeState] = useState<SwipeState>({
    isDragging: false,
    translateX: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchEndX.current = null;
      touchEndY.current = null;
      setSwipeState({ isDragging: false, translateX: 0 });
    };

    const handleTouchMove = (e: TouchEvent) => {
      touchEndX.current = e.touches[0].clientX;
      touchEndY.current = e.touches[0].clientY;

      if (touchStartX.current !== null && touchStartY.current !== null) {
        const deltaX = touchEndX.current - touchStartX.current;
        const deltaY = touchEndY.current - touchStartY.current;

        // Only show visual feedback if horizontal swipe is dominant
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Dampen the translation to 30% of actual movement for subtle effect
          const dampedTranslateX = deltaX * 0.3;
          setSwipeState({ isDragging: true, translateX: dampedTranslateX });
        }
      }
    };

    const handleTouchEnd = () => {
      if (
        touchStartX.current === null ||
        touchStartY.current === null ||
        touchEndX.current === null ||
        touchEndY.current === null
      ) {
        return;
      }

      const deltaX = touchEndX.current - touchStartX.current;
      const deltaY = touchEndY.current - touchStartY.current;

      // Only trigger if horizontal swipe is dominant (more horizontal than vertical)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
          // Swipe right
          onSwipeRight?.();
        } else {
          // Swipe left
          onSwipeLeft?.();
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
      touchEndX.current = null;
      touchEndY.current = null;
      setSwipeState({ isDragging: false, translateX: 0 });
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, threshold, enabled]);

  return swipeState;
}
