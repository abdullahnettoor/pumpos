import React from 'react';
import { type CashBreakdown, inr } from '@pump/ui';
import { BottomSheet } from '../ui/BottomSheet.js';

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
 * Mobile bottom-sheet cash counter (on `ui/BottomSheet`: focus trap, inert page, back gesture) — the phone-friendly sibling of the desktop
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
  const total = DENOMS.reduce((s, d) => s + d * (Number(breakdown[String(d)]) || 0), 0);
  const hasMismatch =
    currentValue != null &&
    Math.round(currentValue) !== Math.round(total) &&
    (currentValue > 0 || total > 0);

  const setCount = (d: number, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    const next = { ...breakdown };
    if (n > 0) next[String(d)] = n;
    else delete next[String(d)];
    onBreakdownChange(next);
  };

  return (
    <BottomSheet open={open} onClose={onClose} label="Cash denomination counter">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pb-3 pt-1">
        <div>
          <h3 className="text-[15px] font-semibold text-text-high">{title}</h3>
          <p className="text-[11px] text-text-faint">Enter the number of notes &amp; coins</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 -mt-1.5 grid h-11 w-11 place-items-center text-base"
          aria-label="Close"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-card-alt text-text-muted">
            ✕
          </span>
        </button>
      </div>

      {/* Denomination rows: all shown */}
      <div className="flex flex-col gap-1.5 px-4 pb-1">
        {DENOMS.map((d) => {
          const count = Number(breakdown[String(d)]) || 0;
          const active = count > 0;
          return (
            <div
              key={d}
              className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 ${
                active ? 'border-accent bg-card-alt' : 'border-line bg-card'
              }`}
            >
              <span
                className={`num grid h-8 w-12 flex-shrink-0 place-items-center rounded-lg text-[13px] font-bold ${
                  active ? 'bg-accent text-on-accent' : 'bg-card-alt text-text-muted'
                }`}
              >
                ₹{d}
              </span>
              <span className="text-xs text-text-faint">×</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={count > 0 ? count : ''}
                placeholder="0"
                onChange={(e) => setCount(d, e.target.value)}
                aria-label={`Count of ₹${d}`}
                className="num w-16 rounded-lg border border-line bg-card py-1.5 text-center text-[15px] text-text-high"
              />
              <span
                className={`num flex-1 text-right text-sm ${active ? 'text-text-high' : 'text-text-faint'}`}
              >
                {active ? inr(d * count) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-1 flex flex-col gap-2 px-4 pt-2">
        {hasMismatch && (
          <p className="text-[11px] text-warn-fg">
            Field shows {inr(currentValue)} — Apply to replace it.
          </p>
        )}
        <div className="flex items-center justify-between rounded-xl bg-card-alt px-3 py-2.5">
          <span className="text-[13px] font-medium text-text-muted">Total counted</span>
          <span className="num text-lg font-bold text-text-high">{inr(total)}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onBreakdownChange({})}
            disabled={total === 0}
            className="rounded-xl border border-line px-5 py-3 text-sm font-medium text-text-muted disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(total);
              onClose();
            }}
            className="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent"
          >
            Apply {inr(total)}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
