import { ModeOption } from '../model/expression';
import { minimizeExpression } from './minimize-expression';
import { renderExpressionToSamples } from './audio-render';
import { Output, BufferTarget, Mp4OutputFormat, CanvasSource, AudioBufferSource } from 'mediabunny';
import { formatPostTitle, formatAuthorUsername } from './post-format';

export type Orientation = 'portrait' | 'landscape' | 'square';
export type Resolution = '480p' | '720p' | '1080p';

export interface VideoExportOptions {
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  duration: number;
  orientation: Orientation;
  resolution: Resolution;
  fadeOut: boolean;
  title: string;
  authorUsername: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  codeTextColor: string;
  codeBgColor: string;
  onProgress?: (status: string, progress: number) => void;
}

interface Dimensions {
  width: number;
  height: number;
}

const VIDEO_FPS = 30;
const AUDIO_SAMPLE_RATE = 48000;

// Declare WebCodecs types that may not be in TypeScript's lib
declare const VideoEncoder: any;
declare const VideoFrame: any;

function getVideoDimensions(orientation: Orientation, resolution: Resolution): Dimensions {
  const heights: Record<Resolution, number> = {
    '480p': 480,
    '720p': 720,
    '1080p': 1080,
  };

  const height = heights[resolution];

  switch (orientation) {
    case 'portrait':
      return { width: Math.round((height * 9) / 16), height };
    case 'square':
      return { width: height, height };
    case 'landscape':
    default:
      return { width: Math.round((height * 16) / 9), height };
  }
}

// Audio rendering is handled by renderExpressionToSamples in audio-render.ts

function resampleChannel(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return samples;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.floor(samples.length / ratio);
  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
    const frac = srcIndex - srcIndexFloor;
    resampled[i] = samples[srcIndexFloor] * (1 - frac) + samples[srcIndexCeil] * frac;
  }

  return resampled;
}

interface StereoResampled {
  left: Float32Array;
  right: Float32Array;
}

function resampleStereo(
  left: Float32Array,
  right: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): StereoResampled {
  return {
    left: resampleChannel(left, sourceSampleRate, targetSampleRate),
    right: resampleChannel(right, sourceSampleRate, targetSampleRate),
  };
}

// Draw text with word wrapping
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  maxLines?: number,
): number {
  const words = text.split(' ');
  let currentLine = '';
  let currentY = y;
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine.length > 0) {
      ctx.fillText(currentLine, x, currentY);
      currentLine = words[i];
      currentY += lineHeight;
      lineCount++;

      if (maxLines && lineCount >= maxLines) {
        // Add ellipsis if we've reached max lines
        ctx.fillText('...', x, currentY);
        return currentY;
      }
    } else {
      currentLine = testLine;
    }
  }

  // Draw remaining text
  if (currentLine) {
    ctx.fillText(currentLine, x, currentY);
    currentY += lineHeight;
  }

  return currentY;
}

