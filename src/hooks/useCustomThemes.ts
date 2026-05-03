import { useEffect, useState } from 'react';
import {
  type CustomTheme,
  loadCustomThemesFromStorage,
  generateCustomThemeCss,
} from '../model/customTheme';

export const CUSTOM_THEMES_UPDATED_EVENT = 'customthemes:updated';

export function injectCustomThemeCss(theme: CustomTheme): void {
  let el = document.getElementById('custom-theme-style') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'custom-theme-style';
    document.head.appendChild(el);
  }
  el.textContent = generateCustomThemeCss(theme);
}

function removeCustomThemeCss(): void {
  document.getElementById('custom-theme-style')?.remove();
}

export function useCustomThemes(activeThemeId: string) {
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() =>
    loadCustomThemesFromStorage(),
  );

  useEffect(() => {
    const activeCustomTheme = customThemes.find((t) => t.id === activeThemeId);
    if (activeCustomTheme) {
      injectCustomThemeCss(activeCustomTheme);
    } else {
      removeCustomThemeCss();
    }
  }, [activeThemeId, customThemes]);

  useEffect(() => {
    const handler = () => setCustomThemes(loadCustomThemesFromStorage());
    window.addEventListener(CUSTOM_THEMES_UPDATED_EVENT, handler);
    return () => window.removeEventListener(CUSTOM_THEMES_UPDATED_EVENT, handler);
  }, []);

  return { customThemes };
}
