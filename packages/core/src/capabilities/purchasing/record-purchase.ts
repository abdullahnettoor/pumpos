import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../kernel/index.js';
import type { DocumentNumberGenerator, DomainEvent, EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import type { StockMovement, StockMovementRepository } from '../inventory/index.js';
import type { ShiftRepository } from '../station-ops/shifts/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../station-ops/business-days/index.js';
import type { SupplierRepository } from '../crm/suppliers/index.js';
import type { Purchase, PurchaseRepository, SupplierTransaction, SupplierTransactionRepository } from './ports.js';

export interface TankAllocationInput {
  tankId: string;
  quantity: number | string;
}

export interface RecordPurchaseCommand {
  supplierId: string;
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  invoiceNumber?: string | null;
  notes?: string;
  tankAllocations?: TankAllocationInput[] | null;
  shiftId?: string;
  stationId?: string;
  transactionDate?: string;
}

const schema = z.object({
  supplierId: z.string().min(1, 'supplierId is required'),
  productId: z.string().min(1, 'productId is required'),
  quantity: z.coerce.number().positive('quantity must be positive'),
  unitPrice: z.coerce.number().positive('unitPrice must be positive'),
  invoiceNumber: z.string().max(100).nullish(),
  notes: z.string().max(500).optional(),
  tankAllocations: z
    .array(z.object({ tankId: z.string().min(1), quantity: z.coerce.number().nonnegative() }))
    .nullish(),
  shiftId: z.string().min(1).optional(),
  stationId: z.string().min(1).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
});

export interface RecordPurchaseDeps {
  purchases: PurchaseRepository;
  stock: StockMovementRepository;
  supplierTxns: SupplierTransactionRepository;
  suppliers: SupplierRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  docNumbers: DocumentNumberGenerator;
  events: EventPublisher;
}

export interface RecordPurchaseResult {
  purchase: Purchase;
  movements: StockMovement[];
  payable: SupplierTransaction;
}

/**
 * Record a goods receipt + supplier invoice. A purchase is an inventory + payable
 * event anchored to the business day, never the cash drawer (payment is a separate
 * RecordSupplierPayment). Increments tank/product stock and raises a payable.
 */
export class RecordPurchase implements UseCase<RecordPurchaseCommand, RecordPurchaseResult> {
  constructor(private readonly deps: RecordPurchaseDeps) {}

  async execute(input: RecordPurchaseCommand, ctx: ExecutionContext): Promise<Result<RecordPurchaseResult>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordPurchase command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const supplier = await this.deps.suppliers.findById(cmd.supplierId);
    if (!supplier || supplier.organizationId !== ctx.organizationId) return err(notFoundError('Supplier', cmd.supplierId));

    let businessDayId: string;
    let stationId = cmd.stationId ?? ctx.stationId ?? null;
    if (cmd.shiftId) {
      const shift = await this.deps.shifts.findById(cmd.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
      businessDayId = shift.businessDayId;
      stationId = shift.stationId;
    } else if (stationId) {
      const date = cmd.transactionDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
      const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, stationId, date);
      businessDayId = bd.id;
    } else {
      return err(validationError('Either shiftId or stationId is required'));
    }

    const allocations = (cmd.tankAllocations ?? []).filter((a) => a.quantity > 0);
    const allocatedTotal = allocations.reduce((acc, a) => acc + a.quantity, 0);
    if (allocations.length > 0 && Math.abs(allocatedTotal - cmd.quantity) > 0.001) {
      return err(invariantViolation('Tank allocations must sum to the purchased quantity', { quantity: cmd.quantity, allocatedTotal }));
    }

    const now = ctx.clock.now().toISOString();
    const amount = cmd.quantity * cmd.unitPrice;
    const documentNumber = await this.deps.docNumbers.next('PURCHASE');
    const purchase: Purchase = {
      id: ctx.ids.newId(),
      documentNumber,
      shiftId: null,
      businessDayId,
      supplierId: supplier.id,
      invoiceNumber: cmd.invoiceNumber ?? null,
      amount: String(amount),
      notes: cmd.notes ?? null,
      createdAt: now,
    };
    await this.deps.purchases.save(purchase);

    const movements: StockMovement[] =
      allocations.length > 0
        ? allocations.map((a) => ({
            id: ctx.ids.newId(),
            shiftId: null,
            businessDayId,
            productId: cmd.productId,
            tankId: a.tankId,
            movementType: 'Purchase',
            quantity: String(a.quantity),
            referenceType: 'PURCHASE',
            referenceId: purchase.id,
            notes: null,
            createdAt: now,
          }))
        : [
            {
              id: ctx.ids.newId(),
              shiftId: null,
              businessDayId,
              productId: cmd.productId,
              tankId: null,
              movementType: 'Purchase',
              quantity: String(cmd.quantity),
              referenceType: 'PURCHASE',
              referenceId: purchase.id,
              notes: null,
              createdAt: now,
            },
          ];
    await this.deps.stock.saveMany(movements);

    const payable: SupplierTransaction = {
      id: ctx.ids.newId(),
      shiftId: null,
      businessDayId,
      supplierId: supplier.id,
      transactionType: 'Purchase',
      amount: String(amount),
      paidFrom: 'BANK',
      affectsDrawer: false,
      referenceType: 'PURCHASE',
      referenceId: purchase.id,
      notes: cmd.invoiceNumber ?? null,
      createdAt: now,
    };
    await this.deps.supplierTxns.save(payable);

    const events: DomainEvent[] = [
      eventFromContext(ctx, {
        eventType: BusinessEvents.PURCHASE_CREATED,
        aggregateType: 'Purchase',
        aggregateId: purchase.id,
        stationId,
        businessDayId,
        payload: { purchaseId: purchase.id, supplierId: supplier.id, productId: cmd.productId, quantity: cmd.quantity, amount: purchase.amount },
      }),
      eventFromContext(ctx, {
        eventType: BusinessEvents.GOODS_RECEIVED,
        aggregateType: 'Purchase',
        aggregateId: purchase.id,
        stationId,
        businessDayId,
        payload: { purchaseId: purchase.id, productId: cmd.productId, quantity: cmd.quantity },
      }),
      eventFromContext(ctx, {
        eventType: BusinessEvents.SUPPLIER_INVOICE_CREATED,
        aggregateType: 'Supplier',
        aggregateId: supplier.id,
        stationId,
        businessDayId,
        payload: { purchaseId: purchase.id, supplierId: supplier.id, amount: purchase.amount },
      }),
    ];
    await this.deps.events.publish(events);

    return ok({ purchase, movements, payable });
  }
}
