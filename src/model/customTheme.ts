export interface CustomTheme {
  id: string;
  label: string;
  variables: Record<string, string>;
  codeMirrorThemeId?: string;
}

export const CUSTOM_THEMES_STORAGE_KEY = 'custom-themes';

export function loadCustomThemesFromStorage(): CustomTheme[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomTheme[];
  } catch {
    return [];
  }
}

export function saveCustomThemesToStorage(themes: CustomTheme[]): void {
  localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
}

export interface VariableDefinition {
  varName: string;
  label: string;
  type: 'color' | 'accent' | 'text' | 'rgba';
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseRgbaColor(cssValue: string): RgbaColor {
  const v = cssValue.trim();
  const rgbaMatch = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  const hexMatch = v.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1].slice(0, 2), 16),
      g: parseInt(hexMatch[1].slice(2, 4), 16),
      b: parseInt(hexMatch[1].slice(4, 6), 16),
      a: hexMatch[2] ? parseInt(hexMatch[2], 16) / 255 : 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function rgbaColorToString({ r, g, b, a }: RgbaColor): string {
  const alpha = Math.round(a * 100) / 100;
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rgbaColorToHex({ r, g, b }: RgbaColor): string {
  return '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
}

export interface VariableGroup {
  label: string;
  items: VariableDefinition[];
}

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: 'Backgrounds',
    items: [
      { varName: '--bg-color', label: 'Background', type: 'color' },
      { varName: '--card-bg-color', label: 'Card background', type: 'color' },
      { varName: '--sidebar-bg-color', label: 'Sidebar background', type: 'color' },
      { varName: '--sidebar-bg-gradient-color', label: 'Sidebar gradient accent', type: 'color' },
    ],
  },
  {
    label: 'Text',
    items: [
      { varName: '--text-color', label: 'Primary text', type: 'color' },
      { varName: '--secondary-text-color', label: 'Secondary text', type: 'color' },
    ],
  },
  {
    label: 'Accent',
    items: [{ varName: '--accent-color-rgb', label: 'Accent color', type: 'accent' }],
  },
  {
    label: 'Borders',
    items: [
      { varName: '--border-color', label: 'Border', type: 'color' },
      { varName: '--panel-border-color', label: 'Panel border', type: 'color' },
      { varName: '--chip-border-color', label: 'Chip border', type: 'color' },
    ],
  },
  {
    label: 'Buttons',
    items: [
      { varName: '--button-bg-color', label: 'Button background', type: 'color' },
      {
        varName: '--button-secondary-bg-color',
        label: 'Secondary button background',
        type: 'color',
      },
      { varName: '--button-border-color', label: 'Button border', type: 'color' },
      { varName: '--button-primary-text-color', label: 'Primary button text', type: 'color' },
    ],
  },
  {
    label: 'Chips & tabs',
    items: [
      { varName: '--chip-background-color', label: 'Chip background', type: 'color' },
      { varName: '--tab-active-bg-color', label: 'Active tab background', type: 'color' },
    ],
  },
  {
    label: 'Code editor (video)',
    items: [
      { varName: '--code-bg-color', label: 'Code background', type: 'color' },
      { varName: '--code-text-color', label: 'Code text', type: 'color' },
    ],
  },
  {
    label: 'State colors',
    items: [
      { varName: '--danger-color', label: 'Danger', type: 'color' },
      { varName: '--danger-background-color', label: 'Danger background', type: 'color' },
      { varName: '--error-text-color', label: 'Error text', type: 'color' },
      { varName: '--error-bg-color', label: 'Error background', type: 'color' },
      { varName: '--warning-color', label: 'Warning', type: 'color' },
      { varName: '--success-color', label: 'Success', type: 'color' },
    ],
  },
  {
    label: 'Posts',
    items: [
      {
        varName: '--post-expression-background-color',
        label: 'Expression background',
        type: 'color',
      },
      {
        varName: '--post-expression-playing-background-color',
        label: 'Expression playing background',
        type: 'color',
      },
      {
        varName: '--post-expression-overlay-color',
        label: 'Expression overlay',
        type: 'rgba',
      },
    ],
  },
  {
    label: 'Overlays & shadows',
    items: [
      { varName: '--shadow-soft-color', label: 'Shadow', type: 'rgba' },
      { varName: '--modal-overlay-color', label: 'Modal overlay', type: 'rgba' },
    ],
  },
];

