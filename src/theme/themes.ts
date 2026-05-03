import type { Extension } from '@codemirror/state';
import { tomorrowNightBlue } from '@uiw/codemirror-theme-tomorrow-night-blue';
import { aura } from '@uiw/codemirror-theme-aura';
import { githubDark } from '@uiw/codemirror-theme-github';
import { monokaiDimmed } from '@uiw/codemirror-theme-monokai-dimmed';
import { noctisLilac } from '@uiw/codemirror-theme-noctis-lilac';
import { basicDark, basicLight } from '@uiw/codemirror-theme-basic';
import { loadCustomThemesFromStorage } from '../model/customTheme';

export interface CodeMirrorTheme {
  id: string;
  label: string;
  extension: Extension;
}

export const CODEMIRROR_THEMES: CodeMirrorTheme[] = [
  { id: 'noctis-lilac', label: 'Noctis Lilac', extension: noctisLilac },
  { id: 'aura', label: 'Aura', extension: aura },
  { id: 'tomorrow-night-blue', label: 'Tomorrow Night Blue', extension: tomorrowNightBlue },
  { id: 'monokai-dimmed', label: 'Monokai Dimmed', extension: monokaiDimmed },
  { id: 'github-dark', label: 'GitHub Dark', extension: githubDark },
  { id: 'basic-dark', label: 'Basic Dark', extension: basicDark },
  { id: 'basic-light', label: 'Basic Light', extension: basicLight },
];

export function getCodeMirrorThemeExtension(id: string | undefined): Extension {
  return CODEMIRROR_THEMES.find((t) => t.id === id)?.extension ?? CODEMIRROR_THEMES[0].extension;
}

export type ThemeId =
  | 'default'
  | 'mint'
  | 'indigo'
  | 'carmine'
  | 'dark-minimal'
  | 'dark-cyber'
  | 'dark-graphite'
  | 'oled';

export interface UiTheme {
  id: ThemeId;
  /** Short human-friendly name shown in the UI */
  label: string;
  /** CodeMirror theme extension to use for editors under this UI theme */
  codeMirrorTheme: Extension;
}

export const UI_THEMES: UiTheme[] = [
  { id: 'default', label: 'default', codeMirrorTheme: noctisLilac },
  { id: 'mint', label: 'mint', codeMirrorTheme: aura },
  { id: 'indigo', label: 'indigo', codeMirrorTheme: tomorrowNightBlue },
  { id: 'carmine', label: 'carmine', codeMirrorTheme: monokaiDimmed },
  { id: 'dark-graphite', label: 'dark graphite', codeMirrorTheme: basicDark },
  { id: 'dark-minimal', label: 'dark minimal', codeMirrorTheme: aura },
  { id: 'dark-cyber', label: 'dark cyber', codeMirrorTheme: aura },
  { id: 'oled', label: 'oled', codeMirrorTheme: githubDark },
];

export const DEFAULT_THEME_ID: ThemeId = 'default';

export function getUiTheme(id: ThemeId | string | null | undefined): UiTheme {
  const found = UI_THEMES.find((t) => t.id === id);
  if (found) return found;
  const customTheme = loadCustomThemesFromStorage().find((t) => t.id === id);
  return {
    id: (id ?? DEFAULT_THEME_ID) as ThemeId,
    label: customTheme?.label ?? id ?? DEFAULT_THEME_ID,
    codeMirrorTheme: getCodeMirrorThemeExtension(customTheme?.codeMirrorThemeId),
  };
}
