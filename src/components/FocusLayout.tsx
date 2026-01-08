import { PropsWithChildren, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useTheme } from '../hooks/useTheme';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import { DEFAULT_THEME_ID } from '../theme/themes';
import { ThemeContext } from '../theme/ThemeContext';
import useAudioWarmup from '../hooks/useAudioWarmup';
import { VolumeButton } from './VolumeButton';
import {
  ModeOption,
  SAMPLE_RATE_PRESETS,
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  formatSampleRate,
  DEFAULT_SAMPLE_RATE,
} from '../model/expression';
import { EXPRESSION_MAX } from '../constants';
import { validateExpression } from '../utils/expression-validator';
import { TooltipHint } from './TooltipHint';
import { copyShareLinkToClipboard } from '../utils/shareLink';
import { UNTITLED_POST } from '../utils/post-format';

function FocusHeader({
  isLoggedIn,
  username,
  onExitFocusMode,
  title,
  onTitleChange,
}: {
  isLoggedIn: boolean;
  username?: string | null;
  onExitFocusMode: () => void;
  title: string;
  onTitleChange: (title: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSpanClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <>
      <div className="focus-header px-12 py-8 flex-row align-items-center justify-content-space-between">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={UNTITLED_POST}
            className="focus-title-input editing"
          />
        ) : (
          <span
            onClick={handleSpanClick}
            className={`focus-title-display${!title ? ' secondary-text' : ''}`}
            title="Click to edit title"
          >
            {title || UNTITLED_POST}
          </span>
        )}

        <span className="secondary-text sm-hidden">
          {!isLoggedIn ? (
            <>
              <a href={'/login'}>Sign in</a> to publish.
            </>
          ) : (
            <span>@{username}</span>
          )}
        </span>

        <TooltipHint
          storageKey="exit-focus-mode"
          content="Return to the standard view."
          placement="bottom"
        >
          <button
            className="button secondary small ghost sm-hidden"
            onClick={onExitFocusMode}
            title="Exit focus mode (Ctrl+Shift+F)"
          >
            ⛶ Exit focus mode
          </button>
          <button
            className="button secondary small ghost sm-only"
            onClick={onExitFocusMode}
            title="Exit focus mode (Ctrl+Shift+F)"
          >
            ⛶ Back
          </button>
        </TooltipHint>
      </div>
    </>
  );
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

interface FocusLayoutProps extends PropsWithChildren {
  expression?: string;
  mode?: ModeOption;
  onModeChange?: (mode: ModeOption) => void;
  sampleRate?: number;
  onSampleRateChange?: (rate: number) => void;
  isPlaying?: boolean;
  onPlayClick?: () => void;
  liveUpdateEnabled?: boolean;
  onLiveUpdateChange?: (enabled: boolean) => void;
  onPublish?: () => void;
  isLoggedIn?: boolean;
  username?: string | null;
  title?: string;
  onTitleChange?: (title: string) => void;
  onExitFocusMode?: () => void;
  runtimeError?: string | null;
}

