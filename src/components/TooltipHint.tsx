import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TooltipHintProps {
  children: React.ReactNode;
  content: string;
  storageKey: string;
  className?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export function TooltipHint({
  children,
  content,
  storageKey,
  className = '',
  placement = 'top',
}: TooltipHintProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Check if hint should be shown
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const dismissed = localStorage.getItem(`hint-dismissed-${storageKey}`);
    if (!dismissed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldShow(true);
      // Show tooltip after a short delay
      setTimeout(() => setIsVisible(true), 1000);
    }
  }, [storageKey]);

  // Calculate tooltip position
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - 8;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + 8;
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left - tooltipRect.width - 8;
        break;
      case 'right':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + 8;
        break;
    }

    // Ensure tooltip stays within viewport
    const padding = 8;
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

    setPosition({ top, left });
  }, [placement]);

  // Update position when tooltip becomes visible
  useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isVisible, updatePosition]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`hint-dismissed-${storageKey}`, 'true');
    }
  };

  const handleTriggerClick = () => {
    // Dismiss the hint if it's visible
    if (isVisible) {
      handleDismiss();
    }
    // Let the original click handler propagate
  };

  if (!shouldShow) {
    return <>{children}</>;
  }

  return (
    <>
      <div ref={triggerRef} className={className} onClick={handleTriggerClick}>
        {children}
      </div>

      {isVisible &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            className="tooltip-hint"
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              zIndex: 10000,
              backgroundColor: '#1f2937',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '14px',
              maxWidth: '250px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
              animation: 'tooltipFadeIn 0.2s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ flex: 1, lineHeight: '1.4', fontSize: 'small' }}>{content}</span>
              <button
                onClick={handleDismiss}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '0',
                  fontSize: '16px',
                  lineHeight: '1',
                  opacity: '0.7',
                  transition: 'opacity 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '0.7')}
                aria-label="Dismiss hint"
              >
                ×
              </button>
            </div>
            <div
              style={{
                position: 'absolute',
                width: '0',
                height: '0',
                border: '4px solid transparent',
                ...(placement === 'top' && {
                  bottom: '-8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  borderTopColor: '#1f2937',
                }),
                ...(placement === 'bottom' && {
                  top: '-8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  borderBottomColor: '#1f2937',
                }),
                ...(placement === 'left' && {
                  right: '-8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  borderLeftColor: '#1f2937',
                }),
                ...(placement === 'right' && {
                  left: '-8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  borderRightColor: '#1f2937',
                }),
              }}
            />
          </div>,
          document.body,
        )}

      <style jsx>{`
        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
