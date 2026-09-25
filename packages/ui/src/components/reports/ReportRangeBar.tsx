import React from 'react';
import { DateRangeField } from '../primitives/DateRangeField.js';
import { ReportNote } from './ReportNote.js';
import type { DateRange, RangeClock, RangePreset } from '../primitives/DateRangeField.js';

export interface ReportRangeBarProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  clock?: RangeClock;
  presets?: RangePreset[];
  /** Right-aligned controls (export buttons, entity/account pickers). */
  actions?: React.ReactNode;
  /**
   * Methodology caption for the tab. Rendered as a caption line *below* the
   * control row — prose in the row stretches the bar and knocks the controls
   * out of alignment.
   */
  note?: React.ReactNode;
}

/**
 * ReportRangeBar — the shared header for every Reports sub-tab: one aligned
 * control row (a compact `DateRangeField` on the left, entity pickers and
 * export buttons on the right), with the tab's methodology note as a caption
 * beneath it.
 *
 * Keeps the range picker + export/toggle pattern identical across Attendant
 * Handovers, Profit & Loss, Ledger, Cash & Bank, Invoices and the Tax Register
 * so they read as one family — including *where* each tab explains itself.
 */
export const ReportRangeBar: React.FC<ReportRangeBarProps> = ({
  value,
  onChange,
  clock,
  presets,
  actions,
  note,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <div
      style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
      }}
    >
      <DateRangeField value={value} onChange={onChange} clock={clock} presets={presets} size="sm" />
      {/* Controls only — at narrow widths these wrap under the range picker
          and stay bottom-aligned with it. */}
      {actions && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
    {note && <ReportNote>{note}</ReportNote>}
  </div>
);
