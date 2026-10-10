import { err, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import {
  isValidBusinessDate,
  partyMonthWindows,
  type CustomerReceivableSummary,
  type ReceivablesSummary,
} from '@pump/shared';
import { composeCustomerReceivable, composeReceivables } from './compose.js';
import type { ReceivablesReader } from './ports.js';

export interface GetReceivablesCommand {
  /** Gates access and supplies the clock (timezone + Day Start); the figures themselves are Organization-wide. */
  stationId: string;
}

export interface GetCustomerReceivableCommand extends GetReceivablesCommand {
  customerId: string;
}

/**
 * The Current Business Date from the Station's clock (timezone + Day Start):
 * the instant an open debit's age is measured to. Never the UTC date.
 */
const partyWindowsOf = (ctx: ExecutionContext) =>
  partyMonthWindows({
    now: ctx.clock.now(),
    timeZone: ctx.timeZone,
    dayStartsAt: ctx.businessDayStartsAt,
  });

/**
 * What the customers of the Organization owe (not one Station's slice): total,
 * aging split and a row per customer that owes.
 * Read-only; emits no Business Event. Station access is the route's to enforce;
 * the use case reads under the caller's Organization.
 */
export class GetReceivables implements UseCase<GetReceivablesCommand, ReceivablesSummary> {
  constructor(private readonly reader: ReceivablesReader) {}

  async execute(
    input: GetReceivablesCommand,
    ctx: ExecutionContext,
  ): Promise<Result<ReceivablesSummary>> {
    const { currentBusinessDate } = partyWindowsOf(ctx);
    if (!input.stationId || !isValidBusinessDate(currentBusinessDate)) {
      return err(validationError('Receivables require a Station'));
    }
    const source = await this.reader.summary({
      organizationId: ctx.organizationId,
      currentBusinessDate,
    });
    return ok(composeReceivables(source, currentBusinessDate));
  }
}

/**
 * One customer's receivable plus how they pay: last payment, how long they
 * usually take, this month's credit vs paid, and vehicle spend this month.
 *
 * Each figure follows its own anchor (ADR 0005). "This month": Credit Sales by
 * the month of the Current Business Date, Collections by the month of the Entry
 * Date (the station calendar date, no Day Start). "Last payment N days ago":
 * Entry Date to the current Entry Date. Open debits age against the Current
 * Business Date.
 */
export class GetCustomerReceivable implements UseCase<
  GetCustomerReceivableCommand,
  CustomerReceivableSummary
> {
  constructor(private readonly reader: ReceivablesReader) {}

  async execute(
    input: GetCustomerReceivableCommand,
    ctx: ExecutionContext,
  ): Promise<Result<CustomerReceivableSummary>> {
    const windows = partyWindowsOf(ctx);
    const currentBusinessDate = windows.currentBusinessDate;
    if (!input.stationId || !input.customerId || !isValidBusinessDate(currentBusinessDate)) {
      return err(validationError('Customer receivable requires a Station and a customer'));
    }
    const entryDate = windows.entryDate;
    const credit = windows.businessMonth;
    const paid = windows.entryMonth;

    const source = await this.reader.customer({
      organizationId: ctx.organizationId,
      customerId: input.customerId,
      currentBusinessDate,
      creditFrom: credit.from,
      creditTo: credit.to,
      paidFrom: paid.from,
      paidTo: paid.to,
    });
    if (!source) return err(notFoundError('Customer', input.customerId));
    return ok(composeCustomerReceivable(source, currentBusinessDate, entryDate));
  }
}
