import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { isValidBusinessDate, shiftBusinessDate } from '@pump/shared';

export type BusinessDayLifecycleState = 'OPEN' | 'CLOSED' | 'NOT_CREATED';

export interface BusinessDayStatusItem {
  id: string;
  businessDate: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openShiftCount: number;
  closedShiftCount: number;
  lastActivityAt: string;
}

/**
 * How far back "recent" reaches, in days inclusive of the current business day.
 *
 * The policy lives here, not in SQL: what counts as recent is a domain answer,
 * and burying `now() - interval '14 days'` in an adapter puts it where nobody
 * reviewing the domain would look for it. The adapter is handed a date.
 */
export const RECENT_BUSINESS_DAY_WINDOW_DAYS = 14;

export interface BusinessDayStatusSlices {
  /** The business day on the requested date, or null when never created. */
  requested: BusinessDayStatusItem | null;
  /** Every OPEN business day, newest first. */
  open: BusinessDayStatusItem[];
  /** OPEN business days strictly before the current business date, newest first. */
  pastOpen: BusinessDayStatusItem[];
  /**
   * Every business day in the recent window, OPEN and CLOSED, newest first —
   * plus any OPEN day older than the window.
   *
   * That last clause is not an afterthought. This list replaces a panel that
   * showed every open day at any age; a stale open day from five weeks ago
   * dropping out of view would leave the operator no way to close it.
   */
  recent: BusinessDayStatusItem[];
}

export interface BusinessDayStatusReader {
  /**
   * All three status slices in one call so adapters can serve them from a
   * single query — the projection carries correlated subselects, and each
   * round-trip costs Worker CPU (#155).
   */
  loadSlices(
    organizationId: string,
    stationId: string,
    requestedBusinessDate: string,
    currentBusinessDate: string,
    /** Inclusive start of the recent window, computed by the use-case. */
    recentFromBusinessDate: string,
  ): Promise<BusinessDayStatusSlices>;
}

export interface GetBusinessDayStatusResult {
  currentBusinessDate: string;
  requestedBusinessDate: string;
  requestedState: BusinessDayLifecycleState;
  requestedBusinessDay: BusinessDayStatusItem | null;
  openBusinessDays: BusinessDayStatusItem[];
  pastOpenBusinessDays: BusinessDayStatusItem[];
  /** Last 14 days, open and closed, newest first (plus any older open day). */
  recentBusinessDays: BusinessDayStatusItem[];
  /** Inclusive start of that window, so the client can label it honestly. */
  recentFromBusinessDate: string;
}

export class GetBusinessDayStatus implements UseCase<
  { stationId: string; requestedBusinessDate: string; currentBusinessDate: string },
  GetBusinessDayStatusResult
> {
  constructor(private readonly reader: BusinessDayStatusReader) {}

  async execute(
    input: { stationId: string; requestedBusinessDate: string; currentBusinessDate: string },
    ctx: ExecutionContext,
  ): Promise<Result<GetBusinessDayStatusResult>> {
    if (
      !input.stationId ||
      !isValidBusinessDate(input.requestedBusinessDate) ||
      !isValidBusinessDate(input.currentBusinessDate)
    ) {
      return err(
        validationError('Business Day status requires a Station and valid Business Dates'),
      );
    }
    const recentFromBusinessDate = shiftBusinessDate(
      input.currentBusinessDate,
      -(RECENT_BUSINESS_DAY_WINDOW_DAYS - 1),
    );
    const slices = await this.reader.loadSlices(
      ctx.organizationId,
      input.stationId,
      input.requestedBusinessDate,
      input.currentBusinessDate,
      recentFromBusinessDate,
    );
    return ok({
      currentBusinessDate: input.currentBusinessDate,
      recentFromBusinessDate,
      requestedBusinessDate: input.requestedBusinessDate,
      requestedState: slices.requested?.status ?? 'NOT_CREATED',
      requestedBusinessDay: slices.requested,
      openBusinessDays: slices.open,
      pastOpenBusinessDays: slices.pastOpen,
      // Sorted here rather than trusted from the adapter: every caller renders
      // this newest-first, and a reader that forgets ORDER BY should not be
      // able to shuffle the operator's list.
      recentBusinessDays: [...slices.recent].sort((a, b) =>
        b.businessDate.localeCompare(a.businessDate),
      ),
    });
  }
}
