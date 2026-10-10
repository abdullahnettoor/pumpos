import { err, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import {
  isValidBusinessDate,
  resolveBusinessDate,
  resolveEntryDate,
  type CustomerReceivableSummary,
  type ReceivablesSummary,
} from '@pump/shared';
import { monthBounds } from '../business-day-list/list-business-days.js';
import { composeCustomerReceivable, composeReceivables } from './compose.js';
import type { ReceivablesReader } from './ports.js';

export interface GetReceivablesCommand {
  stationId: string;
}

export interface GetCustomerReceivableCommand extends GetReceivablesCommand {
  customerId: string;
}

/**
 * The Current Business Date from the Station's clock (timezone + Day Start):
 * the instant an open debit's age is measured to. Never the UTC date.
 */
const currentBusinessDateOf = (ctx: ExecutionContext) =>
  resolveBusinessDate({
    now: ctx.clock.now(),
    timeZone: ctx.timeZone,
    dayStartsAt: ctx.businessDayStartsAt,
  });

/**
 * What the customers owe: total, aging split and a row per customer that owes.
 * Read-only; emits no Business Event. Station access is the route's to enforce;
 * the use case reads under the caller's Organization.
 */
export class GetReceivables implements UseCase<GetReceivablesCommand, ReceivablesSummary> {
  constructor(private readonly reader: ReceivablesReader) {}

  async execute(
    input: GetReceivablesCommand,
    ctx: ExecutionContext,
  ): Promise<Result<ReceivablesSummary>> {
    const currentBusinessDate = currentBusinessDateOf(ctx);
    if (!input.stationId || !isValidBusinessDate(currentBusinessDate)) {
      return err(validationError('Receivables require a Station'));
    }
    const source = await this.reader.summary({
      organizationId: ctx.organizationId,
      stationId: input.stationId,
      currentBusinessDate,
    });
    return ok(composeReceivables(source, currentBusinessDate));
  }
}

/**
 * One customer's receivable plus how they pay: last payment, how long they
 * usually take, this month's credit vs paid, and vehicle spend this month.
 *
 * "This month" follows each figure's own anchor (ADR 0005): Credit Sales by the
 * month of the Current Business Date, Collections by the month of the Entry
 * Date (the station calendar date, no Day Start), so each is counted in the
 * month its own date says.
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
    const currentBusinessDate = currentBusinessDateOf(ctx);
    if (!input.stationId || !input.customerId || !isValidBusinessDate(currentBusinessDate)) {
      return err(validationError('Customer receivable requires a Station and a customer'));
    }
    const entryDate = resolveEntryDate({ now: ctx.clock.now(), timeZone: ctx.timeZone });
    const credit = monthBounds(currentBusinessDate.slice(0, 7));
    const paid = monthBounds(entryDate.slice(0, 7));

    const source = await this.reader.customer({
      organizationId: ctx.organizationId,
      stationId: input.stationId,
      customerId: input.customerId,
      currentBusinessDate,
      creditFrom: credit.from,
      creditTo: credit.to,
      paidFrom: paid.from,
      paidTo: paid.to,
    });
    if (!source) return err(notFoundError('Customer', input.customerId));
    return ok(composeCustomerReceivable(source, currentBusinessDate));
  }
}
