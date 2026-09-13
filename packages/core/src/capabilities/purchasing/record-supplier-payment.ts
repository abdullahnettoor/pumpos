import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../kernel/index.js';
import type { DomainEvent, EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import { resolveShiftBusinessDayWrite, type ShiftRepository } from '../station-ops/shifts/index.js';
import { resolveBusinessDayWrite, type BusinessDayWriteRepository } from '../station-ops/business-days/index.js';
import type { SupplierRepository } from '../crm/suppliers/index.js';
import type { SupplierTransaction, SupplierTransactionRepository } from './ports.js';

export type SupplierPaidFrom = 'SHIFT_CASH' | 'BANK' | 'OWNER' | 'CMS';

function accountLabel(paidFrom: SupplierPaidFrom): string {
  return {
    SHIFT_CASH: 'shift cash',
    BANK: 'bank account',
    OWNER: 'owner account',
    CMS: 'CMS account',
  }[paidFrom];
}

export interface RecordSupplierPaymentCommand {
  supplierId: string;
  amount: number | string;
  paidFrom?: SupplierPaidFrom;
  affectsDrawer?: boolean;
  shiftId?: string;
  stationId?: string;
  notes?: string;
  transactionDate?: string;
}

const schema = z.object({
  supplierId: z.string().min(1, 'supplierId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  paidFrom: z.enum(['SHIFT_CASH', 'BANK', 'OWNER', 'CMS']).optional(),
  affectsDrawer: z.boolean().optional(),
  shiftId: z.string().min(1).optional(),
  stationId: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
});

export interface RecordSupplierPaymentDeps {
  supplierTxns: SupplierTransactionRepository;
  suppliers: SupplierRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayWriteRepository;
  events: EventPublisher;
}

/**
 * Record a payment made to a supplier (reduces the payable). Only a payment made
 * from SHIFT_CASH touches the drawer and requires an open shift; BANK/OWNER
 * payments may retain optional shift attribution without changing the drawer.
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
    const affectsDrawer = cmd.affectsDrawer ?? paidFrom === 'SHIFT_CASH';

    let businessDayId: string;
    let shiftId: string | null;
    let lateEntry: boolean;
    let stationId = cmd.stationId ?? ctx.stationId ?? null;
    if (cmd.shiftId) {
      const eligibility = await resolveShiftBusinessDayWrite(this.deps.shifts, this.deps.businessDays, ctx, cmd.shiftId, 'FINANCIAL');
      if (!eligibility.success) return eligibility as unknown as Result<SupplierTransaction>;
      const shift = eligibility.data.shift;
      stationId = shift.stationId;
      businessDayId = eligibility.data.businessDay.id;
      lateEntry = eligibility.data.lateEntry;
      if (affectsDrawer && (lateEntry || shift.status !== 'OPEN')) {
        return err(invariantViolation('Drawer supplier payments require an open Shift and open Business Day', { shiftId: shift.id, shiftStatus: shift.status, businessDayId }));
      }
      shiftId = shift.id;
    } else if (stationId) {
      const date = cmd.transactionDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
      const eligibility = await resolveBusinessDayWrite(this.deps.businessDays, ctx, { stationId, businessDate: date, kind: 'FINANCIAL' });
      if (!eligibility.success) return eligibility as unknown as Result<SupplierTransaction>;
      businessDayId = eligibility.data.businessDay.id;
      lateEntry = eligibility.data.lateEntry;
      shiftId = null;
      if (affectsDrawer) return err(validationError('Drawer supplier payments require shiftId'));
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
      affectsDrawer: shiftId !== null && affectsDrawer,
      referenceType: null,
      referenceId: null,
      notes: cmd.notes ?? null,
      metadata: lateEntry ? { lateEntry: true } : {},
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
        metadata: lateEntry ? { lateEntry: true, lateEntryPrimary: true } : undefined,
        payload: { supplierId: supplier.id, amount: payment.amount, paidFrom, affectsDrawer: payment.affectsDrawer, shiftId },
        presentation: {
          templateId: 'supplier-paid.v1',
          values: { supplierName: supplier.name, amount: Number(payment.amount), accountName: accountLabel(paidFrom) },
        },
      }),
      eventFromContext(ctx, {
        eventType: BusinessEvents.PAYMENT_MADE,
        aggregateType: 'Supplier',
        aggregateId: supplier.id,
        stationId,
        businessDayId,
        metadata: lateEntry ? { lateEntry: true } : undefined,
        payload: { supplierId: supplier.id, amount: payment.amount, paidFrom },
        presentation: {
          templateId: 'payment-made.v1',
          values: { partyName: supplier.name, amount: Number(payment.amount), accountName: accountLabel(paidFrom) },
        },
      }),
    ];
    await this.deps.events.publish(events);

    return ok(payment);
  }
}
