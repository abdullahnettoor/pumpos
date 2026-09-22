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

/**
 * What the reader needs to slice a station's Business Days.
 *
 * A parameter object rather than five positional strings: every one of them is
 * a `string`, three of them are `YYYY-MM-DD` dates, and a transposition
 * between them would typecheck cleanly and silently return the wrong window
 * (#244).
 */
export interface BusinessDayStatusQuery {
  organizationId: string;
  stationId: string;
  requestedBusinessDate: string;
  currentBusinessDate: string;
  /** Inclusive start of the recent window, computed by the use-case. */
  recentFromBusinessDate: string;
}

export interface BusinessDayStatusReader {
  /**
   * All four status slices in one call so adapters can serve them from a
   * single query — the projection carries correlated subselects, and each
   * round-trip costs Worker CPU (#155).
   */
  loadSlices(query: BusinessDayStatusQuery): Promise<BusinessDayStatusSlices>;
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

/**
 * `recent` plus every open day, newest first and de-duplicated by id.
 *
 * The union is what makes "every OPEN day appears in `recentBusinessDays`" a
 * property of the domain instead of a promise in one adapter's comment.
 */
function unionByIdSortedByDateDesc(
  recent: BusinessDayStatusItem[],
  open: BusinessDayStatusItem[],
): BusinessDayStatusItem[] {
  const byId = new Map(recent.map((item) => [item.id, item]));
  for (const item of open) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
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
    const slices = await this.reader.loadSlices({
      organizationId: ctx.organizationId,
      stationId: input.stationId,
      requestedBusinessDate: input.requestedBusinessDate,
      currentBusinessDate: input.currentBusinessDate,
      recentFromBusinessDate,
    });
    return ok({
      currentBusinessDate: input.currentBusinessDate,
      recentFromBusinessDate,
      requestedBusinessDate: input.requestedBusinessDate,
      requestedState: slices.requested?.status ?? 'NOT_CREATED',
      requestedBusinessDay: slices.requested,
      openBusinessDays: slices.open,
      pastOpenBusinessDays: slices.pastOpen,
      // Open days are unioned in, and the result sorted, here rather than
      // trusted from the adapter. Callers rely on both: one resolves the
      // active Business Day by looking it up in this list, so an open day
      // missing from it would strand the operator on the wrong day, and every
      // caller renders it newest-first. A reader that forgets either should
      // not be able to break them.
      recentBusinessDays: unionByIdSortedByDateDesc(slices.recent, slices.open),
    });
  }
}
