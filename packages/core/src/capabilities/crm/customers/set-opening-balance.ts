import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../../station-ops/business-days/index.js';
import type { CustomerLedgerEntry, CustomerLedgerRepository } from '../collections/index.js';
import type { CustomerRepository } from './index.js';

export interface SetCustomerOpeningBalanceCommand {
  customerId: string;
  /** Amount the customer already owes at onboarding (positive receivable). */
  amount: number | string;
  /** Station whose business day the opening entry anchors to. */
  stationId: string;
  /** Original as-of date (YYYY-MM-DD) so aging is correct; defaults to today. */
  asOfDate?: string;
}

const schema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  stationId: z.string().min(1, 'stationId is required'),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'asOfDate must be YYYY-MM-DD').optional(),
});

export interface SetCustomerOpeningBalanceDeps {
  ledger: CustomerLedgerRepository;
  customers: CustomerRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

/**
 * Seed a customer's opening receivable when onboarding a party that already had
 * an outstanding due in the previous system. Recorded as an 'Opening Balance'
 * customer-ledger row (referenceType 'OPENING_BALANCE'), anchored to the given
 * station's business day for the as-of date. It is NOT a sale — the distinct
 * transaction type keeps it out of DSSR credit-sales and the P&L, while the
 * derived balance (Σ debits − Σ collections) picks it up automatically.
 * Run inside runInTransaction.
 */
export class SetCustomerOpeningBalance implements UseCase<SetCustomerOpeningBalanceCommand, CustomerLedgerEntry> {
  constructor(private readonly deps: SetCustomerOpeningBalanceDeps) {}

  async execute(input: SetCustomerOpeningBalanceCommand, ctx: ExecutionContext): Promise<Result<CustomerLedgerEntry>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid SetCustomerOpeningBalance command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const customer = await this.deps.customers.findById(cmd.customerId);
    if (!customer || customer.organizationId !== ctx.organizationId) return err(notFoundError('Customer', cmd.customerId));

    const date = cmd.asOfDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
    const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, cmd.stationId, date);

    const now = ctx.clock.now().toISOString();
    const entry: CustomerLedgerEntry = {
      id: ctx.ids.newId(),
      shiftId: null,
      businessDayId: bd.id,
      customerId: customer.id,
      vehicleId: null,
      productId: null,
      attendantId: null,
      duId: null,
      transactionType: 'Opening Balance',
      amount: String(cmd.amount),
      quantity: null,
      unitPrice: null,
      referenceType: 'OPENING_BALANCE',
      referenceId: null,
      notes: 'Opening balance (carried forward at onboarding)',
      createdAt: now,
    };
    await this.deps.ledger.save(entry);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CUSTOMER_OPENING_BALANCE_SET,
        aggregateType: 'Customer',
        aggregateId: customer.id,
        businessDayId: bd.id,
        payload: { customerId: customer.id, amount: entry.amount, asOfDate: date },
      }),
    ]);

    return ok(entry);
  }
}