// Draw code with word wrapping (no syntax highlighting)
function drawCode(
  ctx: CanvasRenderingContext2D,
  expression: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  fontSize: number,
  textColor: string,
  bgColor: string,
): void {
  const lineHeight = fontSize * 1.4;
  const padding = 12;

  // Draw code background
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, maxWidth, maxHeight);

  // Draw border
  ctx.strokeStyle = textColor + '30'; // 30% opacity
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, maxWidth, maxHeight);

  ctx.font = `${fontSize}px "Inconsolata", monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = textColor;

  // Word wrap the minified expression
  const words = expression.split('');
  let currentLine = '';
  let currentY = y + padding + fontSize;
  const maxTextWidth = maxWidth - padding * 2;

  for (const char of words) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxTextWidth && currentLine.length > 0) {
      ctx.fillText(currentLine, x + padding, currentY);
      currentLine = char;
      currentY += lineHeight;

      if (currentY > y + maxHeight - padding) {
        // Add ellipsis if we run out of space
        ctx.fillText('...', x + padding, currentY - lineHeight + fontSize * 0.3);
        return;
      }
    } else {
      currentLine = testLine;
    }
  }

  // Draw remaining text
  if (currentLine) {
    ctx.fillText(currentLine, x + padding, currentY);
  }
}

// Static frame options for pre-rendering
interface StaticFrameOptions {
  title: string;
  authorUsername: string;
  expression: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  codeBgColor: string;
  codeTextColor: string;
}

// Pre-rendered static frame data
interface StaticFrame {
  canvas: HTMLCanvasElement;
  waveformY: number;
  waveformHeight: number;
}

// Render static elements once (header, username, title, tags, code)
function renderStaticFrame(
  width: number,
  height: number,
  options: StaticFrameOptions,
): StaticFrame {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const padding = Math.floor(width * 0.04);
  const { accentColor, bgColor, textColor, codeTextColor, codeBgColor } = options;
  const secondaryTextColor = textColor + 'a0'; // 60% opacity

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // === HEADER: BytebeatCloud logo ===
  const headerFontSize = Math.max(14, Math.floor(height * 0.035));
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${headerFontSize}px "Inconsolata", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('BytebeatCloud', padding, padding + headerFontSize);

  // === MAIN CONTENT ===
  const contentY = padding + headerFontSize + padding;

  // @username
  const usernameFontSize = Math.max(12, Math.floor(height * 0.028));
  ctx.fillStyle = secondaryTextColor;
  ctx.font = `${usernameFontSize}px "Inconsolata", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(
    `@${formatAuthorUsername(options.authorUsername)}`,
    padding,
    contentY + usernameFontSize,
  );

  // Title (with wrapping)
  const titleFontSize = Math.max(16, Math.floor(height * 0.045));
  const titleLineHeight = titleFontSize * 1.3;
  ctx.fillStyle = textColor;
  ctx.font = `bold ${titleFontSize}px "Inconsolata", monospace`;
  const titleEndY = drawWrappedText(
    ctx,
    formatPostTitle(options.title),
    padding,
    contentY + usernameFontSize + titleFontSize + 8,
    width - padding * 2,
    titleFontSize,
    titleLineHeight,
    3, // Max 3 lines for title
  );

  // === CHIPS (tags) ===
  let chipsEndY = titleEndY + 8;

  // === CODE DISPLAY ===
  const waveformHeight = Math.floor(height * 0.18);
  const waveformY = height - waveformHeight;
  const codeY = chipsEndY + 8;
  const codeHeight = waveformY - codeY - padding;
  const codeFontSize = Math.max(11, Math.floor(height * 0.024));

  // Minify the expression
  const minifiedExpression = minimizeExpression(options.expression);

  if (codeHeight > 40) {
    drawCode(
      ctx,
      minifiedExpression,
      padding,
      codeY,
      width - padding * 2,
      codeHeight,
      codeFontSize,
      codeTextColor,
      codeBgColor, // Very subtle background
    );
  }

  return { canvas, waveformY, waveformHeight };
}

