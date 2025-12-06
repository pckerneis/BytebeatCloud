import { ModeOption } from '../model/expression';

export interface PreviewSource {
  expression: string;
  mode: ModeOption;
  sampleRate: number;
}

let preview: PreviewSource | null = null;
const listeners = new Set<(value: PreviewSource | null) => void>();

export function setPreviewSource(value: PreviewSource | null) {
  preview = value;
  listeners.forEach((l) => l(preview));
}

export function getPreviewSource(): PreviewSource | null {
  return preview;
}

export function subscribePreviewSource(listener: (value: PreviewSource | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
