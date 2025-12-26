import { PullToRefreshState } from '../hooks/usePullToRefresh';

interface PullToRefreshIndicatorProps {
  pullState: PullToRefreshState;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullState,
  threshold = 100,
}: Readonly<PullToRefreshIndicatorProps>) {
  const { isPulling, pullDistance, isRefreshing, canRelease } = pullState;

  if (!isPulling && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;
  const scale = Math.min(0.5 + progress * 0.5, 1);
  // Ensure opacity is visible from the start (min 0.6) and reaches 1 at 50% progress
  const opacity = isRefreshing ? 1 : Math.min(0.6 + progress * 0.4, 1);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes ptr-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          pointerEvents: 'none',
          transition: isPulling ? 'none' : 'opacity 0.3s ease, transform 0.3s ease',
          opacity: isPulling || isRefreshing ? opacity : 0,
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: 'var(--chip-background-color)',
            border: '2px solid var(--accent-color)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: isPulling ? 'none' : 'transform 0.3s ease',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: canRelease ? 'var(--accent-color)' : 'var(--secondary-text-color)',
              animation: isRefreshing ? 'ptr-spin 1s linear infinite' : 'none',
            }}
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </div>
        {canRelease && !isRefreshing && (
          <div
            style={{
              position: 'absolute',
              top: '50px',
              left: '50%',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              fontSize: '12px',
              color: 'var(--secondary-text-color)',
              fontWeight: '500',
            }}
          >
            Release to refresh
          </div>
        )}
      </div>
    </>
  );
}
