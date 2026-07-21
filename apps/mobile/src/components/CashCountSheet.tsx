import React, { useEffect } from 'react';
import { type CashBreakdown, inr } from '@pump/ui';

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export interface CashCountSheetProps {
  open: boolean;
  onClose: () => void;
  /** Controlled counts, held by the parent so re-opening preserves them. */
  breakdown: CashBreakdown;
  onBreakdownChange: (next: CashBreakdown) => void;
  /** Apply the counted total into the linked cash field. */
  onApply: (total: number) => void;
  /** Current field value, used only to flag a manual mismatch. */
  currentValue?: number;
  title?: string;
}

/**
 * Mobile bottom-sheet cash counter — the phone-friendly sibling of the desktop
 * `CashCountPopover`. Same breakdown-aware contract (parent holds the counts;
 * Apply writes the summed total), so a future backend store is a drop-in.
 */
export const CashCountSheet: React.FC<CashCountSheetProps> = ({
  open,
  onClose,
  breakdown,
  onBreakdownChange,
  onApply,
  currentValue,
  title = 'Count cash',
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const total = DENOMS.reduce((s, d) => s + d * (Number(breakdown[String(d)]) || 0), 0);
  const hasMismatch =
    currentValue != null && Math.round(currentValue) !== Math.round(total) && (currentValue > 0 || total > 0);

  const setCount = (d: number, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    const next = { ...breakdown };
    if (n > 0) next[String(d)] = n; else delete next[String(d)];
    onBreakdownChange(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Cash denomination counter"
        className="relative z-10 flex max-h-[85vh] flex-col rounded-t-2xl border-t"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border-soft)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-lg"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {DENOMS.map((d) => {
            const count = Number(breakdown[String(d)]) || 0;
            return (
              <div key={d} className="grid grid-cols-[56px_1fr_96px] items-center gap-3 border-b py-2" style={{ borderColor: 'var(--border-soft)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>₹{d}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={count > 0 ? count : ''}
                  placeholder="0"
                  onChange={(e) => setCount(d, e.target.value)}
                  aria-label={`Count of ₹${d}`}
                  className="rounded-lg border px-3 py-2 text-right text-sm font-mono tabular-nums"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)', color: 'var(--text-strong)' }}
                />
                <span className="text-right text-sm font-mono tabular-nums" style={{ color: count > 0 ? 'var(--text-default)' : 'var(--text-faint)' }}>
                  {inr(d * count)}
                </span>
              </div>
            );
          })}
        </div>

        <div
          className="flex flex-col gap-2 border-t px-4 pt-3"
          style={{ borderColor: 'var(--border-soft)', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          {hasMismatch && (
            <p className="text-[11px]" style={{ color: 'var(--state-warning-fg)' }}>
              Field shows {inr(currentValue!)} — Apply to replace with the counted total.
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Total</span>
            <span className="text-base font-bold font-mono tabular-nums" style={{ color: 'var(--text-strong)' }}>{inr(total)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onBreakdownChange({})}
              className="rounded-xl border px-4 py-3 text-sm font-medium"
              style={{ borderColor: 'var(--border-soft)', color: 'var(--text-muted)' }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { onApply(total); onClose(); }}
              className="flex-1 rounded-xl py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              Apply {inr(total)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
