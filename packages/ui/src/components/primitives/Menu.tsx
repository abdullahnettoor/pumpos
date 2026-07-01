import React, { useEffect, useRef, useState } from 'react';

const panelStyle = (align: 'left' | 'right'): React.CSSProperties => ({
  position: 'absolute',
  top: 'calc(100% + 6px)',
  [align]: 0,
  zIndex: 50,
  minWidth: 180,
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-card)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  padding: 'var(--space-1)',
});

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export interface PopoverProps {
  /** Rendered inside the trigger button. */
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  /** Class for the trigger button; defaults to a secondary small button. */
  buttonClassName?: string;
}

/**
 * A floating panel anchored to a trigger button. Closes on outside click or Esc.
 * Use for filter panels, column pickers, and anything richer than a menu list.
 */
export const Popover: React.FC<PopoverProps> = ({ trigger, children, align = 'left', buttonClassName }) => {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={buttonClassName ?? 'btn btn-secondary btn-sm'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && <div role="dialog" style={panelStyle(align)}>{children}</div>}
    </div>
  );
};

export interface MenuItem {
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  buttonClassName?: string;
}

/**
 * Dropdown action menu — a trigger button plus a list of selectable items.
 * Closes on select, outside click, or Esc. Use for row / entity actions
 * (edit, archive, delete) instead of crowding the row with buttons.
 */
export const Menu: React.FC<MenuProps> = ({ trigger, items, align = 'left', buttonClassName }) => {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={buttonClassName ?? 'btn btn-secondary btn-sm'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div role="menu" style={panelStyle(align)}>
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect?.();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                fontSize: '13px',
                fontFamily: 'var(--font-sans)',
                color: item.disabled ? 'var(--text-faint)' : item.danger ? 'var(--state-danger-fg)' : 'var(--text-default)',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-input)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.backgroundColor = 'var(--bg-surface-alt)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {item.icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
