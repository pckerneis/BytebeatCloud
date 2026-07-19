export interface TextmodeProgram {
  code: string;
  cols: number;
  rows: number;
  fps: number;
}

export const TEXTMODE_CODE_MAX = 16384;

export const MIN_TEXTMODE_COLS = 1;
export const MAX_TEXTMODE_COLS = 300;
export const MIN_TEXTMODE_ROWS = 1;
export const MAX_TEXTMODE_ROWS = 150;
export const MIN_TEXTMODE_FPS = 1;
export const MAX_TEXTMODE_FPS = 120;

export const DEFAULT_TEXTMODE_COLS = 80;
export const DEFAULT_TEXTMODE_ROWS = 25;
export const DEFAULT_TEXTMODE_FPS = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isTextmodeProgram(value: unknown): value is TextmodeProgram {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === 'string' &&
    typeof v.cols === 'number' &&
    typeof v.rows === 'number' &&
    typeof v.fps === 'number'
  );
}

/**
 * Parses a pasted textmode share link, i.e. a URL whose hash fragment is
 * `#s=<base64url JSON>` as produced by the standalone textmode app's Share
 * button (see web/app.js's encodeState/buildShareUrl). Works with any host,
 * since the encoded state is entirely self-contained in the fragment.
 */
export function parseTextmodeShareLink(input: string): TextmodeProgram | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hashIndex = trimmed.indexOf('#s=');
  const raw = hashIndex >= 0 ? trimmed.slice(hashIndex + 3) : trimmed;

  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);

    if (typeof parsed.code !== 'string') return null;

    const cols = clamp(
      Math.round(Number(parsed.cols)) || DEFAULT_TEXTMODE_COLS,
      MIN_TEXTMODE_COLS,
      MAX_TEXTMODE_COLS,
    );
    const rows = clamp(
      Math.round(Number(parsed.rows)) || DEFAULT_TEXTMODE_ROWS,
      MIN_TEXTMODE_ROWS,
      MAX_TEXTMODE_ROWS,
    );
    const fps = clamp(
      Math.round(Number(parsed.fps)) || DEFAULT_TEXTMODE_FPS,
      MIN_TEXTMODE_FPS,
      MAX_TEXTMODE_FPS,
    );

    return {
      code: parsed.code.slice(0, TEXTMODE_CODE_MAX),
      cols,
      rows,
      fps,
    };
  } catch {
    return null;
  }
}
