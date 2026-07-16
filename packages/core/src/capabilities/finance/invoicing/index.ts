import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { TaxCategory } from '@pump/shared';
import { computeLineTax, isInterState } from '../tax/index.js';

/** A priced, tax-split line captured on the invoice snapshot. */
export interface InvoiceLineSnapshot {
  productId: string;
  name: string;
  hsnCode: string | null;
  taxCategory: TaxCategory;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableAmount: number;
  gstRate: number | null;
  vatRate: number | null;
  cessRate: number | null;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  cess: number;
  lineTotal: number;
}

/** Persisted invoice row (numerics as strings, mirroring the DB adapter). */
export interface Invoice {
  id: string;
  organizationId: string;
  stationId: string | null;
  saleId: string | null;
  invoiceNumber: string;
  financialYear: string;
  issuedDate: string;
  buyerCustomerId: string | null;
  buyerName: string | null;
  buyerGstin: string | null;
  buyerStateCode: string | null;
  interState: boolean;
  taxableAmount: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  vatTotal: string;
  cessTotal: string;
  roundOff: string;
  totalAmount: string;
  /** Supplier identity + place of supply + priced lines (display / immutability). */
  snapshotData: {
    lines: InvoiceLineSnapshot[];
    interState: boolean;
    supplierGstin: string | null;
    supplierStateCode: string | null;
    placeOfSupply: string | null;
  };
  createdAt: string;
}

export interface InvoiceRepository {
  /** Existing invoice for a sale, if already issued (idempotency). */
  findBySaleId(saleId: string): Promise<Invoice | null>;
  save(invoice: Invoice): Promise<void>;
}

export interface DocumentSequenceRepository {
  /** Atomically return the next gapless number for (org, docType, scope, FY). */
  nextNumber(organizationId: string, docType: string, scope: string, financialYear: string): Promise<number>;
}

