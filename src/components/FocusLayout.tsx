import { PropsWithChildren, useEffect, useState } from 'react';
import { warmUpBytebeatEngine } from '../hooks/useBytebeatPlayer';
import { DEFAULT_THEME_ID, type ThemeId, UI_THEMES } from '../theme/themes';
import { ThemeContext } from '../theme/ThemeContext';

function FocusHeader() {
  return (
    <div className='focus-header px-12 py-8 flex-row align-items-center'>
      <h1>Create</h1>
      <button className="button secondary small ml-auto">
        Exit focus mode
      </button>
    </div>
  )
}

function FocusFooter() {
  return (
    <div className="focus-footer px-12 py-8 flex-row align-items-center">
      FOOTER
    </div>
  )
}

export function FocusLayout({ children }: Readonly<PropsWithChildren>) {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    const stored = localStorage.getItem('ui-theme') as ThemeId | null;

    if (stored && UI_THEMES.some((t) => t.id === stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (theme) {
      const root = document.body;

      UI_THEMES.forEach((t) => {
        root.classList.remove(`theme-${t.id}`);
      });

      root.classList.add(`theme-${theme}`);
      window.localStorage.setItem('ui-theme', theme);
    }
  }, [theme]);

  // Warm up the audio engine on the very first user interaction anywhere
  // in the app, so the initial AudioContext/worklet cost is paid upfront.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let warmedUp = false;

    const handleFirstInteraction = () => {
      if (warmedUp) return;
      warmedUp = true;
      void warmUpBytebeatEngine();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { once: false });
    window.addEventListener('keydown', handleFirstInteraction, { once: false });

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  return (
    <ThemeContext.Provider value={theme ?? DEFAULT_THEME_ID}>
      <div className="root">
        <FocusHeader />
        <div className="top-content">
          {children}
        </div>
        <FocusFooter />
      </div>
    </ThemeContext.Provider>
  );
}
