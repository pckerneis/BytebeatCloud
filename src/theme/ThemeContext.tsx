import { createContext, useContext } from 'react';
import type { ThemeId } from './themes';
import { DEFAULT_THEME_ID } from './themes';

export const ThemeContext = createContext<ThemeId>(DEFAULT_THEME_ID);

export function useThemeId(): ThemeId {
  return useContext(ThemeContext);
}
