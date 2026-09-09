import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEventHandler } from 'react';
import type { TextmodeProgram } from '../model/textmode';

interface TextmodePlayerProps {
  program: TextmodeProgram;
  isActive: boolean;
  onTogglePlay: () => void | Promise<void>;
  height?: number;
  onError?: (message: string) => void;
  hideOverlay?: boolean;
}

export const TEXTMODE_DEFAULT_MAX_HEIGHT = 800;

export function getTextmodeAspectRatio(program: Pick<TextmodeProgram, 'cols' | 'rows'>): number {
  return (program.cols * 0.6) / (program.rows * 1.1);
}

function getSandboxSrc(): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ? `/${process.env.NEXT_PUBLIC_BASE_PATH}` : '';
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
  return `${basePath}/textmode-sandbox.html${version ? `?v=${version}` : ''}`;
}

export function TextmodePlayer({
  program,
  isActive,
  onTogglePlay,
  height,
  onError,
  hideOverlay,
}: Readonly<TextmodePlayerProps>) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const sandboxSrc = useMemo(() => getSandboxSrc(), []);
  const aspectRatio = getTextmodeAspectRatio(program);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setContainerWidth(el.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!onError) return;

    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'error') {
        onError(String(event.data.message || 'Unknown error'));
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onError]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !iframeLoaded) return;

    win.postMessage(
      {
        type: isActive ? 'run' : 'seed',
        code: program.code,
        fps: program.fps,
        cols: program.cols,
        rows: program.rows,
      },
      '*',
    );
  }, [isActive, iframeLoaded, program.code, program.fps, program.cols, program.rows]);

  const handleClick = () => {
    void onTogglePlay();
  };

  const handleButtonClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    void onTogglePlay();
  };

  const maxHeight = height ?? TEXTMODE_DEFAULT_MAX_HEIGHT;
  let frameWidth = containerWidth;
  let frameHeight = containerWidth / aspectRatio;
  if (frameHeight > maxHeight) {
    frameHeight = maxHeight;
    frameWidth = maxHeight * aspectRatio;
  }

  return (
    <div className="textmode-visualizer" ref={containerRef} onClick={handleClick}>
      <iframe
        ref={iframeRef}
        title="Textmode visualizer"
        src={sandboxSrc}
        sandbox="allow-scripts"
        className="textmode-visualizer-frame"
        style={containerWidth ? { width: frameWidth, height: frameHeight } : undefined}
        onLoad={() => setIframeLoaded(true)}
      />
      {/* Clicks inside the iframe don't bubble to this document, so this layer catches them */}
      <div className="textmode-visualizer-hit-area" aria-hidden="true" />
      {!isActive && !hideOverlay && (
        <div className="post-expression-overlay" aria-hidden="true">
          <button type="button" className="post-expression-play-button" onClick={handleButtonClick}>
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
