import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../kernel/index.js';
import type { DocumentNumberGenerator, DomainEvent, EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import type { StockMovement, StockMovementRepository } from '../inventory/index.js';
import type { ShiftRepository } from '../station-ops/shifts/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../station-ops/business-days/index.js';
import type { SupplierRepository } from '../crm/suppliers/index.js';
import type { ProductRepository } from '../station-setup/products/index.js';
import type { StationRepository } from '../station-setup/stations/index.js';
import { computeLineTax, isInterState } from '../finance/tax/index.js';
import type { Purchase, PurchaseItem, PurchaseItemRepository, PurchaseRepository, SupplierTransaction, SupplierTransactionRepository } from './ports.js';

export interface TankAllocationInput {
  tankId: string;
  quantity: number | string;
}

export interface PurchaseLineInput {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  tankAllocations?: TankAllocationInput[] | null;
}

export interface RecordPurchaseCommand {
  supplierId: string;
  invoiceNumber?: string | null;
  notes?: string;
  /** Line items of the supplier invoice. */
  lines?: PurchaseLineInput[];
  shiftId?: string;
  stationId?: string;
  transactionDate?: string;
  // --- Legacy single-line shape (still accepted; normalised to one line) ---
  productId?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  tankAllocations?: TankAllocationInput[] | null;
}

const tankAllocationSchema = z.object({ tankId: z.string().min(1), quantity: z.coerce.number().nonnegative() });
const lineSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.coerce.number().positive('quantity must be positive'),
  unitPrice: z.coerce.number().positive('unitPrice must be positive'),
  tankAllocations: z.array(tankAllocationSchema).nullish(),
});

const schema = z
  .object({
    supplierId: z.string().min(1, 'supplierId is required'),
    invoiceNumber: z.string().max(100).nullish(),
    notes: z.string().max(500).optional(),
    lines: z.array(lineSchema).min(1).optional(),
    shiftId: z.string().min(1).optional(),
    stationId: z.string().min(1).optional(),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
    // Legacy single-line fields
    productId: z.string().min(1).optional(),
    quantity: z.coerce.number().positive().optional(),
    unitPrice: z.coerce.number().positive().optional(),
    tankAllocations: z.array(tankAllocationSchema).nullish(),
  })
  .refine((c) => (c.lines && c.lines.length > 0) || (c.productId && c.quantity != null && c.unitPrice != null), {
    message: 'Provide at least one line item (lines[] or legacy productId/quantity/unitPrice)',
    path: ['lines'],
  });

export interface RecordPurchaseDeps {
  purchases: PurchaseRepository;
  purchaseItems: PurchaseItemRepository;
  stock: StockMovementRepository;
  supplierTxns: SupplierTransactionRepository;
  suppliers: SupplierRepository;
  products: ProductRepository;
  stations: StationRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  docNumbers: DocumentNumberGenerator;
  events: EventPublisher;
}

export interface RecordPurchaseResult {
  purchase: Purchase;
  items: PurchaseItem[];
  movements: StockMovement[];
  payable: SupplierTransaction;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const numOrNull = (n: number | null | undefined): string | null => (n == null ? null : String(n));

/**
 * Record a goods receipt + supplier tax invoice. A purchase is an inventory +
 * payable event anchored to the business day, never the cash drawer (payment is
 * a separate RecordSupplierPayment). Each line item updates stock for its product
 * (fuel lines may split across tanks) and carries its own GST/VAT breakup; the
 * header `amount` is the tax-inclusive grand total (the payable).
 */
export class RecordPurchase implements UseCase<RecordPurchaseCommand, RecordPurchaseResult> {
  constructor(private readonly deps: RecordPurchaseDeps) {}

  async execute(input: RecordPurchaseCommand, ctx: ExecutionContext): Promise<Result<RecordPurchaseResult>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordPurchase command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const supplier = await this.deps.suppliers.findById(cmd.supplierId);
    if (!supplier || supplier.organizationId !== ctx.organizationId) return err(notFoundError('Supplier', cmd.supplierId));

