/**
 * Business Day list — the wire contract of `GET /api/dssr/days` (#394).
 *
 * One page of a Station's Business Days for the mobile Reports tab. Shared
 * because the app renders exactly what the API returns.
 */

/**
 * Where a Business Day stands in its life:
 * - `LIVE`: open and the Current Business Date — figures are still moving.
 * - `DRAFT`: a Past Open Business Day — it ended but has not been closed, so
 *   there is no sealed DSSR yet.
 * - `SEALED`: closed — figures come from the immutable DSSR snapshot.
 */
export type BusinessDayListStatus = 'LIVE' | 'DRAFT' | 'SEALED';

export interface BusinessDayListItem {
  /** Business Date, `YYYY-MM-DD`. */
  businessDate: string;
  status: BusinessDayListStatus;
  /** Fuel sales + product sales. */
  totalSales: number;
  fuelSales: number;
  productSales: number;
  /** Net fuel volume sold (litres; testing volume excluded). */
  volume: number;
  /** Office count variance across the day's closed Shifts (negative = short). */
  cashVariance: number;
  /** Closed Shifts the figures are built from. */
  shiftCount: number;
}

export interface BusinessDayListWeek {
  /** Sales over the last 7 Business Dates, ending on the Current Business Date. */
  total: number;
  /** Sales over the 7 Business Dates before that. */
  previousTotal: number;
  /** Past Open Business Days (Draft), across all months. */
  openPastDays: number;
}

export interface BusinessDayList {
  /** The month this page covers, `YYYY-MM`. */
  month: string;
  week: BusinessDayListWeek;
  /** Newest first. */
  days: BusinessDayListItem[];
  /** Latest earlier month that has any Business Day, `YYYY-MM`; null = no older page. */
  olderMonth: string | null;
}
