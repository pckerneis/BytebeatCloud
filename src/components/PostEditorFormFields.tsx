import { useState, useRef } from 'react';
import { ExpressionEditor, ExpressionErrorSnippet } from './ExpressionEditor';
import { AutocompleteTextarea } from './AutocompleteTextarea';
import { AutocompleteInput } from './AutocompleteInput';
import {
  ModeOption,
  SAMPLE_RATE_PRESETS,
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  formatSampleRate,
} from '../model/expression';
import { ValidationIssue } from '../utils/expression-validator';
import type { PostMetadataModel } from '../model/postEditor';
import { LICENSE_OPTIONS } from '../model/postEditor';
import { EXPRESSION_MAX, POST_DESCRIPTION_MAX, POST_TITLE_MAX } from '../constants';
import Link from 'next/link';

interface PostEditorFormFieldsProps {
  meta: PostMetadataModel;
  onMetaChange: (next: PostMetadataModel) => void;

  expression: string;
  onExpressionChange: (value: string) => void;

  isPlaying: boolean;
  onPlayClick: () => void;

  validationIssue: ValidationIssue | null;
  lastError: string | null;

  saveStatus: 'idle' | 'saving' | 'success';
  saveError: string;

  showActions: boolean;
  isFork: boolean;

  liveUpdateEnabled: boolean;
  onLiveUpdateChange: (enabled: boolean) => void;

  lockLicense?: boolean;
}

function findNextPresetSampleRate(sampleRate: number): number {
  if (sampleRate >= MAX_SAMPLE_RATE) return MIN_SAMPLE_RATE;

  for (let sr of SAMPLE_RATE_PRESETS) {
    if (sr > sampleRate) {
      return sr;
    }
  }

  return MAX_SAMPLE_RATE;
}

