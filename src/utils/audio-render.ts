import { ModeOption } from '../model/expression';

const mathParams = Object.getOwnPropertyNames(Math);
const mathValues = mathParams.map((k) => Math[k as keyof Math]);

export function createExpressionFunction(expression: string, sr: number): (t: number) => number | [number, number] {
  const params = [...mathParams, 'int', 'window', 'SR', 't'];
  const values = [...mathValues, Math.floor, globalThis, sr];
  return new Function(...params, `return 0,\n${expression || 0};`).bind(globalThis, ...values) as (t: number) => number | [number, number];
}

export interface RenderAudioOptions {
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  duration: number; // seconds
  fadeInSeconds?: number; // seconds
  fadeOutSeconds?: number; // seconds
}

export interface StereoSamples {
  left: Float32Array;
  right: Float32Array;
}

export function renderExpressionToSamples(options: RenderAudioOptions): StereoSamples {
  const { expression, mode, sampleRate, duration, fadeInSeconds = 0, fadeOutSeconds = 0 } = options;

  const fn = createExpressionFunction(expression, sampleRate);
  const totalSamples = Math.floor(sampleRate * duration);
  const fadeInSamples = Math.floor(sampleRate * fadeInSeconds);
  const fadeOutSamples = Math.floor(sampleRate * fadeOutSeconds);

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  if (mode === ModeOption.Float) {
    for (let i = 0; i < totalSamples; i++) {
      const result = fn(i);
      if (Array.isArray(result)) {
        left[i] = Math.max(-1, Math.min(1, Number(result[0]) || 0));
        right[i] = Math.max(-1, Math.min(1, Number(result[1]) || 0));
      } else {
        const v = Math.max(-1, Math.min(1, Number(result) || 0));
        left[i] = v;
        right[i] = v;
      }
    }
  } else {
    for (let i = 0; i < totalSamples; i++) {
      const result = fn(i);
      let rawL: number;
      let rawR: number;
      if (Array.isArray(result)) {
        rawL = result[0] | 0;
        rawR = result[1] | 0;
      } else {
        rawL = result | 0;
        rawR = rawL;
      }
      const byteL = mode === ModeOption.Uint8 ? rawL & 0xff : (rawL + 128) & 0xff;
      const byteR = mode === ModeOption.Uint8 ? rawR & 0xff : (rawR + 128) & 0xff;
      left[i] = (byteL - 128) / 128;
      right[i] = (byteR - 128) / 128;
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

      left[i] *= gain;
      right[i] *= gain;
    }
  }

  return { left, right };
}
