import { PropsWithChildren, useEffect } from 'react';
import { warmUpBytebeatEngine } from '../hooks/useBytebeatPlayer';
import { useTheme } from '../hooks/useTheme';
import { DEFAULT_THEME_ID } from '../theme/themes';
import { ThemeContext } from '../theme/ThemeContext';
import useAudioWarmup from '../hooks/useAudioWarmup';

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
  useAudioWarmup();

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
