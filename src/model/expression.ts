export enum ModeOption {
  Int = 'int',
  Float = 'float',
}

export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 48000;
export const DEFAULT_SAMPLE_RATE = 44100;

export const SAMPLE_RATE_PRESETS = [8000, 11025, 16000, 22050, 32000, 44100];

export type EncodedMode = 'int' | 'float';

export function encodeMode(mode: ModeOption): EncodedMode {
  // ModeOption values already match the encoded strings.
  return mode;
}

export function decodeMode(value: EncodedMode | null | undefined): ModeOption {
  if (value === 'int') return ModeOption.Int;
  return ModeOption.Float;
}

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
