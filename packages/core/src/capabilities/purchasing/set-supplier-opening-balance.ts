import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../station-ops/business-days/index.js';
import type { SupplierRepository } from '../crm/suppliers/index.js';
import type { SupplierTransaction, SupplierTransactionRepository } from './ports.js';

export interface SetSupplierOpeningBalanceCommand {
  supplierId: string;
  /** Amount already owed to the supplier at onboarding (positive payable). */
  amount: number | string;
  /** Station whose business day the opening entry anchors to. */
  stationId: string;
  /** Original as-of date (YYYY-MM-DD) so aging is correct; defaults to today. */
  asOfDate?: string;
}

const schema = z.object({
  supplierId: z.string().min(1, 'supplierId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  stationId: z.string().min(1, 'stationId is required'),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'asOfDate must be YYYY-MM-DD').optional(),
});

export interface SetSupplierOpeningBalanceDeps {
  supplierTxns: SupplierTransactionRepository;
  suppliers: SupplierRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

/**
 * Seed a supplier's opening payable when onboarding a supplier the station
 * already owes money to. Recorded as an 'Opening Balance' supplier-transaction
 * (referenceType 'OPENING_BALANCE'), anchored to the given station's business day
 * for the as-of date. It is NOT a purchase/payment — the distinct type keeps it
 * out of the DSSR (purchases & supplier payments) while the derived payable
 * (Σ non-payment − Σ payments) picks it up automatically. Run inside
 * runInTransaction.
 */
export class SetSupplierOpeningBalance implements UseCase<SetSupplierOpeningBalanceCommand, SupplierTransaction> {
  constructor(private readonly deps: SetSupplierOpeningBalanceDeps) {}

  async execute(input: SetSupplierOpeningBalanceCommand, ctx: ExecutionContext): Promise<Result<SupplierTransaction>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid SetSupplierOpeningBalance command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const supplier = await this.deps.suppliers.findById(cmd.supplierId);
    if (!supplier || supplier.organizationId !== ctx.organizationId) return err(notFoundError('Supplier', cmd.supplierId));

    const date = cmd.asOfDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
    const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, cmd.stationId, date);

    const now = ctx.clock.now().toISOString();
    const entry: SupplierTransaction = {
      id: ctx.ids.newId(),
      shiftId: null,
      businessDayId: bd.id,
      supplierId: supplier.id,
      transactionType: 'Opening Balance',
      amount: String(cmd.amount),
      // Opening balances never touch cash — paidFrom is a neutral placeholder and
      // affectsDrawer is false so drawer reconciliation is untouched.
      paidFrom: 'BANK',
      affectsDrawer: false,
      referenceType: 'OPENING_BALANCE',
      referenceId: null,
      notes: 'Opening balance (carried forward at onboarding)',
      createdAt: now,
    };
    await this.deps.supplierTxns.save(entry);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SUPPLIER_OPENING_BALANCE_SET,
        aggregateType: 'Supplier',
        aggregateId: supplier.id,
        stationId: cmd.stationId,
        businessDayId: bd.id,
        payload: { supplierId: supplier.id, amount: entry.amount, asOfDate: date },
      }),
    ]);

    return ok(entry);
  }
}
