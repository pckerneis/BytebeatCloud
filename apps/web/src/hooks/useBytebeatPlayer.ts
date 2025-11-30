import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeOption } from 'shared';

interface BytebeatPlayer {
  isPlaying: boolean;
  lastError: string | null;
  toggle: (
    expression: string,
    mode: ModeOption,
    sampleRate: number,
    aliased: boolean,
  ) => Promise<void>;
  stop: () => Promise<void>;
}

// Module-level singletons so the audio engine is shared across the whole app.
let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let workletConnected = false;

// Global playback state so multiple hook instances stay in sync.
let globalIsPlaying = false;
const isPlayingListeners = new Set<(value: boolean) => void>();

function setGlobalIsPlaying(value: boolean) {
  globalIsPlaying = value;
  isPlayingListeners.forEach((listener) => listener(value));
}

// Internal helper to lazily create the AudioContext and worklet node.
async function ensureContextAndNodeBase() {
  if (typeof window === 'undefined') return null;

  if (!audioContext) {
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule('/bytebeat-worklet.js');
    audioContext = ctx;
  }

  if (!workletNode && audioContext) {
    const node = new AudioWorkletNode(audioContext, 'bytebeat-processor');
    // Do NOT connect to destination here; this is used by warm-up as well.
    // We will connect the node only when starting actual playback to avoid
    // any audible clicks during initialization.
    workletNode = node;
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

  useEffect(() => {
    const listener = (value: boolean) => {
      setIsPlaying(value);
    };
    isPlayingListeners.add(listener);
    return () => {
      isPlayingListeners.delete(listener);
    };
  }, []);

  const ensureContextAndNode = useCallback(async () => {
    const res = await ensureContextAndNodeBase();
    if (!res) return null;

    const { node } = res;
    // Attach error forwarding once per hook usage.
    node.port.onmessage = (event) => {
      const { type, message } = event.data || {};
      if (type === 'compileError' || type === 'runtimeError') {
        setLastError(String(message || 'Unknown error'));
      }
    };

    return res;
  }, []);

  const toggle = useCallback(
    async (expression: string, mode: ModeOption, sampleRate: number, aliased: boolean) => {
      if (!expression.trim()) return;

      const res = await ensureContextAndNode();
      if (!res) return;

      const { ctx, node } = res;

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
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
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
          classic: aliased,
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
    }),
    [isPlaying, lastError, toggle, stop],
  );
}
