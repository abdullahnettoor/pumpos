import React from 'react';

/**
 * Cancel + primary pair at the foot of a sheet form. The primary button is a
 * submit; `busy` shows `busyLabel` and disables it, `disabled` disables it
 * (nothing to save yet). `tone="danger"` is for a destructive confirm.
 */
export const SheetButtons: React.FC<{
  onCancel: () => void;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  tone?: 'accent' | 'danger';
  disabled?: boolean;
}> = ({ onCancel, submitLabel, busyLabel, busy, tone = 'accent', disabled }) => (
  <div className="grid grid-cols-2 gap-2.5 pt-1">
    <button
      type="button"
      onClick={onCancel}
      className="flex h-11 items-center justify-center rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-text-high"
    >
      Cancel
    </button>
    <button
      type="submit"
      disabled={busy || disabled}
      className={`flex h-11 items-center justify-center rounded-[13px] text-[13.5px] font-bold disabled:opacity-60 ${
        tone === 'danger' ? 'bg-bad text-on-bad' : 'bg-accent text-on-accent'
      }`}
    >
      {busy ? busyLabel : submitLabel}
    </button>
  </div>
);
