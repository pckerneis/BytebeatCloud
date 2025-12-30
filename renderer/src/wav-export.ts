import { ModeOption } from '@shared/model/expression';
import { renderExpressionToSamples } from '@shared/utils/audio-render';

interface ExportOptions {
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  duration: number;
  fadeIn: number;
  fadeOut: number;
}

export function renderToWav(options: ExportOptions): Buffer {
  const { expression, mode, sampleRate, duration, fadeIn, fadeOut } = options;
  const { left, right } = renderExpressionToSamples({
    expression,
    mode,
    sampleRate,
    duration,
    fadeInSeconds: fadeIn,
    fadeOutSeconds: fadeOut,
  });

  const bytesPerSample = 2;
  const numChannels = 2;
  const totalSamples = left.length;
  const dataSize = totalSamples * bytesPerSample * numChannels;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      buffer.writeUInt8(str.charCodeAt(i), offset + i);
    }
  };

  writeString(0, 'RIFF');
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  writeString(36, 'data');
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const sL = Math.max(-1, Math.min(1, left[i]));
    const sR = Math.max(-1, Math.min(1, right[i]));
    const valL = sL < 0 ? sL * 0x8000 : sL * 0x7fff;
    const valR = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
    buffer.writeInt16LE(valL, offset);
    buffer.writeInt16LE(valR, offset + 2);
    offset += 4;
  }

  return buffer;
}
