export type {
  BusinessDayList,
  BusinessDayListComparison,
  BusinessDayListItem,
  BusinessDayListStatus,
  BusinessDayListWeek,
} from '@pump/shared';

/** What the reader needs; every window is decided by the use-case, not the adapter. */
export interface BusinessDayListQuery {
  organizationId: string;
  stationId: string;
  /** Inclusive Business Dates of the requested month. */
  monthFrom: string;
  monthTo: string;
  /** Inclusive start of the previous 7-day window (the earliest week day needed). */
  weekFrom: string;
  /** Current Business Date: the Draft boundary (the week windows end the day before). */
  currentBusinessDate: string;
}

/**
 * One Business Day's figures. For a closed day they come from its DSSR
 * snapshot; for an open day from its closed Shift Summaries plus its Product
 * Sales. A closed day with no snapshot has no trustworthy figures: the reader
 * reports `hasSnapshot: false` and the use-case ignores the rest. The live DSSR
 * preview is never built for this list.
 */
export interface BusinessDayListSourceDay {
  businessDate: string;
  dayStatus: 'OPEN' | 'CLOSED';
  /** A DSSR snapshot exists for this date (only looked up for CLOSED days). */
  hasSnapshot: boolean;
  fuelSales: number;
  productSales: number;
  volume: number;
  cashVariance: number;
  shiftCount: number;
}

export interface BusinessDayListSource {
  /**
   * Days inside the month window and/or the two week windows — a bounded
   * union (≤ 31 + 14 rows), in no particular order.
   */
  days: BusinessDayListSourceDay[];
  /** Open Business Days strictly before `currentBusinessDate`, all months. */
  openPastDays: number;
  /** Latest Business Date earlier than `monthFrom`, or null when there is none. */
  olderBusinessDate: string | null;
}

export interface BusinessDayListReader {
  /** Everything above in one round-trip: constant statement count (#155). */
  load(query: BusinessDayListQuery): Promise<BusinessDayListSource>;
}
