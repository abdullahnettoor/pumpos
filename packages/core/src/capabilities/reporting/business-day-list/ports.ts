export type {
  BusinessDayList,
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
  /** Current Business Date: end of the week window, and the Draft boundary. */
  currentBusinessDate: string;
}

/**
 * One Business Day's figures. For a closed day they come from its DSSR
 * snapshot; for an open day (or a closed day whose snapshot is missing) from
 * its closed Shift Summaries plus its Product Sales. The live DSSR preview is
 * never built for this list.
 */
export interface BusinessDayListSourceDay {
  businessDate: string;
  dayStatus: 'OPEN' | 'CLOSED';
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
