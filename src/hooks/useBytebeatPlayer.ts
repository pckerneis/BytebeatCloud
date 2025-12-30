import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeOption } from '../model/expression';
import { loadPrerenderedAudio } from '../utils/prerender-loader';

interface BytebeatPlayer {
  isPlaying: boolean;
  lastError: string | null;
  toggle: (expression: string, mode: ModeOption, sampleRate: number, prerenderedUrl?: string, updatedAt?: string) => Promise<void>;
  stop: () => Promise<void>;
  level: number;
  waveform: Float32Array | null;
  updateExpression: (expression: string, mode: ModeOption, sampleRate: number) => Promise<void>;
  masterGain: number;
  setMasterGain: (value: number) => void;
  fadeGain: number;
  setFadeGain: (value: number) => void;
}

// Module-level singletons so the audio engine is shared across the whole app.
let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let workletConnected = false;
let globalGainNode: GainNode | null = null;
let fadeGainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let analyserData: Float32Array | null = null;
let analyserTimerId: number | null = null;
let analyserTapGain: GainNode | null = null;

// Pre-rendered audio playback
let prerenderedSource: AudioBufferSourceNode | null = null;
let prerenderedStartTime: number = 0;
let prerenderedLeftChannel: Float32Array | null = null;
let prerenderedRightChannel: Float32Array | null = null;

const ANALYSER_INTERVAL = 80;

// Global playback state so multiple hook instances stay in sync.
let globalIsPlaying = false;
const isPlayingListeners = new Set<(value: boolean) => void>();

// Guard to prevent overlapping toggle calls that can desynchronize
// the audio context state from the global playing flag.
let toggleInProgress = false;

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

let globalMasterGain = 1;
const masterGainListeners = new Set<(value: number) => void>();

function setGlobalMasterGain(value: number) {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  globalMasterGain = clamped;
  if (globalGainNode) {
    globalGainNode.gain.value = clamped;
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('bytebeat-master-gain', String(clamped));
    } catch {
      // Ignore storage errors.
    }
  }
  masterGainListeners.forEach((listener) => listener(clamped));
}

let globalFadeGain = 1;
const fadeGainListeners = new Set<(value: number) => void>();

