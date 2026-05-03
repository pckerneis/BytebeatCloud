import { createContext, useContext } from 'react';
import { DEFAULT_THEME_ID } from './themes';

export const ThemeContext = createContext<string>(DEFAULT_THEME_ID);

export function useThemeId(): string {
  return useContext(ThemeContext);
}
