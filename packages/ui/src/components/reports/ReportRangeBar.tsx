import React from 'react';
import { ControlBar, DateRangeMenu } from '../../pump-ds/index.js';
import { ReportNote } from './ReportNote.js';
import type { DateRange, RangeClock, RangePreset } from '../../pump-ds/date-range/index.js';

export interface ReportRangeBarProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  clock?: RangeClock;
  presets?: RangePreset[];
  /** Filters after the range: entity/account pickers, a Cash | Bank switch. */
  filters?: React.ReactNode;
  /** `ExportMenu` for the report, at the right end of the bar. */
  exportMenu?: React.ReactNode;
  /**
   * Methodology caption for the tab. Rendered as a caption line *below* the
   * control row — prose in the row stretches the bar and knocks the controls
   * out of alignment.
   */
  note?: React.ReactNode;
}

/**
 * ReportRangeBar — the shared header for every Reports sub-tab (layout A,
 * #567): one `ControlBar` driving everything below it, the `DateRangeMenu`
 * first, the tab's filters after it and the export at the right end, with the
 * tab's methodology note as a caption beneath.
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
  filters,
  exportMenu,
  note,
}) => (
  <div className="flex flex-col gap-1.5">
    <ControlBar
      range={
        <DateRangeMenu
          value={value}
          onChange={onChange}
          clock={clock}
          presets={presets}
          aria-label="Report period"
        />
      }
      filters={filters}
      exportMenu={exportMenu}
    />
    {note && <ReportNote>{note}</ReportNote>}
  </div>
);
