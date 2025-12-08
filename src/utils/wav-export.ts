import { ModeOption } from '../model/expression';

// Expression API constants (same as bytebeat-worklet.js)
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

interface ExportOptions {
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  duration: number; // seconds
  fadeIn: number; // seconds
  fadeOut: number; // seconds
}

function createExpressionFunction(expression: string): (t: number, sr: number) => number {
  const fnBody = `
${expressionApi}
return Number((${expression})) || 0;
`;
  return new Function('t', 'sr', fnBody) as (t: number, sr: number) => number;
}

function applyFade(
  sample: number,
  sampleIndex: number,
  totalSamples: number,
  fadeInSamples: number,
  fadeOutSamples: number,
): number {
  let gain = 1;

  // Fade in
  if (sampleIndex < fadeInSamples) {
    gain = sampleIndex / fadeInSamples;
  }

  // Fade out
  const fadeOutStart = totalSamples - fadeOutSamples;
  if (sampleIndex >= fadeOutStart) {
    gain = (totalSamples - sampleIndex) / fadeOutSamples;
  }

  return sample * gain;
}

export function renderToWav(options: ExportOptions): ArrayBuffer {
  const { expression, mode, sampleRate, duration, fadeIn, fadeOut } = options;

  const fn = createExpressionFunction(expression);
  const totalSamples = Math.floor(sampleRate * duration);
  const fadeInSamples = Math.floor(sampleRate * fadeIn);
  const fadeOutSamples = Math.floor(sampleRate * fadeOut);

  // Render samples as float32 first
  const samples = new Float32Array(totalSamples);

  if (mode === ModeOption.Float) {
    for (let i = 0; i < totalSamples; i++) {
      const tSeconds = i / sampleRate;
      const v = fn(tSeconds, sampleRate);
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
  for (let i = 0; i < totalSamples; i++) {
    samples[i] = applyFade(samples[i], i, totalSamples, fadeInSamples, fadeOutSamples);
  }

  // Convert to 16-bit PCM WAV
  const bytesPerSample = 2;
  const numChannels = 1;
  const dataSize = totalSamples * bytesPerSample;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write samples as 16-bit PCM
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return buffer;
}

export function downloadWav(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
