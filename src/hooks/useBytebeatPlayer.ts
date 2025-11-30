import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeOption } from '../model/expression';

interface BytebeatPlayer {
  isPlaying: boolean;
  lastError: string | null;
  toggle: (expression: string, mode: ModeOption, sampleRate: number) => Promise<void>;
  stop: () => Promise<void>;
  level: number;
  waveform: Float32Array | null;
}

// Module-level singletons so the audio engine is shared across the whole app.
let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let workletConnected = false;
let analyserNode: AnalyserNode | null = null;
let analyserData: Float32Array | null = null;
let analyserTimerId: number | null = null;

const ANALYSER_INTERVAL = 80;

// Global playback state so multiple hook instances stay in sync.
let globalIsPlaying = false;
const isPlayingListeners = new Set<(value: boolean) => void>();

function setGlobalIsPlaying(value: boolean) {
  globalIsPlaying = value;
  isPlayingListeners.forEach((listener) => listener(value));
}

// Global RMS level for visualizers.
let globalLevel = 0;
const levelListeners = new Set<(value: number) => void>();

function setGlobalLevel(value: number) {
  globalLevel = value;
  levelListeners.forEach((listener) => listener(value));
}

let globalWaveform: Float32Array | null = null;
const waveformListeners = new Set<(value: Float32Array | null) => void>();

function setGlobalWaveform(value: Float32Array | null) {
  globalWaveform = value;
  waveformListeners.forEach((listener) => listener(value));
}

async function ensureContextAndNodeBase() {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    const ctx = new AudioContext();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH
      ? `/${process.env.NEXT_PUBLIC_BASE_PATH}`
      : '';
    await ctx.audioWorklet.addModule(`${basePath}/bytebeat-worklet.js`);
    audioContext = ctx;
  }

  if (!workletNode && audioContext) {
    workletNode = new AudioWorkletNode(audioContext, 'bytebeat-processor');
  }

  if (!analyserNode && audioContext && workletNode) {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserNode = analyser;
    analyserData = new Float32Array(analyser.fftSize);
    workletNode.connect(analyserNode);

    const updateWaveform = () => {
      if (!analyserNode || !analyserData) {
        setGlobalWaveform(null);
      } else {
        analyserNode.getFloatTimeDomainData(analyserData as any);
        setGlobalWaveform(new Float32Array(analyserData));
      }
      analyserTimerId = window.setTimeout(updateWaveform, ANALYSER_INTERVAL);
    };

    if (analyserTimerId == null) {
      analyserTimerId = window.setTimeout(updateWaveform, ANALYSER_INTERVAL);
    }
  }

  return { ctx: audioContext!, node: workletNode! };
}

// Public warm-up function: can be called on first user gesture to hide
// the cost of creating the AudioContext and loading the worklet.
export async function warmUpBytebeatEngine(): Promise<void> {
  await ensureContextAndNodeBase();
}

export function useBytebeatPlayer(): BytebeatPlayer {
  const [isPlaying, setIsPlaying] = useState(globalIsPlaying);
  const [lastError, setLastError] = useState<string | null>(null);
  const [level, setLevel] = useState(globalLevel);
  const [waveform, setWaveform] = useState<Float32Array | null>(globalWaveform);

  useEffect(() => {
    const listener = (value: boolean) => {
      setIsPlaying(value);
    };
    isPlayingListeners.add(listener);
    return () => {
      isPlayingListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const listener = (value: number) => {
      setLevel(value);
    };
    levelListeners.add(listener);
    return () => {
      levelListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const listener = (value: Float32Array | null) => {
      setWaveform(value);
    };
    waveformListeners.add(listener);
    return () => {
      waveformListeners.delete(listener);
    };
  }, []);

  const ensureContextAndNode = useCallback(async () => {
    const res = await ensureContextAndNodeBase();
    if (!res) return null;

    const { node } = res;
    // Attach error forwarding and level updates once per hook usage.
    node.port.onmessage = (event) => {
      const { type, message, rms } = event.data || {};
      if (type === 'compileError' || type === 'runtimeError') {
        setLastError(String(message || 'Unknown error'));
      } else if (type === 'level') {
        const v = typeof rms === 'number' && Number.isFinite(rms) ? rms : 0;
        setGlobalLevel(v);
      }
    };

    return res;
  }, []);

  const toggle = useCallback(
    async (expression: string, mode: ModeOption, sampleRate: number) => {
      if (!expression.trim()) return;

      const res = await ensureContextAndNode();
      if (!res) return;

      const { node } = res;
      const ctx = (node.context as AudioContext) ?? audioContext!;

      const isContextRunning = ctx.state === 'running';

      if (!isContextRunning) {
        if (!workletConnected) {
          node.connect(ctx.destination);
          workletConnected = true;
        }
        // Pre-validate expression by attempting to construct a Function on the main thread.
        // This prevents starting playback when there is a compile error.
        try {
          // eslint-disable-next-line no-new-func
          // We only care that this compiles; the worklet does the actual evaluation.
          void new Function('t', String(expression));
        } catch (e) {
          setLastError(String((e as Error).message || e));
          return;
        }

        setLastError(null);
        const isFloatMode = mode === 'float';
        const sr = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 8000;
        node.port.postMessage({
          type: 'setExpression',
          expression,
          sampleRate: sr,
          float: isFloatMode,
        });
        node.port.postMessage({ type: 'reset' });
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        setGlobalIsPlaying(true);
      } else {
        if (ctx.state === 'running') {
          await ctx.suspend();
        }
        setGlobalIsPlaying(false);
      }
    },
    [ensureContextAndNode],
  );

  const stop = useCallback(async () => {
    const ctx = audioContext;
    if (ctx && ctx.state === 'running') {
      await ctx.suspend();
    }
    setGlobalIsPlaying(false);
  }, []);

  return useMemo(
    () => ({
      isPlaying,
      lastError,
      toggle,
      stop,
      level,
      waveform,
    }),
    [isPlaying, lastError, toggle, stop, level, waveform],
  );
}
