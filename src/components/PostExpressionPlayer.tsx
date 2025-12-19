import type { MouseEventHandler } from 'react';
import { ReadonlyExpression } from './ExpressionEditor';

interface PostExpressionPlayerProps {
  expression: string;
  isActive: boolean;
  onTogglePlay: () => void | Promise<void>;
  height?: number;
  disableCopy?: boolean;
  skipMinification?: boolean;
}

export function PostExpressionPlayer({
  expression,
  isActive,
  onTogglePlay,
  height,
  disableCopy,
  skipMinification,
}: PostExpressionPlayerProps) {
  const handleClick = () => {
    void onTogglePlay();
  };

  const handleButtonClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    void onTogglePlay();
  };

  return (
    <div
      className="post-expression"
      onClick={handleClick}
      style={
        height
          ? {
              maxHeight: `${height}px`,
              overflow: 'hidden',
            }
          : {}
      }
    >
      <ReadonlyExpression expression={expression} disableCopy={disableCopy} skipMinification={skipMinification} />
      {!isActive && (
        <div className="post-expression-overlay" aria-hidden="true">
          <button type="button" className="post-expression-play-button" onClick={handleButtonClick}>
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
