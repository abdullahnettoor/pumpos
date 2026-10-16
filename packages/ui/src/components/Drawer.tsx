import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../pump-ds/index.js';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Pinned below the body (actions); the body scrolls, the footer does not. */
  footer?: React.ReactNode;
  /** `xwide` fits an editor beside a preview (e.g. report templates). */
  widthVariant?: 'default' | 'wide' | 'xwide';
  /** An exact width in px (capped to the window); overrides `widthVariant`. */
  width?: number;
  /** Shown before the title. */
  icon?: React.ReactNode;
  /** A muted line under the title. */
  subtitle?: React.ReactNode;
  /**
   * The children lay out the body themselves (no padding, no scroll): for a
   * drawer whose body splits into a scrolling form and a fixed strip or pane.
   */
  flushBody?: boolean;
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
  width,
  icon,
  subtitle,
  flushBody = false,
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
      <div
        className={`drawer-container${widthVariant === 'default' ? '' : ` drawer-container--${widthVariant}`}`}
        style={width ? { maxWidth: `min(${width}px, 96vw)` } : undefined}
      >
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-heading">
            {icon && <span className="drawer-heading-icon">{icon}</span>}
            <div className="drawer-heading-text">
              <span className="drawer-title">{title}</span>
              {subtitle && <span className="drawer-subtitle">{subtitle}</span>}
            </div>
          </div>
          <button onClick={onClose} className="drawer-close-btn" aria-label="Close drawer">
            <Icon name="x" size="md" />
          </button>
        </div>

        {/* Body */}
        <div className={flushBody ? 'drawer-body drawer-body--flush' : 'drawer-body'}>
          {children}
        </div>

        {/* Footer */}
        {footer && <div className="drawer-footer">{footer}</div>}
      </div>
    </>,
    document.body,
  );
};
