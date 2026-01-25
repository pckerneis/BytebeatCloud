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
    // Initialize based on multiple signals
    if (typeof window !== 'undefined') {
      // Check sessionStorage first
      const hasNavigated = sessionStorage.getItem('app-has-navigated') === 'true';
      if (hasNavigated) {
        return true;
      }

      // Check if browser history has more than one entry
      // history.length > 1 means there's something to go back to
      if (window.history.length > 1) {
        sessionStorage.setItem('app-has-navigated', 'true');
        return true;
      }

      // Check if we have a referrer from the same origin (for initial page load)
      const referrer = document.referrer;
      const currentOrigin = window.location.origin;

      if (referrer && referrer.startsWith(currentOrigin)) {
        sessionStorage.setItem('app-has-navigated', 'true');
        return true;
      }
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

    // No need to check on mount since state is initialized from sessionStorage above

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
    };
  }, [router.events]);

  return hasHistory;
}
