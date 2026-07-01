import React, { useId, useState } from 'react';

export interface TooltipProps {
  /** Text shown in the floating bubble. */
  content: React.ReactNode;
  placement?: 'top' | 'bottom';
  children: React.ReactElement;
}

/**
 * Lightweight hover / focus tooltip. Wrap a single interactive element; the
 * bubble appears above (default) or below on hover and keyboard focus, and is
 * wired via `aria-describedby` for screen readers. Prefer this over bare
 * `title=""` attributes for anything the user needs to read.
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, placement = 'top', children }) => {
  const [open, setOpen] = useState(false);
  const id = useId();

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  const vertical = placement === 'top'
    ? { bottom: 'calc(100% + 6px)' }
    : { top: 'calc(100% + 6px)' };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {React.cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            ...vertical,
            zIndex: 60,
            whiteSpace: 'nowrap',
            backgroundColor: 'var(--text-strong)',
            color: 'var(--bg-surface)',
            fontSize: '11px',
            fontWeight: 500,
            lineHeight: 1.4,
            padding: '4px 8px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
};
