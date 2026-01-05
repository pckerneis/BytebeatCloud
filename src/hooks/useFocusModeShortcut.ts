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

        const { pathname, query } = router;

        // Toggle between standard and focus modes for different pages
        if (pathname === '/create/focus') {
          void router.push('/create');
        } else if (pathname === '/create') {
          void router.push('/create/focus');
        } else if (pathname === '/edit/[id]/focus' && query.id) {
          void router.push(`/edit/${query.id}`);
        } else if (pathname === '/edit/[id]' && query.id) {
          void router.push(`/edit/${query.id}/focus`);
        } else if (pathname === '/fork/[id]/focus' && query.id) {
          void router.push(`/fork/${query.id}`);
        } else if (pathname === '/fork/[id]' && query.id) {
          void router.push(`/fork/${query.id}/focus`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);
}
