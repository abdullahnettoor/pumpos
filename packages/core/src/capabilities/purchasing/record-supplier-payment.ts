import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../kernel/index.js';
import type { DomainEvent, EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import type { ShiftRepository } from '../station-ops/shifts/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../station-ops/business-days/index.js';
import type { SupplierRepository } from '../crm/suppliers/index.js';
import type { SupplierTransaction, SupplierTransactionRepository } from './ports.js';

export type SupplierPaidFrom = 'SHIFT_CASH' | 'BANK' | 'OWNER';

export interface RecordSupplierPaymentCommand {
  supplierId: string;
  amount: number | string;
  paidFrom?: SupplierPaidFrom;
  shiftId?: string;
  stationId?: string;
  notes?: string;
  transactionDate?: string;
}

const schema = z.object({
  supplierId: z.string().min(1, 'supplierId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  paidFrom: z.enum(['SHIFT_CASH', 'BANK', 'OWNER']).optional(),
  shiftId: z.string().min(1).optional(),
  stationId: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
});

export interface RecordSupplierPaymentDeps {
  supplierTxns: SupplierTransactionRepository;
  suppliers: SupplierRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

/**
 * Record a payment made to a supplier (reduces the payable). Only a payment made
 * from SHIFT_CASH touches the drawer and links to a shift; BANK/OWNER payments
 * anchor to the business day with no shift link.
 */
export class RecordSupplierPayment implements UseCase<RecordSupplierPaymentCommand, SupplierTransaction> {
  constructor(private readonly deps: RecordSupplierPaymentDeps) {}

  async execute(input: RecordSupplierPaymentCommand, ctx: ExecutionContext): Promise<Result<SupplierTransaction>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordSupplierPayment command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const supplier = await this.deps.suppliers.findById(cmd.supplierId);
    if (!supplier || supplier.organizationId !== ctx.organizationId) return err(notFoundError('Supplier', cmd.supplierId));

    const paidFrom: SupplierPaidFrom = cmd.paidFrom ?? 'BANK';
    const affectsDrawer = paidFrom === 'SHIFT_CASH';

    let businessDayId: string;
    let shiftId: string | null;
    let stationId = cmd.stationId ?? ctx.stationId ?? null;
    if (cmd.shiftId) {
      const shift = await this.deps.shifts.findById(cmd.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
      if (shift.status === 'LOCKED') return err(invariantViolation('Shift is locked', { shiftId: shift.id }));
      businessDayId = shift.businessDayId;
      stationId = shift.stationId;
      shiftId = affectsDrawer ? shift.id : null;
    } else if (stationId) {
      const date = cmd.transactionDate ?? ctx.clock.now().toISOString().slice(0, 10);
      const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, stationId, date);
      businessDayId = bd.id;
      shiftId = null;
    } else {
      return err(validationError('Either shiftId or stationId is required'));
    }

    const now = ctx.clock.now().toISOString();
    const payment: SupplierTransaction = {
      id: ctx.ids.newId(),
      shiftId,
      businessDayId,
      supplierId: supplier.id,
      transactionType: 'Payment',
      amount: String(cmd.amount),
      paidFrom,
      affectsDrawer,
      referenceType: null,
      referenceId: null,
      notes: cmd.notes ?? null,
      createdAt: now,
    };
    await this.deps.supplierTxns.save(payment);

    const events: DomainEvent[] = [
      eventFromContext(ctx, {
        eventType: BusinessEvents.SUPPLIER_PAID,
        aggregateType: 'Supplier',
        aggregateId: supplier.id,
        stationId,
        businessDayId,
        payload: { supplierId: supplier.id, amount: payment.amount, paidFrom, affectsDrawer, shiftId },
      }),
      eventFromContext(ctx, {
        eventType: BusinessEvents.PAYMENT_MADE,
        aggregateType: 'Supplier',
        aggregateId: supplier.id,
        stationId,
        businessDayId,
        payload: { supplierId: supplier.id, amount: payment.amount, paidFrom },
      }),
    ];
    await this.deps.events.publish(events);

    return ok(payment);
  }
}
