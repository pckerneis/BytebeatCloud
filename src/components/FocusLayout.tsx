import { PropsWithChildren, useEffect } from 'react';
import { warmUpBytebeatEngine } from '../hooks/useBytebeatPlayer';
import { useTheme } from '../hooks/useTheme';
import { DEFAULT_THEME_ID } from '../theme/themes';
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
  const { theme } = useTheme();

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
