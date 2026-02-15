import { useState, useRef, useCallback, useEffect } from 'react';
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
import {
  EXPRESSION_MAX,
  POST_DESCRIPTION_MAX,
  POST_TITLE_MAX,
  AUTO_SKIP_DURATION_PRESETS,
  MIN_AUTO_SKIP_DURATION,
  MAX_AUTO_SKIP_DURATION,
  AUTOPLAY_DEFAULT_DURATION,
} from '../constants';
import Link from 'next/link';
import type { SnippetRow } from '../model/snippet';
import { searchSnippetsRanked, recordSnippetUsage } from '../services/snippetsClient';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

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
  isEdit: boolean;

  liveUpdateEnabled: boolean;
  onLiveUpdateChange: (enabled: boolean) => void;

  isShareAlikeFork?: boolean;
  userId?: string;
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

function findNextDurationPreset(duration: number | null): number | null {
  if (duration === null) {
    return AUTO_SKIP_DURATION_PRESETS[0];
  }

  for (let d of AUTO_SKIP_DURATION_PRESETS) {
    if (d > duration) {
      return d;
    }
  }

  return null; // Back to "Auto"
}

function formatDuration(duration: number | null): string {
  if (duration === null) {
    return `Auto`;
  }
  return `${duration}s`;
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
    liveUpdateEnabled,
    onLiveUpdateChange,
    isShareAlikeFork,
    isEdit,
    userId,
  } = props;

  const expressionLength = new TextEncoder().encode(expression).length;
  const isExpressionTooLong = expressionLength > EXPRESSION_MAX;

  const { title, description, mode, sampleRate, license, autoSkipDuration } = meta;
  const [sampleRateModalOpen, setSampleRateModalOpen] = useState(false);
  const [sampleRateInput, setSampleRateInput] = useState(sampleRate.toString());
  const [durationModalOpen, setDurationModalOpen] = useState(false);
  const [durationInput, setDurationInput] = useState(
    (autoSkipDuration ?? AUTOPLAY_DEFAULT_DURATION).toString(),
  );
  const longPressTimeoutRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const durationLongPressTimeoutRef = useRef<number | null>(null);
  const durationLongPressTriggeredRef = useRef(false);
  const currentLicenseLabel = LICENSE_OPTIONS.find((opt) => opt.value === license)?.label;
  const [snippetsModalOpen, setSnippetsModalOpen] = useState(false);
  const [snippetSearch, setSnippetSearch] = useState('');
  const [snippetResults, setSnippetResults] = useState<SnippetRow[]>([]);
  const [snippetSearchLoading, setSnippetSearchLoading] = useState(false);
  const snippetSearchTimerRef = useRef<number | null>(null);
  const [snippetPage, setSnippetPage] = useState(0);
  const [snippetHasMore, setSnippetHasMore] = useState(false);
  const [snippetLoadingMore, setSnippetLoadingMore] = useState(false);
  const snippetLoadingMoreRef = useRef(false);
  const snippetSentinelRef = useRef<HTMLDivElement | null>(null);
  const snippetSearchRef = useRef('');

  useInfiniteScroll({
    hasMore: snippetHasMore,
    loadingMoreRef: snippetLoadingMoreRef,
    sentinelRef: snippetSentinelRef,
    setPage: setSnippetPage,
  });

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

  const openDurationModal = () => {
    setDurationInput((autoSkipDuration ?? AUTOPLAY_DEFAULT_DURATION).toString());
    setDurationModalOpen(true);
  };

  const closeDurationModal = () => {
    setDurationModalOpen(false);
  };

  const loadSnippetsPage = useCallback(
    async (query: string, page: number) => {
      if (page === 0) setSnippetSearchLoading(true);
      else setSnippetLoadingMore(true);
      const { data, hasMore } = await searchSnippetsRanked(query, userId, page);
      if (query !== snippetSearchRef.current) return; // stale response
      if (page === 0) {
        setSnippetResults(data);
      } else {
        setSnippetResults((prev) => [...prev, ...data]);
      }
      setSnippetHasMore(hasMore);
      setSnippetSearchLoading(false);
      setSnippetLoadingMore(false);
      snippetLoadingMoreRef.current = false;
    },
    [userId],
  );

  // Load next page when snippetPage changes (driven by useInfiniteScroll)
  useEffect(() => {
    if (snippetPage > 0) {
      void loadSnippetsPage(snippetSearchRef.current, snippetPage);
    }
  }, [snippetPage, loadSnippetsPage]);

  const openSnippetsModal = () => {
    setSnippetSearch('');
    snippetSearchRef.current = '';
    setSnippetResults([]);
    setSnippetPage(0);
    setSnippetHasMore(false);
    setSnippetLoadingMore(false);
    snippetLoadingMoreRef.current = false;
    setSnippetsModalOpen(true);
    void loadSnippetsPage('', 0);
  };

  const closeSnippetsModal = () => {
    setSnippetsModalOpen(false);
    if (snippetSearchTimerRef.current !== null) {
      window.clearTimeout(snippetSearchTimerRef.current);
    }
  };

  const handleSnippetSearchChange = (value: string) => {
    setSnippetSearch(value);
    snippetSearchRef.current = value;
    if (snippetSearchTimerRef.current !== null) {
      window.clearTimeout(snippetSearchTimerRef.current);
    }
    snippetSearchTimerRef.current = window.setTimeout(() => {
      setSnippetPage(0);
      setSnippetHasMore(false);
      setSnippetLoadingMore(false);
      snippetLoadingMoreRef.current = false;
      void loadSnippetsPage(value, 0);
    }, 300);
  };

  const insertSnippet = (snippetId: string, snippetCode: string) => {
    if (userId) {
      void recordSnippetUsage(snippetId, userId);
    }
    const trimmed = expression.trim();
    if (trimmed) {
      if (trimmed.endsWith(',')) {
        onExpressionChange(expression + snippetCode);
      } else {
        onExpressionChange(expression + ',' + snippetCode);
      }
    } else {
      onExpressionChange(snippetCode);
    }
    setSnippetsModalOpen(false);
  };

  const commitDurationFromInput = () => {
    const parsed = parseInt(durationInput, 10);
    if (Number.isNaN(parsed)) return;

    const clamped = Math.min(MAX_AUTO_SKIP_DURATION, Math.max(MIN_AUTO_SKIP_DURATION, parsed));
    onMetaChange({ ...meta, autoSkipDuration: clamped });
    setDurationModalOpen(false);
  };

  const startDurationLongPress = () => {
    if (durationLongPressTimeoutRef.current !== null) {
      window.clearTimeout(durationLongPressTimeoutRef.current);
    }
    durationLongPressTriggeredRef.current = false;
    durationLongPressTimeoutRef.current = window.setTimeout(() => {
      durationLongPressTriggeredRef.current = true;
      openDurationModal();
    }, 500);
  };

  const cancelDurationLongPress = () => {
    if (durationLongPressTimeoutRef.current !== null) {
      window.clearTimeout(durationLongPressTimeoutRef.current);
      durationLongPressTimeoutRef.current = null;
    }
  };

  const rotateDuration = () => {
    onMetaChange({ ...meta, autoSkipDuration: findNextDurationPreset(autoSkipDuration) });
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
        <button
          type="button"
          className="chip"
          onClick={() => {
            if (durationLongPressTriggeredRef.current) {
              durationLongPressTriggeredRef.current = false;
              return;
            }
            rotateDuration();
          }}
          onMouseDown={startDurationLongPress}
          onMouseUp={cancelDurationLongPress}
          onMouseLeave={cancelDurationLongPress}
          onTouchStart={startDurationLongPress}
          onTouchEnd={cancelDurationLongPress}
          onTouchCancel={cancelDurationLongPress}
        >
          {formatDuration(autoSkipDuration)}
        </button>

        <button type="button" className="chip ml-auto" onClick={openSnippetsModal}>
          + Insert snippet
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
            {isShareAlikeFork ? (
              <div className="license-locked">
                <span className="license-locked-label">License: {currentLicenseLabel}</span>
                <span className="license-locked-hint">
                  This post is derived from a Share-Alike work, so the license can’t be changed.
                </span>
              </div>
            ) : isEdit ? (
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

      {sampleRateModalOpen && (
        <div className="modal-backdrop">
          <div
            className="modal"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                commitSampleRateFromInput();
              } else if (e.key === 'Escape') {
                closeSampleRateModal();
              }
            }}
          >
            <h2>Sample rate</h2>
            <p>
              Enter a value between {MIN_SAMPLE_RATE} and {MAX_SAMPLE_RATE}.
            </p>
            <input
              type="number"
              min={MIN_SAMPLE_RATE}
              max={MAX_SAMPLE_RATE}
              value={sampleRateInput}
              step={10}
              onChange={(e) => setSampleRateInput(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full mb-12"
            />
            <div className="modal-actions">
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

      {durationModalOpen && (
        <div className="modal-backdrop">
          <div
            className="modal"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                commitDurationFromInput();
              } else if (e.key === 'Escape') {
                closeDurationModal();
              }
            }}
          >
            <h2>Auto-skip duration</h2>
            <p>
              Enter a value in seconds ({MIN_AUTO_SKIP_DURATION} - {MAX_AUTO_SKIP_DURATION}).
            </p>
            <input
              type="number"
              min={MIN_AUTO_SKIP_DURATION}
              max={MAX_AUTO_SKIP_DURATION}
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full mb-12"
            />
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={closeDurationModal}>
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                onClick={commitDurationFromInput}
                disabled={Number.isNaN(parseInt(durationInput, 10))}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {snippetsModalOpen && (
        <div className="modal-backdrop">
          <div
            className="modal"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                closeSnippetsModal();
              }
            }}
          >
            <h2>Insert snippet</h2>
            <input
              type="search"
              placeholder="Search for a snippet..."
              className="border-bottom-accent-focus w-full mb-12"
              value={snippetSearch}
              onChange={(e) => handleSnippetSearchChange(e.target.value)}
            />

            <div className="snippet-results-list">
              {snippetSearchLoading && snippetResults.length === 0 && (
                <p className="secondary-text">Searching…</p>
              )}
              {!snippetSearchLoading && snippetResults.length === 0 && (
                <p className="secondary-text">No snippets found.</p>
              )}
              {snippetResults.map((s) => (
                <div
                  key={s.id}
                  className="snippet-result-item"
                  onClick={() => insertSnippet(s.id, s.snippet)}
                >
                  <div>
                    <strong>{s.name}</strong>
                    {s.username && <span className="secondary-text"> by @{s.username}</span>}
                  </div>
                  <code className="secondary-text">{s.snippet}</code>
                  {s.description && <div className="secondary-text smaller">{s.description}</div>}
                </div>
              ))}
              {snippetHasMore && (
                <div
                  ref={snippetSentinelRef}
                  style={{ height: 1 }}
                  data-testid="snippet-scroll-sentinel"
                />
              )}
              {snippetLoadingMore && <p className="secondary-text">Loading more…</p>}
            </div>

            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={closeSnippetsModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
