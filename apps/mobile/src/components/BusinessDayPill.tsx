import React from 'react';

/** YYYY-MM-DD arithmetic done in UTC so it never drifts by timezone. */
function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function label(isoDate: string, max: string): string {
  if (isoDate === max) return 'Today';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

interface Props {
  /** Selected business date (YYYY-MM-DD). */
  value: string;
  onChange: (date: string) => void;
  /** Latest selectable business date (today) — forward nav is capped here. */
  max: string;
}

/** Global business-day navigator: ◀ prev · tap for calendar · next ▶ (capped at today). */
export const BusinessDayPill: React.FC<Props> = ({ value, onChange, max }) => {
  const atMax = value >= max;
  return (
    <div
      className="flex items-center gap-1 rounded-lg border p-0.5"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-soft)' }}
    >
      <button
        type="button"
        onClick={() => onChange(addDays(value, -1))}
        className="grid h-7 w-7 place-items-center rounded-md text-sm"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Previous day"
      >
        ‹
      </button>

      <label className="relative flex-1 cursor-pointer">
        <span
          className="block px-2 text-center text-sm font-semibold"
          style={{ color: 'var(--text-strong)' }}
        >
          {label(value, max)}
        </span>
        <input
          type="date"
          value={value}
          max={max}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 h-full w-full opacity-0"
          aria-label="Pick business day"
        />
      </label>

      <button
        type="button"
        onClick={() => !atMax && onChange(addDays(value, 1))}
        disabled={atMax}
        className="grid h-7 w-7 place-items-center rounded-md text-sm disabled:opacity-30"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Next day"
      >
        ›
      </button>
    </div>
  );
};
