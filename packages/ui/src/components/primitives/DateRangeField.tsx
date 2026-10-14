import React from 'react';
import {
  computeRange,
  matchPreset,
  PRESET_LABEL,
  type DateRange,
  type RangeClock,
  type RangePreset,
} from '../../pump-ds/date-range/range.js';
import { Select, Input } from '../../pump-ds/index.js';

export { computeRange };
export type { DateRange, RangeClock, RangePreset };

const DEFAULT_PRESETS: RangePreset[] = [
  'today',
  'yesterday',
  'last-7',
  'this-week',
  'this-month',
  'last-30',
  'this-year',
];

export interface DateRangeFieldProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Station clock so presets resolve to the business date. */
  clock?: RangeClock;
  /** Which presets to offer (order preserved). 'custom' is implicit. */
  presets?: RangePreset[];
  /** Show the From/To date inputs alongside the preset dropdown. Default true. */
  showInputs?: boolean;
  /** Control size. 'md' (default) for report pages; 'sm' for compact filter bars. */
  size?: 'sm' | 'md';
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
  size = 'md',
}) => {
  // Derive the active preset from the current value (else 'custom').
  const active = matchPreset(value, presets, clock);

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div>
        <label className="field-label">Period</label>
        <Select
          inputSize={size}
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
            <Input
              type="date"
              inputSize={size}
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">To</label>
            <Input
              type="date"
              inputSize={size}
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
};
