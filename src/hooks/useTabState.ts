import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

interface UseTabStateOptions<T> {
  /** Query parameter name (default: 'tab') */
  queryParam?: string;
  /** Callback when tab changes (useful for resetting pagination, etc.) */
  onTabChange?: (tab: T) => void;
}

/**
 * Hook to manage tab state synced with URL query parameter.
 * - Reads initial tab from URL on mount
 * - Updates URL (shallow) when tab changes
 * - Syncs state if URL changes externally
 * - Optionally calls onTabChange callback
 */
export function useTabState<T extends string>(
  tabs: readonly T[],
  defaultTab: T,
  options: UseTabStateOptions<T> = {},
) {
  const { queryParam = 'tab', onTabChange } = options;
  const router = useRouter();
  const isFirstRender = useRef(true);

  const [activeTab, setActiveTabState] = useState<T>(() => {
    const param = router.query[queryParam] as string;
    return tabs.includes(param as T) ? (param as T) : defaultTab;
  });

  // Sync with URL when query param changes externally
  useEffect(() => {
    const param = router.query[queryParam] as string;
    const newTab = tabs.includes(param as T) ? (param as T) : defaultTab;

    if (newTab !== activeTab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTabState(newTab);
      onTabChange?.(newTab);
    } else if (isFirstRender.current) {
      // Call onTabChange on first render to initialize
      isFirstRender.current = false;
    }
  }, [router.query, queryParam, tabs, defaultTab, activeTab, onTabChange]);

  const setActiveTab = (tab: T) => {
    if (tab === activeTab) return;
    
    // Update URL immediately (this is fast and non-blocking)
    void router.replace(
      { pathname: router.pathname, query: { ...router.query, [queryParam]: tab } },
      undefined,
      { shallow: true },
    );
    
    // Then update state (this may trigger expensive re-renders)
    setActiveTabState(tab);
    onTabChange?.(tab);
  };

  return [activeTab, setActiveTab] as const;
}
