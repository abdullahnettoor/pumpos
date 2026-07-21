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
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Cash denomination counter"
        className="relative z-10 flex max-h-[92vh] flex-col rounded-t-2xl"
        style={{ backgroundColor: 'var(--bg-surface)', boxShadow: '0 -8px 32px rgba(0,0,0,0.24)' }}
      >
        {/* Grab handle */}
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--border-strong)' }} />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pb-3 pt-1">
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-strong)' }}>{title}</h3>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Enter the number of notes &amp; coins</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 grid h-9 w-9 place-items-center rounded-full text-base"
            style={{ backgroundColor: 'var(--bg-surface-alt)', color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Denomination rows — all shown, no inner scroll */}
        <div className="flex flex-col gap-1.5 px-4 pb-1">
          {DENOMS.map((d) => {
            const count = Number(breakdown[String(d)]) || 0;
            const active = count > 0;
            return (
              <div
                key={d}
                className="flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5"
                style={{ borderColor: active ? 'var(--brand-primary)' : 'var(--border-soft)', backgroundColor: active ? 'var(--bg-surface-alt)' : 'var(--bg-surface)' }}
              >
                <span
                  className="grid h-8 w-12 flex-shrink-0 place-items-center rounded-lg text-[13px] font-bold tabular-nums"
                  style={{ backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-surface-alt)', color: active ? '#fff' : 'var(--text-muted)' }}
                >
                  ₹{d}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>×</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={count > 0 ? count : ''}
                  placeholder="0"
                  onChange={(e) => setCount(d, e.target.value)}
                  aria-label={`Count of ₹${d}`}
                  className="w-16 rounded-lg border py-1.5 text-center text-[15px] font-mono tabular-nums"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)', color: 'var(--text-strong)' }}
                />
                <span
                  className="flex-1 text-right text-sm font-mono tabular-nums"
                  style={{ color: active ? 'var(--text-strong)' : 'var(--text-faint)' }}
                >
                  {active ? inr(d * count) : '—'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="mt-1 flex flex-col gap-2 px-4 pt-2"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          {hasMismatch && (
            <p className="text-[11px]" style={{ color: 'var(--state-warning-fg)' }}>
              Field shows {inr(currentValue!)} — Apply to replace it.
            </p>
          )}
          <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--bg-surface-alt)' }}>
            <span className="text-[13px] font-medium" style={{ color: 'var(--text-muted)' }}>Total counted</span>
            <span className="font-mono text-lg font-bold tabular-nums" style={{ color: 'var(--text-strong)' }}>{inr(total)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onBreakdownChange({})}
              disabled={total === 0}
              className="rounded-xl border px-5 py-3 text-sm font-medium disabled:opacity-40"
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
