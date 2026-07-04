import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../kernel/index.js';
import type { DomainEvent, EventPublisher, ExecutionContext, DocumentNumberGenerator, Result, UseCase } from '../../kernel/index.js';
import type { ShiftRepository } from '../station-ops/shifts/index.js';
import type { StockMovement, StockMovementRepository } from '../inventory/index.js';
import type { CustomerLedgerRepository } from '../crm/collections/index.js';
import type { CustomerRepository } from '../crm/customers/index.js';
import type { Sale, SaleLine, SalePaymentMethod, SaleRepository, SaleType } from './ports.js';

export interface SaleLineInput {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discountAmount?: number | string;
  taxAmount?: number | string;
  /** Present for fuel lines: the tank stock decrements from. */
  tankId?: string | null;
}

export interface CreateSaleCommand {
  shiftId: string;
  paymentMethod: SalePaymentMethod;
  lines: SaleLineInput[];
  customerId?: string | null;
  vehicleId?: string | null;
  /** Operator who made the sale; defaults to the acting user when omitted. */
  attendantId?: string | null;
  notes?: string;
}

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discountAmount: z.coerce.number().min(0).optional(),
  taxAmount: z.coerce.number().min(0).optional(),
  tankId: z.string().nullish(),
});
const schema = z.object({
  shiftId: z.string().min(1, 'shiftId is required'),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'Credit']),
  lines: z.array(lineSchema).min(1, 'at least one line is required'),
  customerId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  attendantId: z.string().nullish(),
  notes: z.string().max(500).optional(),
});

export interface CreateSaleDeps {
  sales: SaleRepository;
  stock: StockMovementRepository;
  ledger: CustomerLedgerRepository;
  customers: CustomerRepository;
  shifts: ShiftRepository;
  docNumbers: DocumentNumberGenerator;
  events: EventPublisher;
}

export interface CreateSaleResult {
  sale: Sale;
  lines: SaleLine[];
}

/**
 * Create a retail sale (merchandise and/or fuel) in one unified model. Decrements
 * inventory for every line, records a customer-ledger debit when paid on credit,
 * and stamps the payment method so drawer reconciliation can sum cash sales.
 * A "credit sale" is simply a sale with paymentMethod = Credit. Run inside
 * runInTransaction.
 */
export class CreateSale implements UseCase<CreateSaleCommand, CreateSaleResult> {
  constructor(private readonly deps: CreateSaleDeps) {}

  async execute(input: CreateSaleCommand, ctx: ExecutionContext): Promise<Result<CreateSaleResult>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateSale command', { issues: p.error.flatten() }));
    const cmd = p.data;

    if (cmd.paymentMethod === 'Credit' && !cmd.customerId) {
      return err(validationError('A credit sale requires a customerId'));
    }

    const shift = await this.deps.shifts.findById(cmd.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
    if (shift.status !== 'OPEN') return err(invariantViolation('Shift is not open', { shiftId: shift.id, status: shift.status }));

    if (cmd.customerId) {
      const customer = await this.deps.customers.findById(cmd.customerId);
      if (!customer || customer.organizationId !== ctx.organizationId) return err(notFoundError('Customer', cmd.customerId));
    }

    const now = ctx.clock.now().toISOString();
    const saleId = ctx.ids.newId();

    let subtotal = 0;
    let taxTotal = 0;
    let total = 0;
    let hasFuel = false;
    let hasItem = false;
    const lines: SaleLine[] = [];
    const movements: StockMovement[] = [];

    for (const line of cmd.lines) {
      const qty = line.quantity;
      const discount = line.discountAmount ?? 0;
      const tax = line.taxAmount ?? 0;
      const lineSubtotal = qty * line.unitPrice - discount;
      const lineTotal = lineSubtotal + tax;
      subtotal += lineSubtotal;
      taxTotal += tax;
      total += lineTotal;

      lines.push({
        id: ctx.ids.newId(),
        saleId,
        productId: line.productId,
        quantity: String(qty),
        unitPrice: String(line.unitPrice),
        discountAmount: String(discount),
        taxAmount: String(tax),
        lineTotal: String(lineTotal),
        createdAt: now,
      });

      if (line.tankId) hasFuel = true;
      else hasItem = true;

      movements.push({
        id: ctx.ids.newId(),
        shiftId: shift.id,
        businessDayId: shift.businessDayId,
        productId: line.productId,
        tankId: line.tankId ?? null,
        movementType: 'Sale',
        quantity: String(-qty),
        referenceType: 'SALE',
        referenceId: saleId,
        notes: null,
        createdAt: now,
      });
    }

    const saleType: SaleType = hasFuel && hasItem ? 'Mixed' : hasFuel ? 'Fuel' : 'Product';
    const attendantId = cmd.attendantId ?? ctx.actorId ?? null;
    const documentNumber = await this.deps.docNumbers.next('SALE');
    const sale: Sale = {
      id: saleId,
      documentNumber,
      shiftId: shift.id,
      businessDayId: shift.businessDayId,
      saleType,
      captureMechanism: 'POS',
      paymentMethod: cmd.paymentMethod,
      customerId: cmd.customerId ?? null,
      vehicleId: cmd.vehicleId ?? null,
      attendantId,
      subtotalAmount: String(subtotal),
      taxAmount: String(taxTotal),
      totalAmount: String(total),
      nonCashAmount: '0',
      notes: cmd.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.sales.save(sale, lines);
    await this.deps.stock.saveMany(movements);

    if (cmd.paymentMethod === 'Credit' && cmd.customerId) {
      await this.deps.ledger.save({
        id: ctx.ids.newId(),
        shiftId: shift.id,
        businessDayId: shift.businessDayId,
        customerId: cmd.customerId,
        vehicleId: cmd.vehicleId ?? null,
        productId: null,
        attendantId,
        transactionType: 'Credit Sale',
        amount: String(total),
        quantity: null,
        unitPrice: null,
        referenceType: 'SALE',
        referenceId: saleId,
        notes: cmd.notes ?? null,
        createdAt: now,
      });
    }

    const events: DomainEvent[] = [
      eventFromContext(ctx, {
        eventType: BusinessEvents.RETAIL_SALE_CREATED,
        aggregateType: 'Sale',
        aggregateId: saleId,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { saleId, saleType, paymentMethod: cmd.paymentMethod, totalAmount: sale.totalAmount, customerId: sale.customerId },
      }),
    ];
    if (hasFuel) {
      events.push(
        eventFromContext(ctx, {
          eventType: BusinessEvents.FUEL_SALE_RECORDED,
          aggregateType: 'Sale',
          aggregateId: saleId,
          stationId: shift.stationId,
          businessDayId: shift.businessDayId,
          payload: { saleId },
        }),
      );
    }
    if (cmd.paymentMethod === 'Credit') {
      events.push(
        eventFromContext(ctx, {
          eventType: BusinessEvents.CREDIT_SALE_CREATED,
          aggregateType: 'Customer',
          aggregateId: cmd.customerId as string,
          stationId: shift.stationId,
          businessDayId: shift.businessDayId,
          payload: { saleId, customerId: cmd.customerId, amount: sale.totalAmount },
        }),
      );
    }
    await this.deps.events.publish(events);

    return ok({ sale, lines });
  }
}
