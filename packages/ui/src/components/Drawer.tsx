import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthVariant?: 'default' | 'wide';
}

// Tracks the stack of currently-open drawers so that pressing Escape only
// dismisses the topmost one (drawers can be nested, e.g. an inline "New
// customer" drawer opened from within the handover drawer).
const escapeStack: symbol[] = [];

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  widthVariant = 'default',
}) => {
  const idRef = useRef<symbol>(Symbol('drawer'));
  useEffect(() => {
    if (!isOpen) return;
    const id = idRef.current;
    escapeStack.push(id);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escapeStack[escapeStack.length - 1] === id) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const i = escapeStack.lastIndexOf(id);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="drawer-backdrop" onClick={onClose} />

      {/* Drawer Canvas */}
      <div className={`drawer-container${widthVariant === 'wide' ? ' drawer-container--wide' : ''}`}>
        {/* Header */}
        <div className="drawer-header">
          <span className="drawer-title">{title}</span>
          <button onClick={onClose} className="drawer-close-btn" aria-label="Close Drawer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="drawer-body">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="drawer-footer">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body
  );
};
