import { useEffect, useState } from 'react';
import { DEFAULT_THEME_ID, UI_THEMES } from '../theme/themes';
import { loadCustomThemesFromStorage } from '../model/customTheme';

function getInitialTheme(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_ID;
  }

  const stored = localStorage.getItem('ui-theme');

  if (stored) {
    if (UI_THEMES.some((t) => t.id === stored)) return stored;
    if (stored.startsWith('custom-') && loadCustomThemesFromStorage().some((t) => t.id === stored)) {
      return stored;
    }
  }

  return DEFAULT_THEME_ID;
}

export function useTheme() {
  const [theme, setTheme] = useState<string>(getInitialTheme);

  useEffect(() => {
    if (theme) {
      const root = document.body;

      Array.from(root.classList)
        .filter((c) => c.startsWith('theme-'))
        .forEach((c) => root.classList.remove(c));

      root.classList.add(`theme-${theme}`);
      window.localStorage.setItem('ui-theme', theme);
    }
  }, [theme]);

  return { theme, setTheme };
}
