import type { Extension } from '@codemirror/state';
import { tomorrowNightBlue } from '@uiw/codemirror-theme-tomorrow-night-blue';
import { aura } from '@uiw/codemirror-theme-aura';
import { githubDark  } from '@uiw/codemirror-theme-github';
import { monokaiDimmed } from '@uiw/codemirror-theme-monokai-dimmed';
import { noctisLilac } from '@uiw/codemirror-theme-noctis-lilac';
import { basicDark } from '@uiw/codemirror-theme-basic';

export type ThemeId =
  | 'default'
  | 'mint'
  | 'indigo'
  | 'mono-red'
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
  { id: 'mono-red', label: 'mono + red', codeMirrorTheme: monokaiDimmed },
  { id: 'dark-graphite', label: 'dark graphite', codeMirrorTheme: basicDark },
  { id: 'dark-minimal', label: 'dark minimal', codeMirrorTheme: aura },
  { id: 'dark-cyber', label: 'dark cyber', codeMirrorTheme: aura },
  { id: 'oled', label: 'oled', codeMirrorTheme: githubDark },
];

export const DEFAULT_THEME_ID: ThemeId = 'default';

export function getUiTheme(id: ThemeId | string | null | undefined): UiTheme {
  const found = UI_THEMES.find((t) => t.id === id);
  return found ?? UI_THEMES[0];
}
