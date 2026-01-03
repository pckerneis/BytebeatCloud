import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Hook to handle Ctrl+Shift+F shortcut for toggling focus mode
 */
export function useFocusModeShortcut() {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+Shift+F (or Cmd+Shift+F on Mac)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        
        // Toggle between /create and /create/focus
        if (router.pathname === '/create/focus') {
          void router.push('/create');
        } else if (router.pathname === '/create') {
          void router.push('/create/focus');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);
}
