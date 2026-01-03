import { PropsWithChildren, useState, useEffect } from 'react';
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

function FocusHeader({ isLoggedIn, username, onExitFocusMode }: { isLoggedIn: boolean, username?: string | null, onExitFocusMode: () => void }) {
  
  return (
    <>
      <div className='focus-header px-12 py-8 flex-row align-items-center justify-content-space-between'>
          <h1>Create • Focus</h1>

          <span className="secondary-text">
            {!isLoggedIn ? (
              <>
                <a href={'/login'}>Sign in</a> to publish.
              </>
            ) : (<span>@{username}</span>)}
          </span>

          <TooltipHint
            storageKey="exit-focus-mode"
            content="Return to the standard view."
            placement="bottom"
          >
            <button className="button secondary small ghost" onClick={onExitFocusMode} title='Exit focus mode (Ctrl+Shift+F)'>
              ⛶ Exit focus mode
            </button>
          </TooltipHint>
        </div>
    </>
  )
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
  onExitFocusMode?: () => void;
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

  const canPlay = !isPlaying && (!expression.trim() || !!validateExpression(expression.trim()).issues);

  return (
    <div className="focus-footer px-12 py-8 flex-row align-items-center justify-content-between">
        <div className="chips flex-row gap-10">
          <label className="flex-row gap-10 smaller align-items-center" style={{minWidth: '90px'}}>
            Mode
            <button type="button" className="chip" onClick={toggleMode}>
              {mode}
            </button>
          </label>
          <label className="flex-row gap-10 smaller align-items-center" style={{minWidth: '160px'}}>
            Sample rate
            <button
              type="button"
              className="chip"
              onClick={rotateSampleRate}
            >
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
          Live update
        </label>

      </div>

      <div className="flex-row gap-10 align-items-center">
        {isLoggedIn && (
          <span className={isExpressionTooLong ? 'counter error' : 'counter'}>
            {expressionLength} / {EXPRESSION_MAX}
          </span>
        )}

        {isLoggedIn ? (
          <button
            type="button"
            className="button primary"
            onClick={onPublish}
            disabled={!canSubmit}
          >
            Publish
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
  onExitFocusMode,
}: FocusLayoutProps) {
  const router = useRouter();
  
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
        <FocusHeader isLoggedIn={isLoggedIn} username={username} onExitFocusMode={handleExitFocusMode} />
        <div className="top-content">
          {children}
        </div>
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
