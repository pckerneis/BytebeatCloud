import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

/**
 * Hook to detect if there's navigable history in the current session.
 * Returns true if the user navigated to this page from within the app,
 * false if they accessed it directly via URL.
 */
export function useHasHistory(): boolean {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(() => {
    // Initialize from sessionStorage if available
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('app-has-navigated') === 'true';
    }
    return false;
  });

  useEffect(() => {
    // Set the flag on any route change (client-side navigation)
    const handleRouteChangeStart = () => {
      sessionStorage.setItem('app-has-navigated', 'true');
    };

    const handleRouteChangeComplete = () => {
      // Re-check sessionStorage after navigation completes
      setHasHistory(sessionStorage.getItem('app-has-navigated') === 'true');
    };

    // Set up listeners
    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);

    // Check current state on mount
    const hasNavigated = sessionStorage.getItem('app-has-navigated');
    if (hasNavigated === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasHistory(true);
    } else {
      // Check if we have a referrer from the same origin (for initial page load)
      const referrer = document.referrer;
      const currentOrigin = window.location.origin;

      if (referrer && referrer.startsWith(currentOrigin)) {
        setHasHistory(true);
        sessionStorage.setItem('app-has-navigated', 'true');
      }
    }

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
    };
  }, [router.events]);

  return hasHistory;
}
