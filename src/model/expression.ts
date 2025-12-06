export enum ModeOption {
  Uint8 = 'uint8',
  Int8 = 'int8',
  Float = 'float',
}

export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 48000;
export const DEFAULT_SAMPLE_RATE = 8000;

export const SAMPLE_RATE_PRESETS = [8000, 11025, 16000, 22050, 32000, 44100];

export function formatSampleRate(sr: number): string {
  return sr / 1000 + 'kHz';
}

export function minimizeExpression(expr: string): string {
  try {
    // Remove spaces around common operators and punctuation, then collapse leftovers.
    const tightened = expr.replace(/\s*([+\-*/%&|^!<>=?:,;(){}\[\]])\s*/g, '$1');
    return tightened.replace(/\s+/g, ' ').trim();
  } catch {
    return expr;
  }
}
