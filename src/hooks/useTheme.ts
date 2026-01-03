import { useEffect, useState } from 'react';
import { DEFAULT_THEME_ID, type ThemeId, UI_THEMES } from '../theme/themes';

export function useTheme() {
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

  return { theme, setTheme };
}
