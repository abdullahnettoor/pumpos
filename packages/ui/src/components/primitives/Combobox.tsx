import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

/**
 * Above the drawer surface (1001) but below toasts (1100), so a picker opened
 * inside a drawer sits over its own surface without covering an alert.
 */
const POPUP_Z_INDEX = 1050;
const POPUP_GAP = 4;
/** Search field + a few rows: enough to decide whether the panel must flip up. */
const MIN_POPUP_HEIGHT = 200;

interface PopupRect {
  left: number;
  width: number;
  /** Offset from the viewport top when it opens downwards; the panel is `fixed`. */
  top?: number;
  /** Offset from the viewport bottom when it flipped above the trigger. */
  bottom?: number;
  flipped: boolean;
}

function measure(trigger: HTMLElement): PopupRect {
  const rect = trigger.getBoundingClientRect();
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const below = viewportHeight - rect.bottom - POPUP_GAP;
  const above = rect.top - POPUP_GAP;
  // Flip only when below genuinely cannot hold the panel AND above is roomier —
  // otherwise a picker near the bottom of a tall page would jump around.
  const flipped = below < MIN_POPUP_HEIGHT && above > below;
  return {
    left: rect.left,
    width: rect.width,
    // Anchoring the flipped panel by its bottom edge means its height never has
    // to be known in advance; it grows upwards from the trigger.
    ...(flipped
      ? { bottom: viewportHeight - rect.top + POPUP_GAP }
      : { top: rect.bottom + POPUP_GAP }),
    flipped,
  };
}

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional secondary line shown under the label (e.g. code / balance). */
  sublabel?: string;
}

/** An action (e.g. “＋ New customer”) shown only when the search has no matches. */
export interface ComboboxCreateAction {
  label: string;
  sublabel?: string;
  onSelect: () => void;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Create actions surfaced only when no option matches — keeps the list tidy. */
  createActions?: ComboboxCreateAction[];
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}

/**
 * Searchable single-select for long dynamic lists (customers, products,
 * suppliers) where a native `<select>` offers no type-ahead. Keyboard
 * accessible (↑/↓ to move, Enter to pick, Esc to close) and closes on outside
 * click. Controlled via `value` / `onChange`; wire into React Hook Form with a
 * `Controller`. Use a native `<Select>` for short fixed lists instead.
 *
 * The popup is rendered in a portal at the document root and positioned against
 * the trigger's measured rect: as an absolutely-positioned child it was cropped
 * by any ancestor that clips (a Panel, a drawer body, a scroll container), and
 * no `z-index` could rescue it from inside the clipped box. Because the popup is
 * no longer a DOM descendant of the field, "inside" for outside-click purposes
 * means *either* the wrapper or the portalled panel.
 */
export const Combobox: React.FC<ComboboxProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
  createActions,
  disabled,
  invalid,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<PopupRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
    );
  }, [options, query]);

  const reposition = useCallback(() => {
    if (wrapRef.current) setRect(measure(wrapRef.current));
  }, []);

  // Measure before paint so the panel never flashes at the wrong place.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inside =
        wrapRef.current?.contains(target) || popupRef.current?.contains(target) || false;
      if (!inside) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // A fixed panel does not travel with a scrolling ancestor, so follow the
    // trigger instead (capture phase catches scrolls of any container).
    const onScroll = () => reposition();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEscape);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, reposition]);

  /**
   * Opening is an event, not a state change to react to, so the panel is primed
   * here rather than in an effect. Note the highlight is resolved against
   * `options` and not `filtered`: the query is being cleared in the same breath,
   * so the full list is what the reopened panel actually shows.
   */
  const toggleOpen = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    setQuery('');
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx === -1 ? 0 : idx);
    // Focus the search field once the panel has been painted.
    requestAnimationFrame(() => inputRef.current?.focus());
    setOpen(true);
  };

  /** Typing re-filters the list, so the highlight returns to the first match. */
  const onQueryChange = (next: string) => {
    setQuery(next);
    setActiveIndex(0);
  };

  const commit = (opt: ComboboxOption) => {
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) commit(opt);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        className={cx('input', invalid && 'input-invalid')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selected ? 'var(--text-strong)' : 'var(--text-faint)',
          }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, color: 'var(--text-muted)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popupRef}
            data-testid="combobox-popup"
            data-placement={rect?.flipped ? 'top' : 'bottom'}
            style={{
              position: 'fixed',
              left: rect?.left ?? 0,
              width: rect?.width,
              ...(rect?.bottom !== undefined ? { bottom: rect.bottom } : { top: rect?.top ?? 0 }),
              zIndex: POPUP_Z_INDEX,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-card)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 6, borderBottom: '1px solid var(--border-soft)' }}>
              <input
                ref={inputRef}
                className="input input-compact"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </div>
            <ul
              ref={listRef}
              role="listbox"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 4,
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {filtered.length === 0 ? (
                <>
                  <li style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {emptyMessage}
                  </li>
                  {createActions?.map((a, i) => (
                    <li
                      key={`__create_${i}`}
                      role="option"
                      aria-selected={false}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        a.onSelect();
                        setOpen(false);
                      }}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-input)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      <span
                        style={{ fontSize: 13, color: 'var(--brand-primary)', fontWeight: 600 }}
                      >
                        {a.label}
                      </span>
                      {a.sublabel && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {a.sublabel}
                        </span>
                      )}
                    </li>
                  ))}
                </>
              ) : (
                filtered.map((opt, i) => {
                  const active = i === activeIndex;
                  const isSelected = opt.value === value;
                  return (
                    <li
                      key={opt.value || `__${i}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        commit(opt);
                      }}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-input)',
                        cursor: 'pointer',
                        backgroundColor: active ? 'var(--bg-surface-alt)' : 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: 'var(--text-strong)',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {opt.label}
                      </span>
                      {opt.sublabel && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {opt.sublabel}
                        </span>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
};
