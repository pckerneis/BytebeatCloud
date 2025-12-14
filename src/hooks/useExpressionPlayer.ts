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
    loop?: boolean,
  ) => void | Promise<void>;
  setCurrentPostById: (id: string | null) => void;
  loopPreview?: boolean;
  isPlaying: boolean;
  liveUpdateEnabled: boolean;
  updateExpression: (
    expression: string,
    mode: ModeOption,
    sampleRate: number,
  ) => void | Promise<void>;
}

export function useExpressionPlayer({
  expression,
  setExpression,
  mode,
  sampleRateValue,
  toggle,
  setCurrentPostById,
  loopPreview,
  isPlaying,
  liveUpdateEnabled,
  updateExpression,
}: UseExpressionPlayerOptions) {
  const [validationIssue, setValidationIssue] = useState<ValidationIssue | null>(null);
  const validationTimeoutRef = useRef<number | null>(null);

  const handleExpressionChange = (value: string) => {
    if (validationTimeoutRef.current !== null) {
      window.clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = window.setTimeout(() => {
      setExpression(value);

      const trimmed = value.trim();
      if (!trimmed) {
        setValidationIssue(null);
        return;
      }

      const result = validateExpression(value);
      setValidationIssue(result.valid ? null : result.issues[0] ?? null);

      if (result.valid && liveUpdateEnabled && isPlaying) {
        void updateExpression(value, mode, sampleRateValue);
      }

      if (result.valid) {
        setPreviewSource({ expression: value, mode, sampleRate: sampleRateValue });
      } else {
        setPreviewSource(null);
      }
    }, DEBOUNCE_CODE_MS);
  };

  const handlePlayClick = () => {
    if (isPlaying) {
      void toggle(expression, mode, sampleRateValue, loopPreview);
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
    void toggle(expression, mode, sampleRateValue, loopPreview);
  };

  return {
    validationIssue,
    handleExpressionChange,
    handlePlayClick,
    setValidationIssue,
  };
}
