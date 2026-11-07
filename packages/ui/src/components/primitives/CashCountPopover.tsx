import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../pump-ds/lib/cn.js';
import { createPortal } from 'react-dom';
import { Calculator } from 'lucide-react';
import { Button } from '../../pump-ds/button/index.js';
import { inr } from '../../utils/format.js';

/** Counts keyed by denomination value as a string, e.g. `{ "500": 12, "100": 8 }`. */
export type CashBreakdown = Record<string, number>;

export interface CashCountPopoverProps {
  /**
   * Controlled denomination counts. Held by the PARENT (not this component) so
   * re-opening the popover — or navigating away and back within the same
   * session — preserves the counts. Phase-1 is UI-only; when a backend store is
   * added later this same object is what gets persisted (no rewrite).
   */
  breakdown: CashBreakdown;
  onBreakdownChange: (next: CashBreakdown) => void;
  /** Apply the counted total into the linked cash field. */
  onApply: (total: number) => void;
  /** Current value in the linked field, used only to flag a manual mismatch. */
  currentValue?: number;
  /** Denominations (₹), high → low. Defaults to the standard Indian set. */
  denominations?: number[];
  disabled?: boolean;
  /** Accessible label + tooltip for the trigger. */
  title?: string;
  /**
   * Checks a count as typed; returns the message to show, or null when it is
   * a valid count. With it, a refused count (a fraction, a negative) shows an
   * inline error, is not counted and holds Apply, instead of being silently
   * floored. Without it, counts are floored to whole notes as before.
   */
  validateCount?: (raw: string) => string | null;
}

const DEFAULT_DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
const PANEL_W = 272;

const sumBreakdown = (denoms: number[], b: CashBreakdown) =>
  denoms.reduce((s, d) => s + d * (Number(b[String(d)]) || 0), 0);

/**
 * A compact icon button that opens a floating panel for counting physical cash
 * by denomination; the running total can be applied into an adjacent cash input.
 *
 * Rendered in a portal with fixed positioning so it never clips inside a
 * scrollable drawer (the legacy absolute-positioned Popover does). Closes on
 * outside-click or Esc.
 */
export const CashCountPopover: React.FC<CashCountPopoverProps> = ({
  breakdown,
  onBreakdownChange,
  onApply,
  currentValue,
  denominations = DEFAULT_DENOMS,
  disabled = false,
  title = 'Count cash by denomination',
  validateCount,
}) => {
  // What was typed in a row whose count was refused (kept so it can be fixed).
  const [refused, setRefused] = useState<Record<string, { raw: string; message: string }>>({});
  const hasRefused = Object.keys(refused).length > 0;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const total = sumBreakdown(denominations, breakdown);
  const countedCount = denominations.reduce((s, d) => s + (Number(breakdown[String(d)]) || 0), 0);
  const hasManualMismatch =
    currentValue != null &&
    Math.round(currentValue) !== Math.round(total) &&
    (currentValue > 0 || total > 0);

  const compute = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const placement: 'top' | 'bottom' = spaceBelow < 340 && r.top > 340 ? 'top' : 'bottom';
    const left = Math.max(8, Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 8));
    const top = placement === 'bottom' ? r.bottom + 6 : r.top - 6;
    setPos({ top, left, placement });
  };

  useLayoutEffect(() => {
    if (open) compute();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => compute();
    // capture:true catches scrolls inside the drawer body, not just the window.
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const setCount = (d: number, raw: string) => {
    if (validateCount) {
      const message = validateCount(raw);
      setRefused(({ [String(d)]: _gone, ...rest }) =>
        message ? { ...rest, [String(d)]: { raw, message } } : rest,
      );
      if (message) return;
    }
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    const next = { ...breakdown };
    if (n > 0) next[String(d)] = n;
    else delete next[String(d)];
    onBreakdownChange(next);
  };

  const apply = () => {
    onApply(total);
    setOpen(false);
  };
  const clear = () => {
    setRefused({});
    onBreakdownChange({});
  };

  const numInputClass =
    'h-7 w-16 rounded-input border border-border-strong bg-surface px-1.5 py-0 text-right font-mono text-[12px] text-ink-strong';

  const panel = pos && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Cash denomination counter"
      className={cn(
        'fixed z-[1100] flex flex-col gap-1.5 rounded-card border border-border-strong bg-surface p-2.5 shadow-(--shadow-popover)',
        pos.placement === 'top' && '-translate-y-full',
      )}
      style={{ top: pos.top, left: pos.left, width: PANEL_W }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-ink-muted">
          Count cash
        </span>
        <span className="text-[12px] text-ink-faint">
          {countedCount} note{countedCount === 1 ? '' : 's'}/coins
        </span>
      </div>

      <div className="flex flex-col gap-0.75">
        {denominations.map((d, i) => {
          const count = Number(breakdown[String(d)]) || 0;
          const bad = refused[String(d)];
          return (
            <div key={d} className="grid grid-cols-[52px_64px_1fr] items-center gap-2">
              <span className="text-[12px] font-semibold text-ink-strong">₹{d}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={bad ? bad.raw : count > 0 ? count : ''}
                placeholder="0"
                autoFocus={i === 0}
                onChange={(e) => setCount(d, e.target.value)}
                aria-label={`Count of ₹${d}`}
                aria-invalid={bad ? true : undefined}
                aria-describedby={bad ? `count-error-${d}` : undefined}
                className={cn(numInputClass, bad && 'border-danger-fg')}
              />
              <span
                className={cn(
                  'text-right font-mono text-[12px]',
                  count > 0 ? 'text-ink-default' : 'text-ink-faint',
                )}
              >
                {inr(d * count)}
              </span>
              {bad && (
                <span
                  id={`count-error-${d}`}
                  role="alert"
                  className="col-span-3 text-right text-[12px] text-danger-fg"
                >
                  {bad.message}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border-soft pt-1.5">
        <span className="text-[12px] font-semibold">Total</span>
        <span className="font-mono text-[14px] font-medium text-ink-strong">{inr(total)}</span>
      </div>

      {hasManualMismatch && (
        <div className="text-[12px] text-warning-fg">
          Field shows {inr(currentValue)} — Apply to replace with the counted total.
        </div>
      )}

      <div className="mt-0.5 flex gap-1.5">
        <Button variant="secondary" size="sm" onClick={clear} className="flex-none">
          Clear
        </Button>
        <Button size="sm" onClick={apply} disabled={hasRefused} className="flex-1">
          Apply {inr(total)}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={title}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-8 w-8 flex-none items-center justify-center rounded-input border border-border-strong disabled:cursor-not-allowed disabled:opacity-50',
          open ? 'bg-surface-alt' : 'bg-surface',
          total > 0 ? 'text-brand' : 'text-ink-muted',
          !disabled && 'cursor-pointer',
        )}
      >
        <Calculator size={15} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(panel, document.body)}
    </>
  );
};
