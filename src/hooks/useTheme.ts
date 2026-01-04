import { useEffect, useState } from 'react';
import { DEFAULT_THEME_ID, type ThemeId, UI_THEMES } from '../theme/themes';

function getInitialTheme(): ThemeId {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_ID;
  }

  const stored = localStorage.getItem('ui-theme') as ThemeId | null;

  if (stored && UI_THEMES.some((t) => t.id === stored)) {
    return stored;
  }

  return DEFAULT_THEME_ID;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme);

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
