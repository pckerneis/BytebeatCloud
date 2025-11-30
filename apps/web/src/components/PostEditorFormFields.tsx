import { ExpressionEditor, ExpressionErrorSnippet } from './ExpressionEditor';
import type { ModeOption, SampleRateOption, ValidationIssue } from 'shared';

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
    showActions
  } = props;

  const canSubmit = Boolean(expression.trim()) && !validationIssue && saveStatus !== 'saving';

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
        <button
          type="button"
          className="chip"
          onClick={() => onToggleMode()}
        >
          {mode}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onRotateSampleRate()}
        >
          {sampleRate}
        </button>
      </div>

      <div className="expression-input">
        <ExpressionEditor
          value={expression}
          onChange={onExpressionChange}
        />
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

      {showActions &&
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

          <button
            type="submit"
            className="button primary"
            disabled={!canSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
      }

      {saveError && <p className="error-message">{saveError}</p>}
      {saveStatus === 'success' && !saveError && (
        <p className="counter">Post {submitLabel.toLowerCase()}.</p>
      )}
    </>
  );
}