// Draw only the dynamic waveform part (called per frame)
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  staticFrame: StaticFrame,
  width: number,
  samples: Float32Array,
  currentTime: number,
  sampleRate: number,
  accentColor: string,
  bgColor: string,
): void {
  const { waveformY, waveformHeight } = staticFrame;

  // Copy static frame to main canvas
  ctx.drawImage(staticFrame.canvas, 0, 0);

  // Clear waveform area and redraw
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, waveformY, width, waveformHeight);

  // Calculate waveform window
  const windowDuration = 0.15; // 150ms window
  const windowSamples = Math.floor(sampleRate * windowDuration);
  const currentSample = Math.floor(currentTime * sampleRate);
  const startSample = Math.max(0, Math.floor(currentSample - windowSamples / 2));
  const endSample = Math.min(samples.length, startSample + windowSamples);

  // Draw waveform
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();

  const waveformWidth = width;
  const samplesInWindow = endSample - startSample;

  // Downsample for display: use min/max per pixel column to show waveform envelope
  const samplesPerPixel = samplesInWindow / waveformWidth;
  const waveformAmplitude = (waveformHeight / 2) * 0.85;

  for (let x = 0; x < waveformWidth; x++) {
    const bucketStart = startSample + Math.floor(x * samplesPerPixel);
    const bucketEnd = startSample + Math.floor((x + 1) * samplesPerPixel);

    // Find min and max in this bucket
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let j = bucketStart; j < bucketEnd && j < endSample; j++) {
      const s = samples[j] || 0;
      if (s < minVal) minVal = s;
      if (s > maxVal) maxVal = s;
    }

    if (minVal === Infinity) {
      minVal = 0;
      maxVal = 0;
    }

    // Draw vertical line from min to max for this pixel column
    const yMin = waveformY + waveformHeight / 2 - minVal * waveformAmplitude;
    const yMax = waveformY + waveformHeight / 2 - maxVal * waveformAmplitude;

    if (x === 0) {
      ctx.moveTo(x, (yMin + yMax) / 2);
    }
    // Draw to the midpoint, then we'll fill in the vertical extent
    ctx.lineTo(x, (yMin + yMax) / 2);
  }

  ctx.stroke();

  // Draw filled waveform envelope for better visibility
  ctx.fillStyle = accentColor + '40';
  ctx.beginPath();

  // Top edge (max values)
  for (let x = 0; x < waveformWidth; x++) {
    const bucketStart = startSample + Math.floor(x * samplesPerPixel);
    const bucketEnd = startSample + Math.floor((x + 1) * samplesPerPixel);

    let maxVal = -Infinity;
    for (let j = bucketStart; j < bucketEnd && j < endSample; j++) {
      const s = samples[j] || 0;
      if (s > maxVal) maxVal = s;
    }
    if (maxVal === -Infinity) maxVal = 0;

    const yMax = waveformY + waveformHeight / 2 - maxVal * waveformAmplitude;
    if (x === 0) {
      ctx.moveTo(x, yMax);
    } else {
      ctx.lineTo(x, yMax);
    }
  }

  // Bottom edge (min values) - go backwards
  for (let x = waveformWidth - 1; x >= 0; x--) {
    const bucketStart = startSample + Math.floor(x * samplesPerPixel);
    const bucketEnd = startSample + Math.floor((x + 1) * samplesPerPixel);

    let minVal = Infinity;
    for (let j = bucketStart; j < bucketEnd && j < endSample; j++) {
      const s = samples[j] || 0;
      if (s < minVal) minVal = s;
    }
    if (minVal === Infinity) minVal = 0;

    const yMin = waveformY + waveformHeight / 2 - minVal * waveformAmplitude;
    ctx.lineTo(x, yMin);
  }

  ctx.closePath();
  ctx.fill();
}

// Create a stereo AudioBuffer from Float32Array samples
function createStereoAudioBuffer(
  audioContext: AudioContext,
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): AudioBuffer {
  const audioBuffer = audioContext.createBuffer(2, left.length, sampleRate);
  audioBuffer.getChannelData(0).set(left);
  audioBuffer.getChannelData(1).set(right);
  return audioBuffer;
}

