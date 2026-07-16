import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../kernel/index.js';
import type { EventPublisher, ExecutionContext, DocumentNumberGenerator, Result, UseCase } from '../../kernel/index.js';
import type { ShiftRepository } from '../station-ops/shifts/index.js';
import type { StockMovement, StockMovementRepository } from '../inventory/index.js';
import type { ProductRepository } from '../station-setup/products/index.js';
import { computeLineTax } from '../finance/tax/index.js';
import type { Sale, SaleLine, SaleRepository, MerchandiseHandoverRepository } from './ports.js';

export interface MerchandiseHandoverLineInput {
  productId: string;
  quantity: number | string;
}

export interface RecordMerchandiseHandoverCommand {
  shiftId: string;
  /** Employee credited with the walk-in merchandise sales. */
  attendantId: string;
  lines: MerchandiseHandoverLineInput[];
  /** Portion of this (cash-recorded) handover actually paid by card/UPI on a
   *  terminal — subtracted from the attendant's expected drawer cash. */
  nonCashAmount?: number | string;
}

export interface RecordMerchandiseHandoverDeps {
  sales: SaleRepository;
  handovers: MerchandiseHandoverRepository;
  stock: StockMovementRepository;
  products: ProductRepository;
  shifts: ShiftRepository;
  docNumbers: DocumentNumberGenerator;
  events: EventPublisher;
}

export interface RecordMerchandiseHandoverResult {
  sale: Sale;
  lines: SaleLine[];
}

const schema = z.object({
  shiftId: z.string().min(1, 'shiftId is required'),
  attendantId: z.string().min(1, 'attendantId is required'),
  lines: z
    .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().positive() }))
    .min(1, 'at least one line is required'),
  nonCashAmount: z.coerce.number().min(0).optional(),
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Record (or replace) an employee's walk-in merchandise "handover" — the bulk,
 * itemized tally of non-fuel goods they sold this shift. It's a real cash sale
 * attributed to that employee, so it flows into their cash-handover
 * reconciliation. Prices are the product's saved MRP (tax-inclusive per config);
 * no per-line discount here (use the quick-entry sale drawer for that).
 *
 * Editable before shift close: re-recording deletes the prior handover sale
 * (and its stock movements) and writes a fresh one. Run inside runInTransaction.
 */
export class RecordMerchandiseHandover implements UseCase<RecordMerchandiseHandoverCommand, RecordMerchandiseHandoverResult> {
  constructor(private readonly deps: RecordMerchandiseHandoverDeps) {}

  async execute(input: RecordMerchandiseHandoverCommand, ctx: ExecutionContext): Promise<Result<RecordMerchandiseHandoverResult>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordMerchandiseHandover command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const shift = await this.deps.shifts.findById(cmd.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
    if (shift.status !== 'OPEN') return err(invariantViolation('Shift is not open', { shiftId: shift.id, status: shift.status }));

    // Replace any prior handover for this employee (pre-close edit).
    const existingId = await this.deps.handovers.findHandoverSaleId(cmd.shiftId, cmd.attendantId);
    if (existingId) await this.deps.handovers.deleteHandoverSale(existingId);

    const now = ctx.clock.now().toISOString();
    const saleId = ctx.ids.newId();
    let subtotal = 0;
    let taxTotal = 0;
    let total = 0;
    const lines: SaleLine[] = [];
    const movements: StockMovement[] = [];

    for (const line of cmd.lines) {
      const product = await this.deps.products.findById(line.productId);
      if (!product || product.organizationId !== ctx.organizationId) return err(notFoundError('Product', line.productId));
      if (product.productType === 'FUEL') return err(validationError('Fuel cannot be sold as merchandise', { productId: line.productId }));

      const unitPrice = product.sellingPrice != null ? Number(product.sellingPrice) : 0;
      if (!(unitPrice > 0)) return err(validationError('Product has no selling price set', { productId: line.productId, name: product.name }));

      const qty = Number(line.quantity);
      const inclusive = product.taxCategory === 'GST' ? product.taxConfig?.price_inclusive !== false : false;
      const tax = computeLineTax(
        {
          taxCategory: product.taxCategory,
          taxableAmount: round2(qty * unitPrice),
          gstRatePct: product.taxConfig?.gst_rate,
          vatRatePct: product.taxConfig?.vat_rate,
          cessPct: product.taxConfig?.cess,
          inclusive,
        },
        false, // walk-in B2C is intra-state (station's own state)
      );

      subtotal = round2(subtotal + tax.taxableAmount);
      taxTotal = round2(taxTotal + tax.taxTotal);
      total = round2(total + tax.total);

      lines.push({
        id: ctx.ids.newId(),
        saleId,
        productId: line.productId,
        quantity: String(qty),
        unitPrice: String(unitPrice),
        discountAmount: '0',
        taxAmount: String(tax.taxTotal),
        lineTotal: String(tax.total),
        createdAt: now,
      });

      movements.push({
        id: ctx.ids.newId(),
        shiftId: shift.id,
        businessDayId: shift.businessDayId,
        productId: line.productId,
        tankId: null,
        movementType: 'Sale',
        quantity: String(-qty),
        referenceType: 'SALE',
        referenceId: saleId,
        notes: null,
        createdAt: now,
      });
    }

    const documentNumber = await this.deps.docNumbers.next('SALE');
    // Non-cash (card/UPI) portion, clamped to the sale total.
    const nonCash = Math.min(Math.max(Number(cmd.nonCashAmount ?? 0), 0), round2(total));
    const sale: Sale = {
      id: saleId,
      documentNumber,
      shiftId: shift.id,
      businessDayId: shift.businessDayId,
      saleType: 'Product',
      captureMechanism: 'MERCH_HANDOVER',
      paymentMethod: 'Cash',
      customerId: null,
      vehicleId: null,
      attendantId: cmd.attendantId,
      subtotalAmount: String(subtotal),
      taxAmount: String(taxTotal),
      totalAmount: String(total),
      nonCashAmount: String(nonCash),
      notes: 'Walk-in merchandise handover',
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.sales.save(sale, lines);
    await this.deps.stock.saveMany(movements);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.RETAIL_SALE_CREATED,
        aggregateType: 'Sale',
        aggregateId: saleId,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { saleId, saleType: 'Product', captureMechanism: 'MERCH_HANDOVER', attendantId: cmd.attendantId, totalAmount: sale.totalAmount, replaced: existingId ?? null },
      }),
    ]);

    return ok({ sale, lines });
  }
}
