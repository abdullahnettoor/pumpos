import React, { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';

export interface InfoTipProps {
  /** The explanation shown in the bubble. May wrap over several lines. */
  children: React.ReactNode;
  /** Accessible name for the icon button, e.g. "About customer sales". */
  label: string;
  placement?: 'top' | 'bottom';
}

/**
 * An (i) icon that reveals helper text, so long explainers don't push a form
 * down (#303). Unlike `Tooltip` it works without a mouse: it opens on hover and
 * keyboard focus, a tap/click toggles it (touch screens have no hover), and
 * Escape or a click outside closes it. The text wraps, so it suits a paragraph.
 */
export const InfoTip: React.FC<InfoTipProps> = ({ children, label, placement = 'bottom' }) => {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  // Close a tapped-open tip when the operator taps elsewhere or presses Escape.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pinned]);

  const vertical =
    placement === 'top' ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' };

  return (
    <span
      ref={rootRef}
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setPinned(false);
            setFocused(false);
            setHovered(false);
          }
        }}
        style={{
          display: 'inline-flex',
          padding: 2,
          border: 'none',
          background: 'none',
          color: 'var(--text-faint)',
          cursor: 'pointer',
          borderRadius: '50%',
        }}
      >
        <Info size={13} aria-hidden="true" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            left: 0,
            ...vertical,
            zIndex: 60,
            width: 'max-content',
            maxWidth: 280,
            whiteSpace: 'normal',
            textTransform: 'none',
            letterSpacing: 'normal',
            backgroundColor: 'var(--text-strong)',
            color: 'var(--bg-surface)',
            fontSize: '11px',
            fontWeight: 400,
            lineHeight: 1.45,
            padding: '8px 10px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
};