// Check if WebCodecs is available for faster encoding
export function hasWebCodecs(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

// Fast export using WebCodecs + mediabunny (MP4 with audio)
async function exportVideoWithMediabunny(options: VideoExportOptions): Promise<Blob> {
  const {
    expression,
    mode,
    sampleRate,
    duration,
    orientation,
    resolution,
    fadeOut,
    title,
    authorUsername,
    accentColor,
    bgColor,
    textColor,
    codeBgColor,
    codeTextColor,
    onProgress,
  } = options;

  const report = (status: string, progress: number) => {
    onProgress?.(status, progress);
  };

  report('Initializing...', 0);

  const { width, height } = getVideoDimensions(orientation, resolution);
  const totalFrames = Math.floor(duration * VIDEO_FPS);

  // Generate audio samples at bytebeat sample rate
  report('Generating audio...', 5);
  const { left: bytebeatLeft, right: bytebeatRight } = renderExpressionToSamples({
    expression,
    mode,
    sampleRate,
    duration,
    fadeInSeconds: 0,
    fadeOutSeconds: fadeOut ? 2 : 0,
  });

  // Resample to standard audio sample rate for encoding
  report('Resampling audio...', 8);
  const { left: audioLeft, right: audioRight } = resampleStereo(
    bytebeatLeft,
    bytebeatRight,
    sampleRate,
    AUDIO_SAMPLE_RATE,
  );

  // Create canvas for video frames
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  report('Setting up encoder...', 10);

  // Create mediabunny output
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  // Add video track from canvas
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: 2_500_000,
  });
  output.addVideoTrack(videoSource);

  // Add audio track
  const audioSource = new AudioBufferSource({
    codec: 'aac',
    bitrate: 128_000,
  });
  output.addAudioTrack(audioSource);

  // Set metadata
  output.setMetadataTags({
    title: title || 'Bytebeat',
    artist: authorUsername || 'BytebeatCloud',
  });

  await output.start();

  // Create AudioBuffer for audio source (stereo)
  const offlineCtx = new OfflineAudioContext(2, audioLeft.length, AUDIO_SAMPLE_RATE);
  const audioBuffer = offlineCtx.createBuffer(2, audioLeft.length, AUDIO_SAMPLE_RATE);
  audioBuffer.getChannelData(0).set(audioLeft);
  audioBuffer.getChannelData(1).set(audioRight);

  // Add audio data
  report('Adding audio...', 12);
  await audioSource.add(audioBuffer);

  // Pre-render static frame (header, title, code, etc.) once
  report('Rendering static elements...', 14);

  const staticFrame = renderStaticFrame(width, height, {
    title,
    authorUsername,
    expression,
    accentColor,
    bgColor,
    textColor,
    codeBgColor,
    codeTextColor,
  });

  // Encode video frames
  report('Encoding video frames...', 15);

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const currentTime = frameIndex / VIDEO_FPS;
    const frameDuration = 1 / VIDEO_FPS;

    // Draw frame (only waveform changes per frame, use left channel for visualization)
    drawWaveform(
      ctx,
      staticFrame,
      width,
      bytebeatLeft,
      currentTime,
      sampleRate,
      accentColor,
      bgColor,
    );

    // Add frame to video source
    await videoSource.add(currentTime, frameDuration);

    // Report progress
    const progress = 15 + (frameIndex / totalFrames) * 80;
    if (frameIndex % 30 === 0) {
      report(`Encoding: ${Math.round((frameIndex / totalFrames) * 100)}%`, progress);
    }

    // Yield to UI periodically
    if (frameIndex % 10 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  report('Finalizing...', 95);
  await output.finalize();

  report('Complete!', 100);

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) {
    throw new Error('Failed to create video buffer');
  }
  return new Blob([buffer], { type: 'video/mp4' });
}

export async function exportVideo(options: VideoExportOptions): Promise<Blob> {
  if (hasWebCodecs()) {
    return exportVideoWithMediabunny(options);
  }

  return exportVideoWithMediaRecorder(options);
}

