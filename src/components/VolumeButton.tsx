interface VolumeButtonProps {
  masterGain: number;
  onMasterGainChange: (gain: number) => void;
  className?: string;
  rightAligned?: boolean;
}

export function VolumeButton({
  masterGain,
  onMasterGainChange,
  className = '',
  rightAligned = false,
}: VolumeButtonProps) {
  return (
    <div className={`footer-volume ${className}`}>
      <button type="button" className="volume-button" aria-label="Master volume">
        {masterGain > 0 ? (
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ height: '100%' }}>
            <rect x="1" y="18" width="22" height="29" rx="2" fill="currentColor" />
            <path
              d="M14 23.9613C14 23.3537 14.2762 22.7791 14.7506 22.3995L35.7506 5.59951C37.0601 4.55189 39 5.48424 39 7.16125V57.8387C39 59.5158 37.0601 60.4481 35.7506 59.4005L14.7506 42.6005C14.2762 42.2209 14 41.6463 14 41.0387V23.9613Z"
              fill="currentColor"
            />
            <line
              x1="48"
              y1="20"
              x2="48"
              y2="44"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {masterGain > 0.7 && (
              <line
                x1="59"
                y1="11"
                x2="59"
                y2="53"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
              />
            )}
          </svg>
        ) : (
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ height: '100%' }}>
            <rect x="1" y="18" width="22" height="29" rx="2" fill="currentColor" />
            <path
              d="M14 23.9613C14 23.3537 14.2762 22.7791 14.7506 22.3995L35.7506 5.59951C37.0601 4.55189 39 5.48424 39 7.16125V57.8387C39 59.5158 37.0601 60.4481 35.7506 59.4005L14.7506 42.6005C14.2762 42.2209 14 41.6463 14 41.0387V23.9613Z"
              fill="currentColor"
            />
            <line
              x1="60"
              y1="26.2426"
              x2="46.2426"
              y2="40"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <line
              x1="3"
              y1="-3"
              x2="22.4558"
              y2="-3"
              transform="matrix(-0.707107 -0.707107 -0.707107 0.707107 60 44)"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
      <div className="volume-slider-backdrop" style={{ left: rightAligned ? '-175%' : '50%' }}>
        <div className="volume-slider-container">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterGain}
            onChange={(e) => onMasterGainChange(Number(e.target.value))}
            onTouchStart={e => e.stopPropagation()}
            className="volume-slider"
          />
        </div>
      </div>
    </div>
  );
}
