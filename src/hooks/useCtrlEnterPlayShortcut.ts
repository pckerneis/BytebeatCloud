import { useEffect } from 'react';

export function useCtrlEnterPlayShortcut(onTogglePlay: () => void) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.code !== 'Enter') return;

      const target = e.target as HTMLElement | null;
      if (!target?.closest('.cm-editor')) return;

      e.preventDefault();
      onTogglePlay();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onTogglePlay]);
}