async function exportVideoWithMediaRecorder(options: VideoExportOptions): Promise<Blob> {
  const {
    expression,
    mode,
    sampleRate,
    duration,
    orientation,
    resolution,
    fadeOut,
    title,
    authorUsername,
    accentColor,
    bgColor,
    textColor,
    codeTextColor,
    codeBgColor,
    onProgress,
  } = options;

  const report = (status: string, progress: number) => {
    onProgress?.(status, progress);
  };

  report('Initializing (real-time mode)...', 0);

  const { width, height } = getVideoDimensions(orientation, resolution);
  const totalFrames = Math.floor(duration * VIDEO_FPS);

  // Generate audio samples at bytebeat sample rate
  report('Generating audio...', 5);
  const { left: bytebeatLeft, right: bytebeatRight } = renderExpressionToSamples({
    expression,
    mode,
    sampleRate,
    duration,
    fadeInSeconds: 0,
    fadeOutSeconds: fadeOut ? 2 : 0,
  });

  // Resample to standard audio sample rate
  report('Resampling audio...', 10);
  const { left: audioLeft, right: audioRight } = resampleStereo(
    bytebeatLeft,
    bytebeatRight,
    sampleRate,
    AUDIO_SAMPLE_RATE,
  );

  // Create canvas for video frames
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Create audio context and buffer (stereo)
  report('Preparing audio...', 15);
  const audioContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
  const audioBuffer = createStereoAudioBuffer(
    audioContext,
    audioLeft,
    audioRight,
    AUDIO_SAMPLE_RATE,
  );

  // Create a MediaStreamDestination for audio
  const audioDestination = audioContext.createMediaStreamDestination();
  const audioSource = audioContext.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioDestination);

  // Create a canvas stream for video
  const videoStream = canvas.captureStream(VIDEO_FPS);

  // Combine audio and video streams
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);

  // Setup MediaRecorder
  report('Setting up recorder...', 20);

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: Blob[] = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  // Start recording
  const recordingComplete = new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
    mediaRecorder.onerror = () => {
      reject(new Error('Recording failed'));
    };
  });

  // Pre-render static frame once
  report('Rendering static elements...', 22);

  const staticFrame = renderStaticFrame(width, height, {
    title,
    authorUsername,
    expression,
    accentColor,
    bgColor,
    textColor,
    codeTextColor,
    codeBgColor,
  });

  mediaRecorder.start(100); // Collect data every 100ms
  audioSource.start(0);

  // Render frames
  report('Encoding video frames...', 25);

  const frameInterval = 1000 / VIDEO_FPS;
  let frameIndex = 0;

  const renderFrame = (): Promise<void> => {
    return new Promise((resolve) => {
      const render = () => {
        if (frameIndex >= totalFrames) {
          resolve();
          return;
        }

        const currentTime = frameIndex / VIDEO_FPS;

        // Draw frame (only waveform changes per frame, use left channel for visualization)
        drawWaveform(
          ctx,
          staticFrame,
          width,
          bytebeatLeft,
          currentTime,
          sampleRate,
          accentColor,
          bgColor,
        );

        frameIndex++;

        // Report progress
        const progress = 25 + (frameIndex / totalFrames) * 70;
        if (frameIndex % 30 === 0) {
          report(`Encoding: ${Math.round((frameIndex / totalFrames) * 100)}%`, progress);
        }

        // Schedule next frame
        if (frameIndex < totalFrames) {
          setTimeout(render, frameInterval);
        } else {
          resolve();
        }
      };

      render();
    });
  };

  await renderFrame();

  // Stop recording
  report('Finalizing...', 95);
  audioSource.stop();
  mediaRecorder.stop();

  const blob = await recordingComplete;

  // Cleanup
  await audioContext.close();

  report('Complete!', 100);

  return blob;
}

export function downloadVideo(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function isWebCodecsSupported(): boolean {
  // Check for MediaRecorder support with video/webm
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm');
}

export interface PreviewFrameOptions {
  expression: string;
  title: string;
  authorUsername: string;
  orientation: Orientation;
  resolution: Resolution;
  accentColor: string;
  bgColor: string;
  textColor: string;
  codeBgColor: string;
  codeTextColor: string;
}

export function renderPreviewFrame(options: PreviewFrameOptions): HTMLCanvasElement {
  const { width, height } = getVideoDimensions(options.orientation, options.resolution);
  const staticFrame = renderStaticFrame(width, height, {
    title: options.title,
    authorUsername: options.authorUsername,
    expression: options.expression,
    accentColor: options.accentColor,
    bgColor: options.bgColor,
    textColor: options.textColor,
    codeTextColor: options.codeTextColor,
    codeBgColor: options.codeBgColor,
  });

  // Draw a flat waveform line in the waveform area to show where it will be
  const ctx = staticFrame.canvas.getContext('2d')!;
  const { waveformY, waveformHeight } = staticFrame;
  const accentColor = options.accentColor || '#7b34ff';

  ctx.strokeStyle = accentColor + '60';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, waveformY + waveformHeight / 2);
  ctx.lineTo(width, waveformY + waveformHeight / 2);
  ctx.stroke();

  return staticFrame.canvas;
}
