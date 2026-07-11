import React from 'react';
import { DateRangeField } from '../primitives/DateRangeField.js';
import type { DateRange, RangeClock, RangePreset } from '../primitives/DateRangeField.js';

export interface ReportRangeBarProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  clock?: RangeClock;
  presets?: RangePreset[];
  /** Right-aligned controls (export buttons, entity/account pickers). */
  actions?: React.ReactNode;
  /** Small caption shown before the actions (context/methodology note). */
  note?: React.ReactNode;
}

/**
 * ReportRangeBar — the shared header for every Reports sub-tab: a compact
 * `DateRangeField` on the left and an optional actions/note cluster on the
 * right. Keeps the range picker + export/toggle pattern identical across
 * Profit & Loss, Ledger, Cash & Bank, and Invoices so they read as one family.
 */
export const ReportRangeBar: React.FC<ReportRangeBarProps> = ({ value, onChange, clock, presets, actions, note }) => (
  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
    <DateRangeField value={value} onChange={onChange} clock={clock} presets={presets} size="sm" />
    {(note || actions) && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {note && <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{note}</span>}
        {actions}
      </div>
    )}
  </div>
);