export function PostEditorFormFields(props: Readonly<PostEditorFormFieldsProps>) {
  const {
    meta,
    onMetaChange,
    expression,
    onExpressionChange,
    isPlaying,
    onPlayClick,
    validationIssue,
    lastError,
    showActions,
    isFork,
    liveUpdateEnabled,
    onLiveUpdateChange,
    lockLicense,
  } = props;

  const expressionLength = expression.length;
  const isExpressionTooLong = expressionLength > EXPRESSION_MAX;

  const { title, description, mode, sampleRate, license } = meta;
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [sampleRateModalOpen, setSampleRateModalOpen] = useState(false);
  const [sampleRateInput, setSampleRateInput] = useState(sampleRate.toString());
  const longPressTimeoutRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const currentLicenseLabel = LICENSE_OPTIONS.find((opt) => opt.value === license)?.label;

  const openSampleRateModal = () => {
    setSampleRateInput(sampleRate.toString());
    setSampleRateModalOpen(true);
  };

  const closeSampleRateModal = () => {
    setSampleRateModalOpen(false);
  };

  const commitSampleRateFromInput = () => {
    const parsed = parseInt(sampleRateInput, 10);
    if (Number.isNaN(parsed)) return;

    const rounded = Math.round(parsed / 10) * 10;
    const clamped = Math.min(MAX_SAMPLE_RATE, Math.max(MIN_SAMPLE_RATE, rounded));
    onMetaChange({ ...meta, sampleRate: clamped });
    setSampleRateModalOpen(false);
  };

  const startSampleRateLongPress = () => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
    }
    longPressTriggeredRef.current = false;
    longPressTimeoutRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      openSampleRateModal();
    }, 500);
  };

  const cancelSampleRateLongPress = () => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const toggleMode = () => {
    if (mode === ModeOption.Float) {
      onMetaChange({ ...meta, mode: ModeOption.Uint8 });
      return;
    }
    if (mode === ModeOption.Uint8) {
      onMetaChange({ ...meta, mode: ModeOption.Int8 });
      return;
    }
    onMetaChange({ ...meta, mode: ModeOption.Float });
  };

  const rotateSampleRate = () => {
    onMetaChange({ ...meta, sampleRate: findNextPresetSampleRate(sampleRate) });
  };

  const handleCopyShareLink = async () => {
    const trimmedExpr = expression.trim();
    if (!trimmedExpr) return;

    if (typeof window === 'undefined') return;

    const trimmedTitle = title.trim();

    const payload = {
      title: trimmedTitle || undefined,
      expr: trimmedExpr,
      mode,
      sr: sampleRate,
    };

    let encoded = '';
    try {
      encoded = btoa(JSON.stringify(payload));
    } catch {
      return;
    }

    const origin = window.location.origin;
    const href = `${origin}/${isFork ? 'fork' : 'create'}?q=${encodeURIComponent(encoded)}`;

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
        <AutocompleteInput
          maxLength={POST_TITLE_MAX}
          value={title}
          onChange={(val) => onMetaChange({ ...meta, title: val })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
            }
          }}
          className="border-bottom-accent-focus"
          placeholder="Name your bytebeat expression"
        />
      </label>

      <div className="chips">
        <button type="button" className="chip" onClick={toggleMode}>
          {mode}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => {
            if (longPressTriggeredRef.current) {
              longPressTriggeredRef.current = false;
              return;
            }
            rotateSampleRate();
          }}
          onMouseDown={startSampleRateLongPress}
          onMouseUp={cancelSampleRateLongPress}
          onMouseLeave={cancelSampleRateLongPress}
          onTouchStart={startSampleRateLongPress}
          onTouchEnd={cancelSampleRateLongPress}
          onTouchCancel={cancelSampleRateLongPress}
        >
          {formatSampleRate(sampleRate)}
        </button>
      </div>

      <div className="expression-input">
        <ExpressionEditor value={expression} onChange={onExpressionChange} />
      </div>
      <div className="field-footer">
        <button
          type="button"
          className="button primary"
          disabled={!isPlaying && (!expression.trim() || !!validationIssue)}
          onClick={onPlayClick}
        >
          {isPlaying ? 'Stop' : 'Play'}
        </button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={liveUpdateEnabled}
            onChange={(e) => onLiveUpdateChange(e.target.checked)}
          />{' '}
          Live update
        </label>
        <span className={isExpressionTooLong ? 'counter error' : 'counter'}>
          {expressionLength} / {EXPRESSION_MAX}
        </span>
      </div>

      {validationIssue && (
        <div className="expression-preview">
          {validationIssue.message}
          <ExpressionErrorSnippet expression={expression} issue={validationIssue} />
        </div>
      )}
      {lastError ? <p className="error-message">{lastError}</p> : null}

      <label className="field">
        <AutocompleteTextarea
          value={description}
          onChange={(val) => onMetaChange({ ...meta, description: val })}
          className="border-bottom-accent-focus"
          placeholder="Add an optional description"
          maxLength={POST_DESCRIPTION_MAX}
          rows={3}
        />
        <details className="syntax-helper">
          <summary>Formatting tips</summary>
          <ul>
            <li>
              <strong>#tags</strong> — add hashtags like <code>#chiptune</code> or{' '}
              <code>#ambient</code>
            </li>
            <li>
              <strong>@mentions</strong> — mention users like <code>@username</code>
            </li>
          </ul>
        </details>
      </label>
      {showActions && (
        <>
          <div className="field license-field">
            {lockLicense ? (
              <div className="license-locked">
                <span className="license-locked-label">License: {currentLicenseLabel}</span>
                <span className="license-locked-hint">
                  Reuse permissions are locked to protect people who may already be using this work.
                </span>
              </div>
            ) : (
              <details className="license-helper">
                <summary>License: {currentLicenseLabel}</summary>
                <div className="radio-group">
                  {LICENSE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="radio-option">
                      <input
                        type="radio"
                        name="license"
                        value={opt.value}
                        checked={license === opt.value}
                        onChange={() => onMetaChange({ ...meta, license: opt.value })}
                      />
                      <span className="radio-label">
                        <strong>{opt.label}</strong> — {opt.description}
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>

          <p className="secondary-text smaller">
            By publishing, you agree to the{' '}
            <Link href="/terms" target="_blank">
              Terms of Service
            </Link>
            .
          </p>
        </>
      )}

      {!showActions && (
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
      )}

      {sampleRateModalOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="modal">
            <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px' }}>Sample rate</h2>
            <p style={{ marginTop: 0, marginBottom: '8px', fontSize: '12px', opacity: 0.8 }}>
              Enter a value between {MIN_SAMPLE_RATE} and {MAX_SAMPLE_RATE}.
            </p>
            <input
              type="number"
              min={MIN_SAMPLE_RATE}
              max={MAX_SAMPLE_RATE}
              value={sampleRateInput}
              step={10}
              onChange={(e) => setSampleRateInput(e.target.value.replace(/[^0-9]/g, ''))}
              style={{ width: '100%', padding: '6px 8px', marginBottom: '12px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="button secondary" onClick={closeSampleRateModal}>
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                onClick={commitSampleRateFromInput}
                disabled={Number.isNaN(parseInt(sampleRateInput, 10))}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