    // Normalise to a list of lines (legacy single-line shape → one line).
    const rawLines: PurchaseLineInput[] =
      cmd.lines && cmd.lines.length > 0
        ? cmd.lines
        : [{ productId: cmd.productId!, quantity: cmd.quantity!, unitPrice: cmd.unitPrice!, tankAllocations: cmd.tankAllocations }];

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

    // Resolve inter-state status from supplier state vs buyer (station) state.
    const supplierStateCode = (supplier.metadata as Record<string, unknown> | null)?.stateCode as string | undefined;
    let buyerStateCode: string | undefined;
    if (stationId) {
      const station = await this.deps.stations.findById(stationId);
      const legal = (station?.settings as any)?.legal;
      buyerStateCode = legal?.stateCode ?? undefined;
    }
    const interState = isInterState({ supplierStateCode, buyerStateCode });

    const now = ctx.clock.now().toISOString();
    const purchaseId = ctx.ids.newId();

    const items: PurchaseItem[] = [];
    const movements: StockMovement[] = [];
    const headerTotals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, vat: 0, cess: 0, grand: 0 };
    // Per-product accumulator for the weighted-average cost recompute (FB1).
    // Keyed by productId; value = current cost basis + purchased qty & pre-tax
    // value across this invoice's lines (a product may span multiple lines).
    const costAgg = new Map<string, { oldCost: number; qty: number; value: number }>();

    for (const line of rawLines) {
      const product = await this.deps.products.findById(line.productId);
      if (!product || product.organizationId !== ctx.organizationId) return err(notFoundError('Product', line.productId));

      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      const taxableAmount = round2(quantity * unitPrice);

      // Accumulate cost-basis inputs. unitPrice is the per-unit landed cost:
      // pre-tax for GST items (input tax is creditable), tax-inclusive for fuel
      // (VAT is baked into the entered price). Both are the correct cost basis.
      const agg = costAgg.get(line.productId) ?? { oldCost: Number(product.costBasis ?? 0), qty: 0, value: 0 };
      agg.qty += quantity;
      agg.value += quantity * unitPrice;
      costAgg.set(line.productId, agg);

      const gstRate = product.taxConfig?.gst_rate ?? null;
      const vatRate = product.taxConfig?.vat_rate ?? null;
      const cessRate = product.taxConfig?.cess ?? null;
      // Only GST lines add tax on our side (input GST credit). Fuel is VAT —
      // that VAT is the supplier's output tax baked into the price, not our
      // input credit — so a fuel purchase is recorded tax-inclusive (the entered
      // amount IS the cost). EXEMPT / NON_TAXABLE likewise carry no tax.
      const tax =
        product.taxCategory === 'GST'
          ? computeLineTax({ taxCategory: 'GST', taxableAmount, gstRatePct: gstRate, cessPct: cessRate }, interState)
          : { taxableAmount, cgst: 0, sgst: 0, igst: 0, vat: 0, cess: 0, taxTotal: 0, total: taxableAmount };

      // Fuel lines: validate tank allocations sum to the line quantity.
      const allocations = (line.tankAllocations ?? []).map((a) => ({ tankId: a.tankId, quantity: Number(a.quantity) })).filter((a) => a.quantity > 0);
      const allocatedTotal = allocations.reduce((acc, a) => acc + a.quantity, 0);
      if (allocations.length > 0 && Math.abs(allocatedTotal - quantity) > 0.001) {
        return err(invariantViolation('Tank allocations must sum to the line quantity', { productId: line.productId, quantity, allocatedTotal }));
      }

      items.push({
        id: ctx.ids.newId(),
        purchaseId,
        productId: line.productId,
        quantity: String(quantity),
        unitPrice: String(unitPrice),
        taxCategory: product.taxCategory,
        gstRate: numOrNull(gstRate),
        vatRate: numOrNull(vatRate),
        cessRate: numOrNull(cessRate),
        hsnCode: product.taxConfig?.hsn_code ?? null,
        taxableAmount: String(tax.taxableAmount),
        cgst: String(tax.cgst),
        sgst: String(tax.sgst),
        igst: String(tax.igst),
        vat: String(tax.vat),
        cess: String(tax.cess),
        lineTotal: String(tax.total),
        tankAllocations: allocations.length > 0 ? allocations : null,
        createdAt: now,
      });

      const lineMovements: StockMovement[] =
        allocations.length > 0
          ? allocations.map((a) => ({
              id: ctx.ids.newId(),
              shiftId: null,
              businessDayId,
              productId: line.productId,
              tankId: a.tankId,
              movementType: 'Purchase',
              quantity: String(a.quantity),
              referenceType: 'PURCHASE',
              referenceId: purchaseId,
              notes: null,
              createdAt: now,
            }))
          : [
              {
                id: ctx.ids.newId(),
                shiftId: null,
                businessDayId,
                productId: line.productId,
                tankId: null,
                movementType: 'Purchase',
                quantity: String(quantity),
                referenceType: 'PURCHASE',
                referenceId: purchaseId,
                notes: null,
                createdAt: now,
              },
            ];
      movements.push(...lineMovements);

      headerTotals.taxable = round2(headerTotals.taxable + tax.taxableAmount);
      headerTotals.cgst = round2(headerTotals.cgst + tax.cgst);
      headerTotals.sgst = round2(headerTotals.sgst + tax.sgst);
      headerTotals.igst = round2(headerTotals.igst + tax.igst);
      headerTotals.vat = round2(headerTotals.vat + tax.vat);
      headerTotals.cess = round2(headerTotals.cess + tax.cess);
      headerTotals.grand = round2(headerTotals.grand + tax.total);
    }

