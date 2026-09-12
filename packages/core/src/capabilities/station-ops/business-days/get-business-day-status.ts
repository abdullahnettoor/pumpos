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

export interface BusinessDayStatusReader {
  findByDate(organizationId: string, stationId: string, businessDate: string): Promise<BusinessDayStatusItem | null>;
  listOpen(organizationId: string, stationId: string): Promise<BusinessDayStatusItem[]>;
  listPastOpen(organizationId: string, stationId: string, currentBusinessDate: string): Promise<BusinessDayStatusItem[]>;
}

export interface GetBusinessDayStatusResult {
  currentBusinessDate: string;
  requestedBusinessDate: string;
  requestedState: BusinessDayLifecycleState;
  requestedBusinessDay: BusinessDayStatusItem | null;
  openBusinessDays: BusinessDayStatusItem[];
  pastOpenBusinessDays: BusinessDayStatusItem[];
}

export class GetBusinessDayStatus implements UseCase<{ stationId: string; requestedBusinessDate: string; currentBusinessDate: string }, GetBusinessDayStatusResult> {
  constructor(private readonly reader: BusinessDayStatusReader) {}

  async execute(input: { stationId: string; requestedBusinessDate: string; currentBusinessDate: string }, ctx: ExecutionContext): Promise<Result<GetBusinessDayStatusResult>> {
    if (!input.stationId || !isValidBusinessDate(input.requestedBusinessDate) || !isValidBusinessDate(input.currentBusinessDate)) {
      return err(validationError('Business Day status requires a Station and valid Business Dates'));
    }
    const [requestedBusinessDay, openBusinessDays, pastOpenBusinessDays] = await Promise.all([
      this.reader.findByDate(ctx.organizationId, input.stationId, input.requestedBusinessDate),
      this.reader.listOpen(ctx.organizationId, input.stationId),
      this.reader.listPastOpen(ctx.organizationId, input.stationId, input.currentBusinessDate),
    ]);
    return ok({
      currentBusinessDate: input.currentBusinessDate,
      requestedBusinessDate: input.requestedBusinessDate,
      requestedState: requestedBusinessDay?.status ?? 'NOT_CREATED',
      requestedBusinessDay,
      openBusinessDays,
      pastOpenBusinessDays,
    });
  }
}
