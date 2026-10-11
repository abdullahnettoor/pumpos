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
 * - `SEALED`: closed AND has its immutable DSSR snapshot — figures come from it.
 * - `REPORT_MISSING`: closed but no DSSR snapshot exists (a closed day always
 *   should have one). There is no report to open and no trustworthy figures, so
 *   the row carries zeros and must not be presented as Sealed.
 */
export type BusinessDayListStatus = 'LIVE' | 'DRAFT' | 'SEALED' | 'REPORT_MISSING';

export interface BusinessDayListItem {
  /** Business Date, `YYYY-MM-DD`. */
  businessDate: string;
  status: BusinessDayListStatus;
  /**
   * Fuel sales + product sales. A Live day's figure is partial (closed Shifts +
   * Product Sales so far) and is not for display; zero for `REPORT_MISSING`.
   */
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

/** The like-for-like pairs behind the week comparison. */
export interface BusinessDayListComparison {
  /** Sales over the paired days of the current window. */
  total: number;
  /** Sales over the same weekdays, 7 days earlier. */
  previousTotal: number;
  /** Number of paired days (0-7); each pair has both days Sealed. */
  days: number;
}

export interface BusinessDayListWeek {
  /**
   * Sealed sales over the last 7 completed Business Dates (the Current
   * Business Date, still Live, is excluded).
   */
  total: number;
  /** Sealed days inside that window (0-7). */
  sealedDays: number;
  /**
   * Like-for-like change basis: only weekdays where BOTH this window's day and
   * the day 7 earlier are Sealed, so a day waiting to be closed never skews it.
   */
  comparison: BusinessDayListComparison;
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
