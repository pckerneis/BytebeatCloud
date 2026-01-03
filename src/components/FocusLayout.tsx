import { PropsWithChildren } from 'react';
import { useTheme } from '../hooks/useTheme';
import { DEFAULT_THEME_ID } from '../theme/themes';
import { ThemeContext } from '../theme/ThemeContext';
import useAudioWarmup from '../hooks/useAudioWarmup';
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

function FocusHeader() {
  return (
    <div className='focus-header px-12 py-8 flex-row align-items-center'>
      <h1>Create</h1>
      <button className="button secondary small ml-auto">
        Exit focus mode
      </button>
    </div>
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

interface FocusLayoutProps extends Readonly<PropsWithChildren> {
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
}) {
  const expressionLength = expression.length;
  const isExpressionTooLong = expressionLength > EXPRESSION_MAX;
  const canSubmit = Boolean(expression.trim()) && !validateExpression(expression.trim()).issues;

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
          className="button primary small"
          disabled={!isPlaying && !canPlay}
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

      </div>

      <div className="flex-row gap-10 align-items-center">
        <span className={isExpressionTooLong ? 'counter error' : 'counter'}>
          {expressionLength} / {EXPRESSION_MAX}
        </span>

        <button
          type="button"
          className="button primary"
          onClick={onPublish}
          disabled={!canSubmit}
        >
          Publish
        </button>

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
}: FocusLayoutProps) {
  const { theme } = useTheme();
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
    if (onPublish) {
      onPublish();
    } else {
      // TODO: Implement publish functionality
      console.log('Publish clicked');
    }
  };

  return (
    <ThemeContext.Provider value={theme ?? DEFAULT_THEME_ID}>
      <div className="root">
        <FocusHeader />
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
        />
      </div>
    </ThemeContext.Provider>
  );
}
