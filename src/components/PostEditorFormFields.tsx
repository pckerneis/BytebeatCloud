import { useState } from 'react';
import { ExpressionEditor, ExpressionErrorSnippet } from './ExpressionEditor';
import { ModeOption, SampleRateOption } from '../model/expression';
import { ValidationIssue } from '../model/expression-validator';

interface PostEditorFormFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;

  expression: string;
  onExpressionChange: (value: string) => void;

  mode: ModeOption;
  sampleRate: SampleRateOption;
  onToggleMode: () => void;
  onRotateSampleRate: () => void;

  isDraft: boolean;
  onDraftChange: (value: boolean) => void;

  isPlaying: boolean;
  onPlayClick: () => void;

  validationIssue: ValidationIssue | null;
  lastError: string | null;

  isExpressionTooLong: boolean;
  expressionLength: number;
  expressionMax: number;

  saveStatus: 'idle' | 'saving' | 'success';
  saveError: string;

  submitLabel: string;

  showDeleteButton?: boolean;
  onDeleteClick?: () => void;

  showActions: boolean;
}

export function PostEditorFormFields(props: PostEditorFormFieldsProps) {
  const {
    title,
    onTitleChange,
    expression,
    onExpressionChange,
    mode,
    sampleRate,
    onToggleMode,
    onRotateSampleRate,
    isDraft,
    onDraftChange,
    isPlaying,
    onPlayClick,
    validationIssue,
    lastError,
    isExpressionTooLong,
    expressionLength,
    expressionMax,
    saveStatus,
    saveError,
    submitLabel,
    showDeleteButton,
    onDeleteClick,
    showActions,
  } = props;

  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const canSubmit = Boolean(expression.trim()) && !validationIssue && saveStatus !== 'saving';

  const handleCopyShareLink = async () => {
    const trimmedExpr = expression.trim();
    if (!trimmedExpr) return;

    if (typeof window === 'undefined') return;

    const trimmedTitle = title.trim();

    const sampleRateValue =
      sampleRate === SampleRateOption._8k
        ? '8k'
        : sampleRate === SampleRateOption._16k
          ? '16k'
          : '44.1k';

    const modeValue = mode === ModeOption.Float ? 'float' : 'int';

    const payload = {
      title: trimmedTitle || undefined,
      expr: trimmedExpr,
      mode: modeValue,
      sr: sampleRateValue,
    };

    let encoded = '';
    try {
      encoded = btoa(JSON.stringify(payload));
    } catch {
      return;
    }

    const origin = window.location.origin;
    const href = `${origin}/create?q=${encodeURIComponent(encoded)}`;

    try {
      await navigator.clipboard.writeText(href);
      setShareLinkCopied(true);
      window.setTimeout(() => setShareLinkCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <>
      <label className="field">
        <input
          type="text"
          maxLength={64}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="post-title-input"
          placeholder="Name your bytebeat expression"
        />
      </label>

      <div className="chips">
        <button type="button" className="chip" onClick={() => onToggleMode()}>
          {mode}
        </button>
        <button type="button" className="chip" onClick={() => onRotateSampleRate()}>
          {sampleRate}
        </button>
      </div>

      <div className="expression-input">
        <ExpressionEditor value={expression} onChange={onExpressionChange} />
      </div>
      <div className="field-footer">
        <button
          type="button"
          className="button secondary"
          disabled={!expression.trim() || !!validationIssue}
          onClick={onPlayClick}
        >
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        <span className={isExpressionTooLong ? 'counter error' : 'counter'}>
          {expressionLength} / {expressionMax}
        </span>
      </div>

      {validationIssue && (
        <div className="expression-preview">
          {validationIssue.message}
          <ExpressionErrorSnippet expression={expression} issue={validationIssue} />
        </div>
      )}
      {lastError ? <p className="error-message">{lastError}</p> : null}

      {showActions && (
        <div className="form-actions">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={isDraft}
              onChange={(e) => onDraftChange(e.target.checked)}
            />
            <span>Save as draft</span>
          </label>

          <div className="form-actions-buttons">
            {showDeleteButton && onDeleteClick && (
              <button
                type="button"
                className="button danger"
                onClick={onDeleteClick}
                disabled={saveStatus === 'saving'}
              >
                Delete
              </button>
            )}

            <button type="submit" className="button primary" disabled={!canSubmit}>
              {submitLabel}
            </button>
          </div>
        </div>
      )}

      <div className="form-actions-buttons" style={{ marginTop: '8px' }}>
        <button
          type="button"
          className="button secondary"
          disabled={!expression.trim()}
          onClick={handleCopyShareLink}
        >
          {shareLinkCopied ? 'Link copied' : 'Copy share link'}
        </button>
      </div>

      {saveError && <p className="error-message">{saveError}</p>}
      {saveStatus === 'success' && !saveError && (
        <p className="counter">Post {submitLabel.toLowerCase()}.</p>
      )}
    </>
  );
}
