import { err, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import {
  isValidBusinessDate,
  partyMonthWindows,
  resolveBusinessDate,
  type PayablesSummary,
  type SupplierPayableSummary,
} from '@pump/shared';
import { composePayables, composeSupplierPayable } from './compose.js';
import type { PayablesReader, PayablesQuery } from './ports.js';

export interface GetPayablesCommand {
  /** Gates access and supplies the clock (timezone + Day Start); the figures themselves are Organization-wide. */
  stationId: string;
}

export interface GetSupplierPayableCommand extends GetPayablesCommand {
  supplierId: string;
}

/**
 * Each figure follows its own anchor (ADR 0005). "This month": Purchases by the
 * month of the Current Business Date (they are forecourt stock events), Supplier
 * Payments by the month of the Entry Date (the station calendar date, no Day
 * Start: they are Office Records). Open Purchases age against the Current
 * Business Date.
 */
function windowsOf(ctx: ExecutionContext) {
  const now = ctx.clock.now();
  const windows = partyMonthWindows({
    now,
    timeZone: ctx.timeZone ?? 'Asia/Kolkata',
    dayStartsAt: ctx.businessDayStartsAt ?? '00:00',
  });
  const query: Omit<PayablesQuery, 'organizationId'> = {
    purchasedFrom: windows.businessMonth.from,
    purchasedTo: windows.businessMonth.to,
    paidFrom: windows.entryMonth.from,
    paidTo: windows.entryMonth.to,
  };
  const months = {
    purchasedMonth: windows.months.businessMonth,
    paidMonth: windows.months.entryMonth,
  };
  return {
    currentBusinessDate: resolveBusinessDate({
      now,
      timeZone: ctx.timeZone,
      dayStartsAt: ctx.businessDayStartsAt,
    }),
    query,
    months,
  };
}

/**
 * What the Organization owes its suppliers: total, this month's purchased vs
 * paid, and a row per supplier that is owed money (oldest unpaid Purchase, how
 * many are unpaid). Read-only; emits no Business Event. Station access is the
 * route's to enforce; the use case reads under the caller's Organization.
 */
export class GetPayables implements UseCase<GetPayablesCommand, PayablesSummary> {
  constructor(private readonly reader: PayablesReader) {}

  async execute(
    input: GetPayablesCommand,
    ctx: ExecutionContext,
  ): Promise<Result<PayablesSummary>> {
    const { currentBusinessDate, query, months } = windowsOf(ctx);
    if (!input.stationId || !isValidBusinessDate(currentBusinessDate)) {
      return err(validationError('Payables require a Station'));
    }
    const source = await this.reader.summary({ organizationId: ctx.organizationId, ...query });
    return ok(composePayables(source, currentBusinessDate, months));
  }
}

/**
 * One supplier's payable plus this month: purchased vs paid, last payment and
 * purchases by product. The balance is the NET one: negative = paid ahead.
 */
export class GetSupplierPayable implements UseCase<
  GetSupplierPayableCommand,
  SupplierPayableSummary
> {
  constructor(private readonly reader: PayablesReader) {}

  async execute(
    input: GetSupplierPayableCommand,
    ctx: ExecutionContext,
  ): Promise<Result<SupplierPayableSummary>> {
    const { currentBusinessDate, query, months } = windowsOf(ctx);
    if (!input.stationId || !input.supplierId || !isValidBusinessDate(currentBusinessDate)) {
      return err(validationError('Supplier payable requires a Station and a supplier'));
    }
    const source = await this.reader.supplier({
      organizationId: ctx.organizationId,
      supplierId: input.supplierId,
      ...query,
    });
    if (!source) return err(notFoundError('Supplier', input.supplierId));
    return ok(composeSupplierPayable(source, currentBusinessDate, months));
  }
}
