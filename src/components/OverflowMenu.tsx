import { useState, useRef, useEffect } from 'react';

interface OverflowMenuProps {
  children: React.ReactNode;
  disabled?: boolean;
}

export default function OverflowMenu({ children, disabled = false }: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && menuRef.current && dropdownRef.current) {
      const triggerRect = menuRef.current.getBoundingClientRect();
      const dropdownRect = dropdownRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let top = triggerRect.bottom + 4;
      let right = viewportWidth - triggerRect.right;

      if (top + dropdownRect.height > viewportHeight) {
        top = triggerRect.top - dropdownRect.height - 4;
      }

      if (top < 0) {
        top = 4;
      }

      if (right < 0) {
        right = 4;
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosition({ top, right });
    }
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="overflow-menu" ref={menuRef}>
      <button
        type="button"
        className="overflow-menu-trigger"
        onClick={handleToggle}
        disabled={disabled}
        aria-label="More actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {isOpen && (
        <div
          ref={dropdownRef}
          className="overflow-menu-dropdown"
          style={{ top: `${position.top}px`, right: `${position.right}px` }}
          onClick={() => setIsOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
