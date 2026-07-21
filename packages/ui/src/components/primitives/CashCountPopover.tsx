import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator } from 'lucide-react';
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
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const total = sumBreakdown(denominations, breakdown);
  const countedCount = denominations.reduce((s, d) => s + (Number(breakdown[String(d)]) || 0), 0);
  const hasManualMismatch =
    currentValue != null && Math.round(currentValue) !== Math.round(total) && (currentValue > 0 || total > 0);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setCount = (d: number, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    const next = { ...breakdown };
    if (n > 0) next[String(d)] = n; else delete next[String(d)];
    onBreakdownChange(next);
  };

  const apply = () => { onApply(total); setOpen(false); };
  const clear = () => onBreakdownChange({});

  const numInputStyle: React.CSSProperties = {
    width: '64px', height: '28px', padding: '0 6px', textAlign: 'right',
    border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-input)',
    fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'var(--bg-surface)', color: 'var(--text-strong)',
  };

  const panel = pos && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Cash denomination counter"
      style={{
        position: 'fixed', top: pos.top, left: pos.left, width: PANEL_W,
        transform: pos.placement === 'top' ? 'translateY(-100%)' : undefined,
        background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-card)', boxShadow: '0 8px 24px rgba(24,32,26,0.16)',
        zIndex: 1000, padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
          Count cash
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>{countedCount} note{countedCount === 1 ? '' : 's'}/coins</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '260px', overflowY: 'auto' }}>
        {denominations.map((d, i) => {
          const count = Number(breakdown[String(d)]) || 0;
          return (
            <div key={d} style={{ display: 'grid', gridTemplateColumns: '52px 64px 1fr', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>₹{d}</span>
              <input
                type="number" inputMode="numeric" min={0} step={1}
                value={count > 0 ? count : ''}
                placeholder="0"
                autoFocus={i === 0}
                onChange={(e) => setCount(d, e.target.value)}
                aria-label={`Count of ₹${d}`}
                style={numInputStyle}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', textAlign: 'right', color: count > 0 ? 'var(--text-default)' : 'var(--text-faint)' }}>
                {inr(d * count)}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-soft)', paddingTop: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600 }}>Total</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)' }}>{inr(total)}</span>
      </div>

      {hasManualMismatch && (
        <div style={{ fontSize: '10px', color: 'var(--state-warning-fg)' }}>
          Field shows {inr(currentValue!)} — Apply to replace with the counted total.
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        <button
          type="button" onClick={clear}
          className="btn btn-secondary btn-sm"
          style={{ flex: '0 0 auto' }}
        >
          Clear
        </button>
        <button
          type="button" onClick={apply}
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
        >
          Apply {inr(total)}
        </button>
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
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          height: '32px', width: '32px', flex: '0 0 auto',
          borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)',
          background: open ? 'var(--bg-surface-alt)' : 'var(--bg-surface)',
          color: total > 0 ? 'var(--brand-primary)' : 'var(--text-muted)',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        }}
      >
        <Calculator size={15} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(panel, document.body)}
    </>
  );
};
