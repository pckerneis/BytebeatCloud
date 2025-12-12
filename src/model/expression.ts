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
    const stripped = (() => {
      let out = '';
      let i = 0;
      let inSingle = false;
      let inDouble = false;
      let inTemplate = false;
      let escaped = false;

      while (i < expr.length) {
        const ch = expr[i] as string;
        const next = i + 1 < expr.length ? (expr[i + 1] as string) : '';

        if (inSingle || inDouble || inTemplate) {
          out += ch;
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (inSingle && ch === "'") {
            inSingle = false;
          } else if (inDouble && ch === '"') {
            inDouble = false;
          } else if (inTemplate && ch === '`') {
            inTemplate = false;
          }
          i += 1;
          continue;
        }

        if (ch === '/' && next === '/') {
          i += 2;
          while (i < expr.length && expr[i] !== '\n') {
            i += 1;
          }
          continue;
        }

        if (ch === '/' && next === '*') {
          i += 2;
          while (i + 1 < expr.length && !(expr[i] === '*' && expr[i + 1] === '/')) {
            i += 1;
          }
          i = Math.min(expr.length, i + 2);
          continue;
        }

        if (ch === "'") {
          inSingle = true;
          out += ch;
          i += 1;
          continue;
        }

        if (ch === '"') {
          inDouble = true;
          out += ch;
          i += 1;
          continue;
        }

        if (ch === '`') {
          inTemplate = true;
          out += ch;
          i += 1;
          continue;
        }

        out += ch;
        i += 1;
      }

      return out;
    })();

    const tightened = stripped.replace(/\s*([+\-*/%&|^!<>=?:,;(){}\[\]])\s*/g, '$1');
    return tightened.replace(/\s+/g, ' ').trim();
  } catch {
    return expr;
  }
}
