import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from './backStack.js';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  /**
   * Where focus goes on close when the element that opened the sheet is gone
   * (the screen under it remounted). Return null to leave focus alone.
   */
  fallbackFocus?: () => HTMLElement | null;
  /**
   * Whether the sheet takes a layer of its own in the system back gesture (the
   * default: back closes it). A sheet that is a guard's prompt turns this off:
   * the gesture reaches the guard, which decides.
   */
  backLayer?: boolean;
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Make every other top-level node of the page inert; returns the undo. */
function inertBackground(layer: HTMLElement): () => void {
  const changed: Element[] = [];
  for (const el of Array.from(document.body.children)) {
    if (el === layer || el.tagName === 'SCRIPT' || el.hasAttribute('inert')) continue;
    el.setAttribute('inert', '');
    changed.push(el);
  }
  return () => changed.forEach((el) => el.removeAttribute('inert'));
}

const isUsable = (el: HTMLElement | null): el is HTMLElement =>
  !!el && el.isConnected && !el.closest('[aria-hidden="true"], [inert]');

const SheetLayer: React.FC<Omit<Props, 'open' | 'backLayer'>> = ({
  onClose,
  label,
  fallbackFocus,
  children,
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef(fallbackFocus);
  useLayoutEffect(() => {
    fallbackRef.current = fallbackFocus;
  });

  useEffect(() => {
    const layer = layerRef.current!;
    const previous = document.activeElement as HTMLElement | null;
    const restoreBackground = inertBackground(layer);
    sheetRef.current?.focus();

    // Inert already blocks the background; this also holds where `inert` is unsupported.
    const keepFocusInside = (e: FocusEvent) => {
      if (e.target instanceof Node && !layer.contains(e.target)) sheetRef.current?.focus();
    };
    document.addEventListener('focusin', keepFocusInside);

    return () => {
      document.removeEventListener('focusin', keepFocusInside);
      restoreBackground(); // an inert node cannot take focus, so undo first
      // The opener may be gone (a station switch remounts the screen under the sheet).
      const target = isUsable(previous) ? previous : (fallbackRef.current?.() ?? null);
      target?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const sheet = sheetRef.current!;
    const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      sheet.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (e.shiftKey && (current === first || current === sheet)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && current === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={layerRef} className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="no-scrollbar absolute inset-x-0 bottom-0 max-h-[88%] overflow-y-auto rounded-t-[26px] border-t border-line bg-background pt-2 shadow-sheet outline-none"
        style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 mt-0.5 h-[5px] w-[38px] rounded-full bg-line-strong" />
        {children}
      </div>
    </div>
  );
};

/**
 * Modal bottom sheet. Mounts its content only while open, so data hooks inside
 * fetch on open. Closes on the scrim, Escape and the system back gesture.
 * While open it traps focus and makes the rest of the page inert, and on close
 * it returns focus to what opened it (or `fallbackFocus` if that is gone).
 * Rendered into `document.body` so the page behind can be made inert as a whole.
 */
export const BottomSheet: React.FC<Props> = ({ open, onClose, backLayer = true, ...rest }) => {
  useBackLayer(open && backLayer, onClose);
  if (!open) return null;
  return createPortal(<SheetLayer onClose={onClose} {...rest} />, document.body);
};
