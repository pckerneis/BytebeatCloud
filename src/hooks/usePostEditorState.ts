import { useState } from 'react';
import { ModeOption, DEFAULT_SAMPLE_RATE } from '../model/expression';
import { LicenseOption, DEFAULT_LICENSE } from '../model/postEditor';

export interface PostEditorState {
  title: string;
  description: string;
  expression: string;
  mode: ModeOption;
  sampleRate: number;
  license: LicenseOption;
  isDraft: boolean;
  liveUpdateEnabled: boolean;
  autoSkipDuration: number | null;
}

export interface PostEditorStateActions {
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setExpression: (expression: string) => void;
  setMode: (mode: ModeOption) => void;
  setSampleRate: (rate: number) => void;
  setLicense: (license: LicenseOption) => void;
  setIsDraft: (isDraft: boolean) => void;
  setLiveUpdateEnabled: (enabled: boolean) => void;
  setAutoSkipDuration: (duration: number | null) => void;
  setState: (state: Partial<PostEditorState>) => void;
}

export interface UsePostEditorStateOptions {
  initialMode?: ModeOption;
  initialSampleRate?: number;
  initialLicense?: LicenseOption;
  initialLiveUpdate?: boolean;
}

export function usePostEditorState(
  options: UsePostEditorStateOptions = {},
): PostEditorState & PostEditorStateActions {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expression, setExpression] = useState('');
  const [mode, setMode] = useState<ModeOption>(options.initialMode ?? ModeOption.Uint8);
  const [sampleRate, setSampleRate] = useState<number>(
    options.initialSampleRate ?? DEFAULT_SAMPLE_RATE,
  );
  const [license, setLicense] = useState<LicenseOption>(options.initialLicense ?? DEFAULT_LICENSE);
  const [isDraft, setIsDraft] = useState(false);
  const [liveUpdateEnabled, setLiveUpdateEnabled] = useState(options.initialLiveUpdate ?? true);
  const [autoSkipDuration, setAutoSkipDuration] = useState<number | null>(null);

  const setState = (state: Partial<PostEditorState>) => {
    if (state.title !== undefined) setTitle(state.title);
    if (state.description !== undefined) setDescription(state.description);
    if (state.expression !== undefined) setExpression(state.expression);
    if (state.mode !== undefined) setMode(state.mode);
    if (state.sampleRate !== undefined) setSampleRate(state.sampleRate);
    if (state.license !== undefined) setLicense(state.license);
    if (state.isDraft !== undefined) setIsDraft(state.isDraft);
    if (state.liveUpdateEnabled !== undefined) setLiveUpdateEnabled(state.liveUpdateEnabled);
    if (state.autoSkipDuration !== undefined) setAutoSkipDuration(state.autoSkipDuration);
  };

  return {
    title,
    description,
    expression,
    mode,
    sampleRate,
    license,
    isDraft,
    liveUpdateEnabled,
    autoSkipDuration,
    setTitle,
    setDescription,
    setExpression,
    setMode,
    setSampleRate,
    setLicense,
    setIsDraft,
    setLiveUpdateEnabled,
    setAutoSkipDuration,
    setState,
  };
}
