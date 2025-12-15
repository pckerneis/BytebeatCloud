import { ModeOption } from '../model/expression';

const mathParams = Object.getOwnPropertyNames(Math);
const mathValues = mathParams.map((k) => Math[k as keyof Math]);

export function createExpressionFunction(expression: string, sr: number): (t: number) => number {
  const params = [...mathParams, 'int', 'window', 'SR', 't'];
  const values = [...mathValues, Math.floor, globalThis, sr];
  return new Function(...params, `return 0,\n${expression || 0};`).bind(globalThis, ...values) as (t: number) => number;
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

  const fn = createExpressionFunction(expression, sampleRate);
  const totalSamples = Math.floor(sampleRate * duration);
  const fadeInSamples = Math.floor(sampleRate * fadeInSeconds);
  const fadeOutSamples = Math.floor(sampleRate * fadeOutSeconds);

  const samples = new Float32Array(totalSamples);

  if (mode === ModeOption.Float) {
    for (let i = 0; i < totalSamples; i++) {
      const v = Number(fn(i)) || 0;
      samples[i] = Math.max(-1, Math.min(1, v));
    }
  } else {
    for (let i = 0; i < totalSamples; i++) {
      const raw = fn(i) | 0;
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