function setGlobalFadeGain(value: number) {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  globalFadeGain = clamped;
  if (fadeGainNode) {
    fadeGainNode.gain.value = clamped;
  }
  fadeGainListeners.forEach((listener) => listener(clamped));
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
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? new Date().getTime().toString();
    await ctx.audioWorklet.addModule(`${basePath}/bytebeat-worklet.js?v=${version}`);
    audioContext = ctx;
  }

  if (!workletNode && audioContext) {
    workletNode = new AudioWorkletNode(audioContext, 'bytebeat-processor', {
      outputChannelCount: [2],
    });
  }

  if (!globalGainNode && audioContext) {
    const gain = audioContext.createGain();
    gain.gain.value = globalMasterGain;
    globalGainNode = gain;
  }

  if (!fadeGainNode && audioContext) {
    const fg = audioContext.createGain();
    fg.gain.value = globalFadeGain;
    fadeGainNode = fg;
  }

  if (!analyserNode && audioContext && workletNode) {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    analyserNode = analyser;
    analyserData = new Float32Array(analyser.fftSize);
    workletNode.connect(analyserNode);

    if (!analyserTapGain) {
      const tap = audioContext.createGain();
      tap.gain.value = 0;
      analyserTapGain = tap;
      analyserNode.connect(analyserTapGain);
      analyserTapGain.connect(audioContext.destination);
    }

    const updateWaveform = () => {
      if (!analyserNode || !analyserData || !globalIsPlaying) {
        // When not playing, propagate a single null once; repeated
        // calls with null will be ignored by React state since the
        // value is stable, avoiding unnecessary re-renders.
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

export function useBytebeatPlayer(options?: { enableVisualizer?: boolean }): BytebeatPlayer {
  const enableVisualizer = options?.enableVisualizer ?? true;
  const [isPlaying, setIsPlaying] = useState(globalIsPlaying);
  const [lastError, setLastError] = useState<string | null>(null);
  const [level, setLevel] = useState(globalLevel);
  const [waveform, setWaveform] = useState<Float32Array | null>(globalWaveform);
  const [masterGain, setMasterGainState] = useState(globalMasterGain);
  const [fadeGain, setFadeGainState] = useState(globalFadeGain);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = window.localStorage.getItem('bytebeat-master-gain');
      if (stored == null) return;

      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        setGlobalMasterGain(parsed);
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

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
    if (!enableVisualizer) {
      return;
    }
    const listener = (value: number) => {
      setLevel(value);
    };
    levelListeners.add(listener);
    return () => {
      levelListeners.delete(listener);
    };
  }, [enableVisualizer]);

  useEffect(() => {
    const listener = (value: number) => {
      setMasterGainState(value);
    };
    masterGainListeners.add(listener);
    return () => {
      masterGainListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const listener = (value: number) => {
      setFadeGainState(value);
    };
    fadeGainListeners.add(listener);
    return () => {
      fadeGainListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!enableVisualizer) {
      return;
    }
    const listener = (value: Float32Array | null) => {
      setWaveform(value);
    };
    waveformListeners.add(listener);
    return () => {
      waveformListeners.delete(listener);
    };
  }, [enableVisualizer]);

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
    async (expression: string, mode: ModeOption, sampleRate: number, prerenderedUrl?: string, updatedAt?: string) => {
      if (toggleInProgress) {
        return;
      }

      toggleInProgress = true;

      const res = await ensureContextAndNode();
      if (!res) {
        toggleInProgress = false;
        return;
      }

      try {
        const { node } = res;
        const ctx = (node.context as AudioContext) ?? audioContext!;

        const shouldStart = !globalIsPlaying;

        if (shouldStart) {
          // If pre-rendered URL is provided, try to use it
          if (prerenderedUrl) {
            try {
              const prerendered = await loadPrerenderedAudio(prerenderedUrl, ctx, updatedAt);
              
              // Stop any existing pre-rendered source
              if (prerenderedSource) {
                try {
                  prerenderedSource.stop();
                  prerenderedSource.disconnect();
                } catch {}
                prerenderedSource = null;
              }

              // Store channels for waveform visualization
              prerenderedLeftChannel = prerendered.leftChannel;
              prerenderedRightChannel = prerendered.rightChannel;

              // Create and configure source
              const source = ctx.createBufferSource();
              source.buffer = prerendered.audioBuffer;
              
              // Connect through gain nodes
              if (!globalGainNode) {
                const gain = ctx.createGain();
                gain.gain.value = globalMasterGain;
                globalGainNode = gain;
              }
              if (!fadeGainNode) {
                const fg = ctx.createGain();
                fg.gain.value = globalFadeGain;
                fadeGainNode = fg;
              }

              try {
                globalGainNode.disconnect();
              } catch {}
              try {
                fadeGainNode.disconnect();
              } catch {}

              source.connect(globalGainNode);
              globalGainNode.connect(fadeGainNode);
              fadeGainNode.connect(ctx.destination);

              // Start playback
              prerenderedStartTime = ctx.currentTime;
              source.start(0);
              prerenderedSource = source;

              if (ctx.state === 'suspended') {
                await ctx.resume();
              }

              setLastError(null);
              setGlobalIsPlaying(true);
              
              // Start waveform updates for pre-rendered audio
              // Clear any existing timer first
              if (analyserTimerId != null) {
                window.clearTimeout(analyserTimerId);
                analyserTimerId = null;
              }
              
              const updatePrerenderedWaveform = () => {
                if (!globalIsPlaying || !prerenderedLeftChannel) {
                  setGlobalWaveform(null);
                  return;
                }
                // Calculate current playback position
                const elapsed = (ctx.currentTime - prerenderedStartTime) % (prerenderedLeftChannel.length / sampleRate);
                const sampleOffset = Math.floor(elapsed * sampleRate);
                const windowSize = 1024;
                
                // Extract waveform window
                const waveformData = new Float32Array(windowSize);
                for (let i = 0; i < windowSize; i++) {
                  const idx = (sampleOffset + i) % prerenderedLeftChannel.length;
                  waveformData[i] = prerenderedLeftChannel[idx];
                }
                setGlobalWaveform(waveformData);
                analyserTimerId = window.setTimeout(updatePrerenderedWaveform, ANALYSER_INTERVAL);
              };
              analyserTimerId = window.setTimeout(updatePrerenderedWaveform, ANALYSER_INTERVAL);

              return;
            } catch (error) {
              console.warn('Failed to load pre-rendered audio, falling back to real-time:', error);
              // Fall through to real-time rendering
            }
          }

          // Stop any existing pre-rendered source before starting real-time rendering
          if (prerenderedSource) {
            try {
              prerenderedSource.stop();
              prerenderedSource.disconnect();
            } catch {}
            prerenderedSource = null;
            prerenderedLeftChannel = null;
            prerenderedRightChannel = null;
          }

          // Clear waveform timer from pre-rendered playback and restart for real-time
          if (analyserTimerId != null) {
            window.clearTimeout(analyserTimerId);
            analyserTimerId = null;
          }

          // Restart analyser timer for real-time rendering
          if (analyserNode && analyserData) {
            const updateWaveform = () => {
              if (!analyserNode || !analyserData || !globalIsPlaying) {
                setGlobalWaveform(null);
              } else {
                analyserNode.getFloatTimeDomainData(analyserData as any);
                setGlobalWaveform(new Float32Array(analyserData));
              }
              analyserTimerId = window.setTimeout(updateWaveform, ANALYSER_INTERVAL);
            };
            analyserTimerId = window.setTimeout(updateWaveform, ANALYSER_INTERVAL);
          }

          // Real-time rendering path
          if (!workletConnected) {
            if (globalGainNode) {
              node.connect(globalGainNode);
              // Ensure fade node exists and wire: master -> fade -> destination
              if (!fadeGainNode) {
                const fg = ctx.createGain();
                fg.gain.value = globalFadeGain;
                fadeGainNode = fg;
              }
              try {
                globalGainNode.disconnect();
              } catch {}
              try {
                fadeGainNode!.disconnect();
              } catch {}
              globalGainNode.connect(fadeGainNode!);
              fadeGainNode!.connect(ctx.destination);
            } else {
              node.connect(ctx.destination);
            }
            workletConnected = true;
          }
          // Ensure analyser branch is connected each time we start, because stop() calls node.disconnect()
          if (analyserNode) {
            try {
              node.connect(analyserNode);
            } catch {
              // ignore if already connected
            }
            if (!analyserTapGain) {
              try {
                const tap = ctx.createGain();
                tap.gain.value = 0;
                analyserTapGain = tap;
                analyserNode.connect(analyserTapGain);
                analyserTapGain.connect(ctx.destination);
              } catch {
                // ignore
              }
            }
          }
          // Pre-validate expression by attempting to construct a Function on the main thread.
          // This prevents starting playback when there is a compile error.
          try {
            // We only care that this compiles; the worklet does the actual evaluation.
            void new Function('t', String(expression));
          } catch (e) {
            setLastError(String((e as Error).message || e));
            return;
          }

          setLastError(null);
          const sr = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 8000;

          node.port.postMessage({
            type: 'setExpression',
            expression,
            sampleRate: sr,
            mode,
          });
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          setGlobalIsPlaying(true);
        } else {
          // Stop playback
          if (prerenderedSource) {
            try {
              prerenderedSource.stop();
              prerenderedSource.disconnect();
            } catch {}
            prerenderedSource = null;
            prerenderedLeftChannel = null;
            prerenderedRightChannel = null;
          }

          // Clear waveform timer
          if (analyserTimerId != null) {
            window.clearTimeout(analyserTimerId);
            analyserTimerId = null;
          }

          if (ctx.state === 'running') {
            await ctx.suspend();
          }

          node.port.postMessage({ type: 'reset' });
          setGlobalIsPlaying(false);
        }
      } finally {
        toggleInProgress = false;
      }
    },
    [ensureContextAndNode],
  );

  const updateExpression = useCallback(
    async (expression: string, mode: ModeOption, sampleRate: number) => {
      if (!expression.trim()) return;

      const res = await ensureContextAndNode();
      if (!res) return;

      const { node } = res;

      // Pre-validate expression similarly to toggle, but without touching playback state.
      try {
        void new Function('t', String(expression));
      } catch (e) {
        setLastError(String((e as Error).message || e));
        return;
      }

      setLastError(null);
      const sr = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 8000;
      node.port.postMessage({
        type: 'setExpression',
        expression,
        sampleRate: sr,
        mode,
      });
    },
    [ensureContextAndNode],
  );

  const stop = useCallback(async () => {
    try {
      const ctx = audioContext;
      const node = workletNode;

      if (node) {
        try {
          node.port.postMessage({ type: 'reset' });
        } catch {
          // Ignore posting errors; we'll still try to silence via the context.
        }
      }

      if (ctx && ctx.state === 'running') {
        try {
          await ctx.suspend();
        } catch {
          // Ignore suspend errors; we'll fall back to disconnecting the node.
        }
      }

      if (ctx && node && workletConnected) {
        try {
          node.disconnect();
          if (globalGainNode) {
            try {
              globalGainNode.disconnect();
            } catch {
              // Ignore disconnect errors.
            }
          }
          if (fadeGainNode) {
            try {
              fadeGainNode.disconnect();
            } catch {
              // Ignore disconnect errors.
            }
          }
        } catch {
          // Ignore disconnect errors.
        }
        workletConnected = false;
      }
      // Ensure global playback state is updated so UI and toggle() stay in sync.
      setGlobalIsPlaying(false);
    } finally {
    }
  }, []);

  return useMemo(
    () => ({
      isPlaying,
      lastError,
      toggle,
      stop,
      level,
      waveform,
      updateExpression,
      masterGain,
      setMasterGain: (value: number) => {
        setGlobalMasterGain(value);
      },
      fadeGain,
      setFadeGain: (value: number) => {
        setGlobalFadeGain(value);
      },
    }),
    [isPlaying, lastError, toggle, stop, level, waveform, updateExpression, masterGain, fadeGain],
  );
}
