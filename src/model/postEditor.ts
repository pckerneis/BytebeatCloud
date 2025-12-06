import { ModeOption } from './expression';

export interface PostMetadataModel {
  title: string;
  description: string;
  mode: ModeOption;
  sampleRate: number;
  isDraft: boolean;
}
