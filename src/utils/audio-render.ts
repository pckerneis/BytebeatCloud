import { ModeOption } from '../model/expression';

const expressionApi = `
const E = Math.E;
const LN10 = Math.LN10;
const LN2 = Math.LN2;
const LOG2E = Math.LOG2E;
const PI = Math.PI;
const SQRT1_2 = Math.SQRT1_2;
const SQRT2 = Math.SQRT2;
const TAU = Math.PI * 2;
const abs = Math.abs;
const acos = Math.acos;
const acosh = Math.acosh;
const asin = Math.asin;
const asinh = Math.asinh;
const atan = Math.atan;
const atanh = Math.atanh;
const cbrt = Math.cbrt;
const ceil = Math.ceil;
const clz32 = Math.clz32;
const cos = Math.cos;
const cosh = Math.cosh;
const exp = Math.exp;
const expm1 = Math.expm1;
const floor = Math.floor;
const fround = Math.fround;
const hypot = Math.hypot;
const imul = Math.imul;
const log = Math.log;
const log10 = Math.log10;
const log1p = Math.log1p;
const log2 = Math.log2;
const max = Math.max;
const min = Math.min;
const pow = Math.pow;
const random = Math.random;
const round = Math.round;
const sign = Math.sign;
const sin = Math.sin;
const sinh = Math.sinh;
const sqrt = Math.sqrt;
const tan = Math.tan;
const tanh = Math.tanh;
const trunc = Math.trunc;
const SR = sr;
`;

export function createExpressionFunction(expression: string): (t: number, sr: number) => number {
  const fnBody = `
${expressionApi}
return Number((${expression})) || 0;
`;
  return new Function('t', 'sr', fnBody) as (t: number, sr: number) => number;
}

export interface RenderAudioOptions {
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  duration: number; // seconds
  fadeInSeconds?: number; // seconds
  fadeOutSeconds?: number; // seconds
}

export function renderExpressionToSamples(options: RenderAudioOptions): Float32Array {
  const { expression, mode, sampleRate, duration, fadeInSeconds = 0, fadeOutSeconds = 0 } = options;

  const fn = createExpressionFunction(expression);
  const totalSamples = Math.floor(sampleRate * duration);
  const fadeInSamples = Math.floor(sampleRate * fadeInSeconds);
  const fadeOutSamples = Math.floor(sampleRate * fadeOutSeconds);

  const samples = new Float32Array(totalSamples);

  if (mode === ModeOption.Float) {
    for (let i = 0; i < totalSamples; i++) {
      const v = fn(i, sampleRate);
      samples[i] = Math.max(-1, Math.min(1, v));
    }
  } else {
    for (let i = 0; i < totalSamples; i++) {
      const raw = fn(i, sampleRate) | 0;
      const byteValue = mode === ModeOption.Uint8 ? raw & 0xff : (raw + 128) & 0xff;
      samples[i] = (byteValue - 128) / 128;
    }
  }

  // Apply fades
  if (fadeInSamples > 0 || fadeOutSamples > 0) {
    const fadeOutStart = totalSamples - fadeOutSamples;
    for (let i = 0; i < totalSamples; i++) {
      let gain = 1;

      // Fade in
      if (fadeInSamples > 0 && i < fadeInSamples) {
        gain = i / fadeInSamples;
      }

      // Fade out
      if (fadeOutSamples > 0 && i >= fadeOutStart) {
        gain = (totalSamples - i) / fadeOutSamples;
      }

      samples[i] *= gain;
    }
  }

  return samples;
}
