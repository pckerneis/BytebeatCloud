import { useRef, useState } from 'react';
import { ModeOption } from '../model/expression';
import { validateExpression, type ValidationIssue } from '../utils/expression-validator';
import { setPreviewSource } from './previewSource';
import { DEBOUNCE_CODE_MS } from '../constants';

interface UseExpressionPlayerOptions {
  expression: string;
  setExpression: (value: string) => void;
  mode: ModeOption;
  sampleRateValue: number;
  toggle: (
    expression: string,
    mode: ModeOption,
    sampleRate: number,
    prerenderedUrl?: string,
    updatedAt?: string,
  ) => void | Promise<void>;
  setCurrentPostById: (id: string | null) => void;
  isPlaying: boolean;
  liveUpdateEnabled: boolean;
  updateExpression: (
    expression: string,
    mode: ModeOption,
    sampleRate: number,
  ) => void | Promise<void>;
  currentPost?: { id: string } | null;
}

export function useExpressionPlayer({
  expression,
  setExpression,
  mode,
  sampleRateValue,
  toggle,
  setCurrentPostById,
  isPlaying,
  liveUpdateEnabled,
  updateExpression,
  currentPost,
}: UseExpressionPlayerOptions) {
  const [validationIssue, setValidationIssue] = useState<ValidationIssue | null>(null);
  const validationTimeoutRef = useRef<number | null>(null);

  const handleExpressionChange = (value: string) => {
    setExpression(value);

    const trimmed = value.trim();
    if (!trimmed) {
      setValidationIssue(null);
      return;
    }

    if (validationTimeoutRef.current !== null) {
      window.clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = window.setTimeout(() => {
      const result = validateExpression(value);
      setValidationIssue(result.valid ? null : result.issues[0] ?? null);

      // Only apply live updates if no post is currently playing (i.e., editor's expression is playing)
      if (result.valid && liveUpdateEnabled && isPlaying && !currentPost) {
        void updateExpression(value, mode, sampleRateValue);
      }

      if (result.valid) {
        setPreviewSource({ expression: value, mode, sampleRate: sampleRateValue });
      } else {
        setPreviewSource(null);
      }
    }, DEBOUNCE_CODE_MS);
  };

  const handlePlayClick = (currentPost?: { id: string } | null) => {
    // If currently playing the editor's expression, pause it
    if (isPlaying && !currentPost) {
      void toggle(expression, mode, sampleRateValue);
      return;
    }

    // If currently playing a post, pause it first (don't start editor)
    if (isPlaying && currentPost) {
      void toggle(expression, mode, sampleRateValue);
      return;
    }

    const trimmed = expression.trim();
    if (!trimmed) {
      setValidationIssue(null);
      return;
    }

    const result = validateExpression(expression);

    if (!result.valid) {
      setValidationIssue(result.issues[0] ?? null);
      return;
    }

    setValidationIssue(null);
    setCurrentPostById(null);
    void toggle(expression, mode, sampleRateValue);
  };

  return {
    validationIssue,
    handleExpressionChange,
    handlePlayClick,
    setValidationIssue,
  };
}