function FocusFooter({
  expression,
  mode,
  onModeChange,
  sampleRate,
  onSampleRateChange,
  isPlaying,
  onPlayClick,
  liveUpdateEnabled,
  onLiveUpdateChange,
  onPublish,
  masterGain,
  onMasterGainChange,
  isLoggedIn,
  title,
}: {
  expression: string;
  mode: ModeOption;
  onModeChange: (mode: ModeOption) => void;
  sampleRate: number;
  onSampleRateChange: (rate: number) => void;
  isPlaying: boolean;
  onPlayClick: () => void;
  liveUpdateEnabled: boolean;
  onLiveUpdateChange: (enabled: boolean) => void;
  onPublish: () => void;
  masterGain: number;
  onMasterGainChange: (gain: number) => void;
  isLoggedIn: boolean;
  title: string;
}) {
  const expressionLength = expression.length;
  const isExpressionTooLong = expressionLength > EXPRESSION_MAX;
  const validationResult = validateExpression(expression.trim());
  const canSubmit = Boolean(expression.trim()) && validationResult.valid;
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  useEffect(() => {
    if (shareLinkCopied) {
      const timer = setTimeout(() => setShareLinkCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [shareLinkCopied]);

  const handleCopyShareLink = async () => {
    const success = await copyShareLinkToClipboard({
      title,
      expression,
      mode,
      sampleRate,
    });

    if (success) {
      setShareLinkCopied(true);
    }
  };

  const toggleMode = () => {
    if (mode === ModeOption.Float) {
      onModeChange(ModeOption.Uint8);
      return;
    }
    if (mode === ModeOption.Uint8) {
      onModeChange(ModeOption.Int8);
      return;
    }
    onModeChange(ModeOption.Float);
  };

  const rotateSampleRate = () => {
    onSampleRateChange(findNextPresetSampleRate(sampleRate));
  };

  const canPlay =
    !isPlaying && (!expression.trim() || !!validateExpression(expression.trim()).issues);

  return (
    <div className="focus-footer px-12 py-8 flex-row align-items-center justify-content-between">
      <div className="chips flex-row gap-10">
        <label className="flex-row gap-10 smaller align-items-center">
          <span className="sm-hidden">Mode</span>
          <button type="button" className="chip" onClick={toggleMode}>
            {mode}
          </button>
        </label>
        <label className="flex-row gap-10 smaller align-items-center">
          <span className="sm-hidden">Sample rate</span>
          <button type="button" className="chip" onClick={rotateSampleRate}>
            {formatSampleRate(sampleRate)}
          </button>
        </label>
      </div>

      <div className="flex-row gap-10 align-items-center">
        <button
          type="button"
          className={`transport-button play ${isPlaying ? 'playing' : 'pause'}`}
          disabled={!isPlaying && !canPlay}
          onClick={onPlayClick}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={liveUpdateEnabled}
            onChange={(e) => onLiveUpdateChange(e.target.checked)}
          />{' '}
          <span className="sm-hidden">Live update</span>
          <span className="sm-only">Live</span>
        </label>
      </div>

      <div className="flex-row gap-10 align-items-center">
        {isLoggedIn && (
          <span className={isExpressionTooLong ? 'counter error' : 'counter'}>
            {expressionLength}
            <span className="sm-hidden">&nbsp;/&nbsp;{EXPRESSION_MAX}</span>
          </span>
        )}

        {isLoggedIn ? (
          <button
            type="button"
            className="button primary sm-hidden"
            onClick={onPublish}
            disabled={!canSubmit}
          >
            Publish…
          </button>
        ) : (
          <button
            type="button"
            className="button secondary ghost"
            onClick={handleCopyShareLink}
            disabled={!expression.trim()}
          >
            {shareLinkCopied ? 'Link copied' : 'Copy share link'}
          </button>
        )}

        <VolumeButton
          masterGain={masterGain}
          onMasterGainChange={onMasterGainChange}
          rightAligned={true}
        />
      </div>
    </div>
  );
}

export function FocusLayout({
  children,
  expression = '',
  mode = ModeOption.Uint8,
  onModeChange = () => {},
  sampleRate = DEFAULT_SAMPLE_RATE,
  onSampleRateChange = () => {},
  isPlaying = false,
  onPlayClick = () => {},
  liveUpdateEnabled = true,
  onLiveUpdateChange = () => {},
  onPublish = () => {},
  isLoggedIn = false,
  username = undefined,
  title = '',
  onTitleChange = () => {},
  onExitFocusMode,
  runtimeError = null,
}: FocusLayoutProps) {
  const router = useRouter();
  const [showErrorPanel, setShowErrorPanel] = useState(false);

  const handleExitFocusMode = () => {
    if (onExitFocusMode) {
      onExitFocusMode();
    } else {
      // Default behavior: go to /create
      void router.push('/create');
    }
  };
  const { theme } = useTheme();
  const { masterGain, setMasterGain } = useBytebeatPlayer();
  useAudioWarmup();

  const handleModeChange = (newMode: ModeOption) => {
    onModeChange(newMode);
  };

  const handleSampleRateChange = (newRate: number) => {
    onSampleRateChange(newRate);
  };

  const handleLiveUpdateChange = (enabled: boolean) => {
    onLiveUpdateChange(enabled);
  };

  const handlePlayClick = () => {
    onPlayClick();
  };

  const handlePublish = () => {
    onPublish();
  };

  return (
    <ThemeContext.Provider value={theme ?? DEFAULT_THEME_ID}>
      <div className="root">
        <FocusHeader
          isLoggedIn={isLoggedIn}
          username={username}
          onExitFocusMode={handleExitFocusMode}
          title={title}
          onTitleChange={onTitleChange}
        />
        <div className="top-content">{children}</div>
        {runtimeError && showErrorPanel && (
          <div
            className="focus-runtime-panel px-12 py-8 flex-row align-items-center"
            role="alert"
            aria-live="assertive"
          >
            <p className="focus-runtime-panel-message flex-grow">{runtimeError}</p>
            <button className="button small ghost" onClick={() => setShowErrorPanel(false)}>
              ✕
            </button>
          </div>
        )}

        {runtimeError && !showErrorPanel && (
          <button className="focus-error-bubble" onClick={() => setShowErrorPanel(true)}>
            !
          </button>
        )}
        <FocusFooter
          expression={expression}
          mode={mode}
          onModeChange={handleModeChange}
          sampleRate={sampleRate}
          onSampleRateChange={handleSampleRateChange}
          isPlaying={isPlaying}
          onPlayClick={handlePlayClick}
          liveUpdateEnabled={liveUpdateEnabled}
          onLiveUpdateChange={handleLiveUpdateChange}
          onPublish={handlePublish}
          masterGain={masterGain}
          onMasterGainChange={setMasterGain}
          isLoggedIn={isLoggedIn}
          title={title}
        />
      </div>
    </ThemeContext.Provider>
  );
}
