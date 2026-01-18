import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

/**
 * Hook to detect if there's navigable history in the current session.
 * Returns true if the user navigated to this page from within the app,
 * false if they accessed it directly via URL.
 */
export function useHasHistory(): boolean {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    // Mark that we've navigated within the app
    // This persists across client-side navigations
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
      } else {
        setHasHistory(false);
      }
    }
  }, []);

  // Set the flag on any route change (client-side navigation)
  useEffect(() => {
    const handleRouteChange = () => {
      sessionStorage.setItem('app-has-navigated', 'true');
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  return hasHistory;
}
