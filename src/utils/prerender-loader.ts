export interface PrerenderedAudio {
  audioBuffer: AudioBuffer;
  leftChannel: Float32Array;
  rightChannel: Float32Array;
}

interface CachedAudio {
  audio: PrerenderedAudio;
  updatedAt: string;
}

// Cache for pre-rendered audio, keyed by URL
const audioCache = new Map<string, CachedAudio>();

export async function loadPrerenderedAudio(
  url: string,
  audioContext: AudioContext,
  updatedAt?: string,
): Promise<PrerenderedAudio> {
  // Check cache first
  const cached = audioCache.get(url);
  if (cached) {
    // Invalidate cache if post was updated after caching
    if (updatedAt && new Date(updatedAt) > new Date(cached.updatedAt)) {
      audioCache.delete(url);
    } else {
      return cached.audio;
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load pre-rendered audio: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel =
    audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

  const audio: PrerenderedAudio = {
    audioBuffer,
    leftChannel,
    rightChannel,
  };

  // Cache the result with current timestamp
  if (updatedAt) {
    audioCache.set(url, { audio, updatedAt });
  }

  return audio;
}
