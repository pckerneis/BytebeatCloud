export enum ModeOption {
  Uint8 = 'uint8',
  Int8 = 'int8',
  Float = 'float',
}

export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 48000;
export const DEFAULT_SAMPLE_RATE = 8000;

export const SAMPLE_RATE_PRESETS = [8000, 11025, 16000, 22050, 32000, 44100];

export type EncodedMode = 'float' | 'uint8' | 'int8';

export function encodeMode(mode: ModeOption): EncodedMode {
  // ModeOption values already match the encoded strings, except legacy 'int'.
  if (mode === ModeOption.Uint8) return 'uint8';
  if (mode === ModeOption.Int8) return 'int8';
  return 'float';
}

export function decodeMode(value: EncodedMode | null | undefined): ModeOption {
  if (value === 'uint8') return ModeOption.Uint8;
  if ( value === 'int8') return ModeOption.Int8;
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
