import React from 'react';
import { resolveBusinessDate } from '@pump/shared';
import { Select } from './Field.js';
import { DateField } from './Field.js';

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'last-7'
  | 'this-week'
  | 'this-month'
  | 'last-30'
  | 'this-year'
  | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

export interface RangeClock {
  /** IANA timezone, e.g. 'Asia/Kolkata'. */
  timeZone?: string;
  /** Business-day start time 'HH:MM' (a fuel day often runs 06:00→06:00). */
  dayStartsAt?: string;
}

const PRESET_LABEL: Record<RangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'last-7': 'Last 7 days',
  'this-week': 'This week',
  'this-month': 'This month',
  'last-30': 'Last 30 days',
  'this-year': 'This year',
  custom: 'Custom',
};

const DEFAULT_PRESETS: RangePreset[] = [
  'today',
  'yesterday',
  'last-7',
  'this-week',
  'this-month',
  'last-30',
  'this-year',
];

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Compute a concrete `{ from, to }` for a preset, anchored to the station's
 * *business* today (timezone + day-start aware). Exported so a parent can seed
 * its initial range state, e.g. `useState(computeRange('this-month', clock))`.
 */
export function computeRange(preset: RangePreset, clock?: RangeClock): DateRange {
  const today = resolveBusinessDate({ timeZone: clock?.timeZone, dayStartsAt: clock?.dayStartsAt });
  const anchor = new Date(`${today}T00:00:00Z`);
  const minus = (n: number) => {
    const c = new Date(anchor);
    c.setUTCDate(c.getUTCDate() - n);
    return isoOf(c);
  };
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: minus(1), to: minus(1) };
    case 'last-7':
      return { from: minus(6), to: today };
    case 'last-30':
      return { from: minus(29), to: today };
    case 'this-week': {
      // Week starts Monday.
      const dow = (anchor.getUTCDay() + 6) % 7;
      return { from: minus(dow), to: today };
    }
    case 'this-month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'this-year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'custom':
    default:
      return { from: today, to: today };
  }
}

export interface DateRangeFieldProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Station clock so presets resolve to the business date. */
  clock?: RangeClock;
  /** Which presets to offer (order preserved). 'custom' is implicit. */
  presets?: RangePreset[];
  /** Show the From/To date inputs alongside the preset dropdown. Default true. */
  showInputs?: boolean;
}

/**
 * Reusable date-range picker: a preset dropdown (Today, This week, This month,
 * Last 7/30 days, This year …) plus optional From/To inputs. The active preset
 * is derived by matching the current value, so the control is fully controlled
 * and stateless — editing a date simply falls back to "Custom". Seed the parent
 * with `computeRange(defaultPreset, clock)`.
 */
export const DateRangeField: React.FC<DateRangeFieldProps> = ({
  value,
  onChange,
  clock,
  presets = DEFAULT_PRESETS,
  showInputs = true,
}) => {
  // Derive the active preset from the current value (else 'custom').
  const active: RangePreset =
    presets.find((p) => {
      const r = computeRange(p, clock);
      return r.from === value.from && r.to === value.to;
    }) ?? 'custom';

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div>
        <label className="field-label">Period</label>
        <Select
          value={active}
          onChange={(e) => {
            const p = e.target.value as RangePreset;
            if (p === 'custom') return;
            onChange(computeRange(p, clock));
          }}
          style={{ minWidth: 150 }}
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABEL[p]}
            </option>
          ))}
          {active === 'custom' && <option value="custom">{PRESET_LABEL.custom}</option>}
        </Select>
      </div>

      {showInputs && (
        <>
          <div>
            <label className="field-label">From</label>
            <DateField value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </div>
          <div>
            <label className="field-label">To</label>
            <DateField value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
};