export const DEFAULT_VARIABLE_VALUES: Record<string, string> = {
  '--bg-color': '#ffffff',
  '--sidebar-bg-color': '#f5f6f7',
  '--sidebar-bg-gradient-color': '#f0e0e0',
  '--card-bg-color': '#fafafa',
  '--border-color': '#e3e6e8',
  '--text-color': '#1a1c1e',
  '--secondary-text-color': '#6a6f73',
  '--code-bg-color': '#0e1a2b',
  '--code-text-color': '#dde8f5',
  '--accent-color-rgb': '91 16 230',
  '--danger-color': '#ff5f6a',
  '--danger-background-color': '#ffeced',
  '--button-primary-text-color': '#ffffff',
  '--button-border-color': '#c5c5c5',
  '--button-bg-color': '#ffffff',
  '--button-secondary-bg-color': '#f5f5f5',
  '--error-text-color': '#b91c1c',
  '--error-bg-color': '#fee2e2',
  '--shadow-soft-color': '#00000033',
  '--modal-overlay-color': 'rgba(0, 0, 0, 0.15)',
  '--tab-active-bg-color': '#efefef',
  '--panel-border-color': '#e3e6e8',
  '--chip-border-color': '#e3e6e8',
  '--chip-background-color': '#fafafa',
  '--post-expression-background-color': '#fafafa',
  '--post-expression-playing-background-color': '#faf7ff',
  '--post-expression-overlay-color': 'rgba(0, 0, 0, 0.25)',
  '--warning-color': '#ff9800',
  '--success-color': '#48cd4c',
};

export function accentToHex(accentRgb: string): string {
  const parts = accentRgb.trim().split(/\s+/);
  if (parts.length !== 3) return '#5b10e6';
  return '#' + parts.map((n) => parseInt(n).toString(16).padStart(2, '0')).join('');
}

export function hexToAccentRgb(hex: string): string {
  if (hex.length < 7 || !hex.startsWith('#')) return '0 0 0';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

export function cssColorToHex(cssValue: string): string {
  const v = cssValue.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v.slice(0, 7);
  const rgbMatch = v.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    return (
      '#' +
      [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
        .map((n) => parseInt(n).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  const rgbaMatch = v.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    return (
      '#' +
      [rgbaMatch[1], rgbaMatch[2], rgbaMatch[3]]
        .map((n) => parseInt(n).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  return '#000000';
}

function resolveBodyVar(varName: string, depth = 0): string {
  if (typeof window === 'undefined' || depth > 5) {
    return DEFAULT_VARIABLE_VALUES[varName] ?? '';
  }
  const val = getComputedStyle(document.body).getPropertyValue(varName).trim();
  if (val.startsWith('var(')) {
    const inner = val.match(/var\((--.+?)(?:,.*?)?\)/)?.[1];
    if (inner) return resolveBodyVar(inner, depth + 1);
  }
  return val;
}

export function readCurrentThemeVariables(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const group of VARIABLE_GROUPS) {
    for (const item of group.items) {
      const resolved = resolveBodyVar(item.varName);
      result[item.varName] = resolved || DEFAULT_VARIABLE_VALUES[item.varName] || '';
    }
  }
  return result;
}

export function generateCustomThemeCss(theme: CustomTheme): string {
  const vars = Object.entries(theme.variables)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `/* BytebeatCloud custom theme: ${theme.label} */\n.theme-${theme.id} {\n${vars}\n}\n`;
}
