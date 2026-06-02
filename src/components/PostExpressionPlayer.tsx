import { useEffect, useRef, useState, type MouseEventHandler } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCropped, setIsCropped] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !height) return;
    const observer = new ResizeObserver(() => {
      setIsCropped(el.scrollHeight > el.clientHeight);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      setIsCropped(false);
    };
  }, [height]);

  const handleClick = () => {
    void onTogglePlay();
  };

  const handleButtonClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    void onTogglePlay();
  };

  return (
    <div
      ref={containerRef}
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
      <ReadonlyExpression
        expression={expression}
        disableCopy={disableCopy}
        skipMinification={skipMinification}
      />
      {isCropped && <div className="post-expression-crop-fade" aria-hidden="true" />}
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
