import { err, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { isValidBusinessDate } from '@pump/shared';

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

export interface BusinessDayStatusSlices {
  /** The business day on the requested date, or null when never created. */
  requested: BusinessDayStatusItem | null;
  /** Every OPEN business day, newest first. */
  open: BusinessDayStatusItem[];
  /** OPEN business days strictly before the current business date, newest first. */
  pastOpen: BusinessDayStatusItem[];
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
  ): Promise<BusinessDayStatusSlices>;
}

export interface GetBusinessDayStatusResult {
  currentBusinessDate: string;
  requestedBusinessDate: string;
  requestedState: BusinessDayLifecycleState;
  requestedBusinessDay: BusinessDayStatusItem | null;
  openBusinessDays: BusinessDayStatusItem[];
  pastOpenBusinessDays: BusinessDayStatusItem[];
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
    const slices = await this.reader.loadSlices(
      ctx.organizationId,
      input.stationId,
      input.requestedBusinessDate,
      input.currentBusinessDate,
    );
    return ok({
      currentBusinessDate: input.currentBusinessDate,
      requestedBusinessDate: input.requestedBusinessDate,
      requestedState: slices.requested?.status ?? 'NOT_CREATED',
      requestedBusinessDay: slices.requested,
      openBusinessDays: slices.open,
      pastOpenBusinessDays: slices.pastOpen,
    });
  }
}
