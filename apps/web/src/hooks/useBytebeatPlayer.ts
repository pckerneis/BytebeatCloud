import { useCallback, useMemo, useRef, useState } from 'react';
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

export function useBytebeatPlayer(): BytebeatPlayer {
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);

  const ensureContextAndNode = useCallback(async () => {
    if (typeof window === 'undefined') return null;

    if (!audioContextRef.current) {
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(new URL('../bytebeat-worklet.js', import.meta.url));
      audioContextRef.current = ctx;
    }

    if (!nodeRef.current && audioContextRef.current) {
      const node = new AudioWorkletNode(audioContextRef.current, 'bytebeat-processor');
      node.port.onmessage = (event) => {
        const { type, message } = event.data || {};
        if (type === 'compileError' || type === 'runtimeError') {
          setLastError(String(message || 'Unknown error'));
        }
      };
      node.connect(audioContextRef.current.destination);
      nodeRef.current = node;
    }

    return { ctx: audioContextRef.current!, node: nodeRef.current! };
  }, []);

  const toggle = useCallback(
    async (expression: string, mode: ModeOption, sampleRate: number, aliased: boolean) => {
      if (!expression.trim()) return;

      const res = await ensureContextAndNode();
      if (!res) return;

      const { ctx, node } = res;

      const isContextRunning = ctx.state === 'running';

      if (!isContextRunning) {
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
        setIsPlaying(true);
      } else {
        if (ctx.state === 'running') {
          await ctx.suspend();
        }
        setIsPlaying(false);
      }
    },
    [ensureContextAndNode],
  );

  const stop = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === 'running') {
      await ctx.suspend();
    }
    setIsPlaying(false);
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