/** Indian financial year (Apr–Mar) label for a YYYY-MM-DD date, e.g. '2026-27'. */
export function financialYear(dateYYYYMMDD: string): string {
  const [y, m] = dateYYYYMMDD.split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYY}`;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface GenerateInvoiceLineInput {
  productId: string;
  name: string;
  hsnCode?: string | null;
  taxCategory: TaxCategory;
  gstRate?: number | null;
  vatRate?: number | null;
  cessRate?: number | null;
  quantity: number | string;
  unitPrice: number | string;
  discount?: number | string;
  /** Unit price is tax-inclusive (retail MRP) — extract tax rather than add it. */
  inclusive?: boolean;
}

export interface GenerateInvoiceCommand {
  saleId: string;
  stationId: string | null;
  businessDayId: string;
  issuedDate: string;
  supplierGstin?: string | null;
  supplierStateCode?: string | null;
  buyerCustomerId?: string | null;
  buyerName?: string | null;
  buyerGstin?: string | null;
  buyerStateCode?: string | null;
  placeOfSupply?: string | null;
  lines: GenerateInvoiceLineInput[];
}

export interface GenerateInvoiceDeps {
  invoices: InvoiceRepository;
  sequences: DocumentSequenceRepository;
  events: EventPublisher;
}

const lineSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  hsnCode: z.string().nullish(),
  taxCategory: z.enum(['FUEL_VAT', 'GST', 'EXEMPT', 'NON_TAXABLE']),
  gstRate: z.coerce.number().nullish(),
  vatRate: z.coerce.number().nullish(),
  cessRate: z.coerce.number().nullish(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).optional(),
  inclusive: z.boolean().optional(),
});

const schema = z.object({
  saleId: z.string().min(1),
  stationId: z.string().nullish(),
  businessDayId: z.string().min(1),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplierGstin: z.string().nullish(),
  supplierStateCode: z.string().nullish(),
  buyerCustomerId: z.string().nullish(),
  buyerName: z.string().nullish(),
  buyerGstin: z.string().nullish(),
  buyerStateCode: z.string().nullish(),
  placeOfSupply: z.string().nullish(),
  lines: z.array(lineSchema).min(1, 'at least one line is required'),
});

/**
 * Issue a GST tax invoice for a sale. Idempotent: if the sale was already
 * invoiced, returns the existing invoice. Computes the CGST/SGST vs IGST split
 * (via the pure tax service) from supplier vs buyer state, assigns a gapless
 * per-FY-per-GSTIN number, and snapshots the priced lines. Run inside
 * runInTransaction so the number assignment + insert commit atomically.
 */
export class GenerateInvoice implements UseCase<GenerateInvoiceCommand, Invoice> {
  constructor(private readonly deps: GenerateInvoiceDeps) {}

  async execute(input: GenerateInvoiceCommand, ctx: ExecutionContext): Promise<Result<Invoice>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid GenerateInvoice command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const existing = await this.deps.invoices.findBySaleId(cmd.saleId);
    if (existing) return ok(existing);

    const interState = isInterState({ supplierStateCode: cmd.supplierStateCode, buyerStateCode: cmd.buyerStateCode });

    const snapshotLines: InvoiceLineSnapshot[] = [];
    const totals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, vat: 0, cess: 0, grand: 0 };

    for (const line of cmd.lines) {
      const qty = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      const discount = Number(line.discount ?? 0);
      const lineAmount = round2(qty * unitPrice - discount);
      const tax = computeLineTax(
        { taxCategory: line.taxCategory, taxableAmount: lineAmount, gstRatePct: line.gstRate, vatRatePct: line.vatRate, cessPct: line.cessRate, inclusive: line.inclusive },
        interState,
      );
      // Show the pre-tax unit rate on the invoice so Rate × Qty = Taxable (for
      // inclusive/MRP lines the entered price included tax).
      const displayUnit = line.inclusive && qty > 0 ? round2(tax.taxableAmount / qty) : unitPrice;
      snapshotLines.push({
        productId: line.productId,
        name: line.name,
        hsnCode: line.hsnCode ?? null,
        taxCategory: line.taxCategory,
        quantity: qty,
        unitPrice: displayUnit,
        discount,
        taxableAmount: tax.taxableAmount,
        gstRate: line.gstRate ?? null,
        vatRate: line.vatRate ?? null,
        cessRate: line.cessRate ?? null,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        vat: tax.vat,
        cess: tax.cess,
        lineTotal: tax.total,
      });
      totals.taxable = round2(totals.taxable + tax.taxableAmount);
      totals.cgst = round2(totals.cgst + tax.cgst);
      totals.sgst = round2(totals.sgst + tax.sgst);
      totals.igst = round2(totals.igst + tax.igst);
      totals.vat = round2(totals.vat + tax.vat);
      totals.cess = round2(totals.cess + tax.cess);
      totals.grand = round2(totals.grand + tax.total);
    }

    // Invoice-level rounding to the nearest rupee.
    const totalRounded = Math.round(totals.grand);
    const roundOff = round2(totalRounded - totals.grand);

    const fy = financialYear(cmd.issuedDate);
    const supplierGstin = cmd.supplierGstin ?? '';
    const seq = await this.deps.sequences.nextNumber(ctx.organizationId, 'INVOICE', supplierGstin, fy);
    const invoiceNumber = `INV/${fy}/${String(seq).padStart(5, '0')}`;

    const now = ctx.clock.now().toISOString();
    const invoice: Invoice = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: cmd.stationId ?? null,
      saleId: cmd.saleId,
      invoiceNumber,
      financialYear: fy,
      issuedDate: cmd.issuedDate,
      buyerCustomerId: cmd.buyerCustomerId ?? null,
      buyerName: cmd.buyerName ?? null,
      buyerGstin: cmd.buyerGstin ?? null,
      buyerStateCode: cmd.buyerStateCode ?? null,
      interState,
      taxableAmount: String(totals.taxable),
      cgstTotal: String(totals.cgst),
      sgstTotal: String(totals.sgst),
      igstTotal: String(totals.igst),
      vatTotal: String(totals.vat),
      cessTotal: String(totals.cess),
      roundOff: String(roundOff),
      totalAmount: String(totalRounded),
      snapshotData: {
        lines: snapshotLines,
        interState,
        supplierGstin: cmd.supplierGstin ?? null,
        supplierStateCode: cmd.supplierStateCode ?? null,
        placeOfSupply: cmd.placeOfSupply ?? null,
      },
      createdAt: now,
    };

    await this.deps.invoices.save(invoice);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.INVOICE_GENERATED,
        aggregateType: 'Invoice',
        aggregateId: invoice.id,
        stationId: invoice.stationId,
        businessDayId: cmd.businessDayId,
        payload: { invoiceId: invoice.id, invoiceNumber, saleId: cmd.saleId, total: totalRounded, interState },
      }),
    ]);

    return ok(invoice);
  }
}