    const documentNumber = await this.deps.docNumbers.next('PURCHASE');
    const purchase: Purchase = {
      id: purchaseId,
      documentNumber,
      shiftId: null,
      businessDayId,
      supplierId: supplier.id,
      invoiceNumber: cmd.invoiceNumber ?? null,
      amount: String(headerTotals.grand),
      taxableAmount: String(headerTotals.taxable),
      cgstTotal: String(headerTotals.cgst),
      sgstTotal: String(headerTotals.sgst),
      igstTotal: String(headerTotals.igst),
      vatTotal: String(headerTotals.vat),
      cessTotal: String(headerTotals.cess),
      notes: cmd.notes ?? null,
      createdAt: now,
    };
    await this.deps.purchases.save(purchase);
    await this.deps.purchaseItems.saveMany(items);

    // Recompute each product's rolling weighted-average cost BEFORE persisting the
    // new stock movements, so on-hand quantity reflects the pre-purchase state:
    //   newCost = (onHandQty × oldCost + Σ purchased value) / (onHandQty + purchased qty)
    // A negative on-hand (oversold) is floored to 0 so it can't distort the blend;
    // when the resulting quantity is 0 we keep the prior cost. (FB1 → COGS.)
    for (const [productId, agg] of costAgg) {
      const onHand = await this.deps.stock.currentQuantityForProduct(ctx.organizationId, productId);
      const baseQty = Math.max(onHand, 0);
      const newQty = baseQty + agg.qty;
      const newCost = newQty > 0 ? (baseQty * agg.oldCost + agg.value) / newQty : agg.oldCost;
      await this.deps.products.updateCostBasis(productId, String(round4(newCost)));
    }

    await this.deps.stock.saveMany(movements);

    const payable: SupplierTransaction = {
      id: ctx.ids.newId(),
      shiftId: null,
      businessDayId,
      supplierId: supplier.id,
      transactionType: 'Purchase',
      amount: String(headerTotals.grand),
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
        payload: { purchaseId: purchase.id, supplierId: supplier.id, amount: purchase.amount, lineCount: items.length },
      }),
      ...items.map((it) =>
        eventFromContext(ctx, {
          eventType: BusinessEvents.GOODS_RECEIVED,
          aggregateType: 'Purchase',
          aggregateId: purchase.id,
          stationId,
          businessDayId,
          payload: { purchaseId: purchase.id, productId: it.productId, quantity: Number(it.quantity) },
        }),
      ),
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

    return ok({ purchase, items, movements, payable });
  }
}

