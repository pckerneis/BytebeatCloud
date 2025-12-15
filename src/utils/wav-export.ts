import { ModeOption } from '../model/expression';
import { renderExpressionToSamples } from './audio-render';

interface ExportOptions {
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  duration: number; // seconds
  fadeIn: number; // seconds
  fadeOut: number; // seconds
}

export function renderToWav(options: ExportOptions): ArrayBuffer {
  const { expression, mode, sampleRate, duration, fadeIn, fadeOut } = options;
  const { left, right } = renderExpressionToSamples({
    expression,
    mode,
    sampleRate,
    duration,
    fadeInSeconds: fadeIn,
    fadeOutSeconds: fadeOut,
  });

  // Convert to 16-bit PCM stereo WAV
  const bytesPerSample = 2;
  const numChannels = 2;
  const totalSamples = left.length;
  const dataSize = totalSamples * bytesPerSample * numChannels;
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

  // Write samples as interleaved 16-bit PCM stereo (L, R, L, R, ...)
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const sL = Math.max(-1, Math.min(1, left[i]));
    const sR = Math.max(-1, Math.min(1, right[i]));
    const valL = sL < 0 ? sL * 0x8000 : sL * 0x7fff;
    const valR = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
    view.setInt16(offset, valL, true);
    view.setInt16(offset + 2, valR, true);
    offset += 4;
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
