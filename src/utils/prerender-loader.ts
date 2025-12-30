export interface PrerenderedAudio {
  audioBuffer: AudioBuffer;
  leftChannel: Float32Array;
  rightChannel: Float32Array;
}

export async function loadPrerenderedAudio(
  url: string,
  audioContext: AudioContext,
): Promise<PrerenderedAudio> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load pre-rendered audio: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.numberOfChannels > 1 
    ? audioBuffer.getChannelData(1) 
    : leftChannel;

  return {
    audioBuffer,
    leftChannel,
    rightChannel,
  };
}
