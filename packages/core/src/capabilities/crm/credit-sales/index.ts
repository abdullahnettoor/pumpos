import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { ShiftRepository } from '../../station-ops/shifts/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../../station-ops/business-days/index.js';
import type { CustomerRepository } from '../customers/index.js';
import type { CustomerLedgerEntry, CustomerLedgerRepository } from '../collections/index.js';

export interface RecordCreditSaleCommand {
  customerId: string;
  amount: number | string;
  shiftId?: string;
  stationId?: string;
  vehicleId?: string | null;
  productId?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  /** Operator who recorded the credit sale; defaults to the acting user within a shift. */
  attendantId?: string | null;
  /** DU the fuel-on-credit was dispensed from (when declared in a DU handover). */
  duId?: string | null;
  notes?: string;
  transactionDate?: string;
}

const schema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  shiftId: z.string().min(1).optional(),
  stationId: z.string().min(1).optional(),
  vehicleId: z.string().nullish(),
  productId: z.string().nullish(),
  quantity: z.coerce.number().positive().nullish(),
  unitPrice: z.coerce.number().nonnegative().nullish(),
  attendantId: z.string().nullish(),
  duId: z.string().nullish(),
  notes: z.string().max(500).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
});

export interface RecordCreditSaleDeps {
  ledger: CustomerLedgerRepository;
  customers: CustomerRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

/**
 * Record a credit sale as a customer receivable (a debit on the customer ledger).
 * A credit sale never adds to the cash drawer, so it never affects drawer
 * reconciliation. It DOES retain a shift link when entered during a shift, since
 * a credit sale is an attendant action — this preserves operator accountability
 * and lets the creditor trace the originating shift later. For fleet fuel sold on
 * credit, the fuel is already metered via nozzle readings — this records only the
 * receivable, never a stock movement (so stock is not double-counted).
 * Receivable = Σ credit sales − Σ collections. Run inside runInTransaction.
 */
export class RecordCreditSale implements UseCase<RecordCreditSaleCommand, CustomerLedgerEntry> {
  constructor(private readonly deps: RecordCreditSaleDeps) {}

  async execute(input: RecordCreditSaleCommand, ctx: ExecutionContext): Promise<Result<CustomerLedgerEntry>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordCreditSale command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const customer = await this.deps.customers.findById(cmd.customerId);
    if (!customer || customer.organizationId !== ctx.organizationId) return err(notFoundError('Customer', cmd.customerId));

    let businessDayId: string;
    let shiftId: string | null = null;
    if (cmd.shiftId) {
      const shift = await this.deps.shifts.findById(cmd.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
      if (shift.status === 'LOCKED') return err(invariantViolation('Shift is locked', { shiftId: shift.id }));
      businessDayId = shift.businessDayId;
      shiftId = shift.id;
    } else if (cmd.stationId) {
      const date = cmd.transactionDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
      const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, cmd.stationId, date);
      businessDayId = bd.id;
    } else {
      return err(validationError('Either shiftId or stationId is required'));
    }

    const now = ctx.clock.now().toISOString();
    // Attendant attribution applies only to shift-anchored credit sales; a
    // back-office (business-day) credit entry has no attendant.
    const attendantId = shiftId ? (cmd.attendantId ?? ctx.actorId ?? null) : null;
    const entry: CustomerLedgerEntry = {
      id: ctx.ids.newId(),
      shiftId,
      businessDayId,
      customerId: customer.id,
      vehicleId: cmd.vehicleId ?? null,
      productId: cmd.productId ?? null,
      attendantId,
      duId: shiftId ? (cmd.duId ?? null) : null,
      transactionType: 'Credit Sale',
      amount: String(cmd.amount),
      quantity: cmd.quantity != null ? String(cmd.quantity) : null,
      unitPrice: cmd.unitPrice != null ? String(cmd.unitPrice) : null,
      referenceType: 'CREDIT_SALE',
      referenceId: null,
      notes: cmd.notes ?? null,
      createdAt: now,
    };
    await this.deps.ledger.save(entry);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CREDIT_SALE_CREATED,
        aggregateType: 'Customer',
        aggregateId: customer.id,
        businessDayId,
        payload: { customerId: customer.id, vehicleId: entry.vehicleId, amount: entry.amount },
      }),
    ]);

    return ok(entry);
  }
}

export interface VoidCreditSaleCommand {
  /** The customer_transactions id of the credit-sale ledger entry to void. */
  id: string;
}

export interface VoidCreditSaleDeps {
  ledger: CustomerLedgerRepository;
  shifts: ShiftRepository;
  events: EventPublisher;
}

/**
 * Void (remove) a credit-sale receivable. Used to correct a credit fuel sale
 * declared during a DU handover before the shift closes. Only a 'Credit Sale'
 * entry whose originating shift is still OPEN may be voided — once the shift is
 * closed the receivable is part of an immutable summary and must be reversed via
 * an adjustment instead. Run inside runInTransaction.
 */
export class VoidCreditSale implements UseCase<VoidCreditSaleCommand, { id: string }> {
  constructor(private readonly deps: VoidCreditSaleDeps) {}

  async execute(input: VoidCreditSaleCommand, ctx: ExecutionContext): Promise<Result<{ id: string }>> {
    if (!input?.id) return err(validationError('id is required'));
    if (!this.deps.ledger.findById || !this.deps.ledger.delete) {
      return err(invariantViolation('Ledger repository does not support void'));
    }
    const entry = await this.deps.ledger.findById(input.id);
    if (!entry) return err(notFoundError('CreditSale', input.id));
    if (entry.transactionType !== 'Credit Sale' || entry.referenceType !== 'CREDIT_SALE') {
      return err(invariantViolation('Only a credit sale can be voided', { id: input.id, type: entry.transactionType }));
    }
    if (entry.shiftId) {
      const shift = await this.deps.shifts.findById(entry.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', entry.shiftId));
      if (shift.status !== 'OPEN') return err(invariantViolation('Cannot void a credit sale after its shift is closed', { shiftId: shift.id, status: shift.status }));
    }

    await this.deps.ledger.delete(input.id);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CREDIT_SALE_VOIDED,
        aggregateType: 'Customer',
        aggregateId: entry.customerId ?? entry.id,
        businessDayId: entry.businessDayId,
        payload: { creditSaleId: input.id, customerId: entry.customerId, amount: entry.amount, duId: entry.duId ?? null },
      }),
    ]);

    return ok({ id: input.id });
  }
}

// ---------------------------------------------------------------------------
// OMC fleet-card sales (settled to the CMS account, NOT a customer receivable)
// ---------------------------------------------------------------------------

export interface RecordOmcCardSaleCommand {
  /** Optional — an OMC card sale may be anonymous (no station-tracked customer). */
  customerId?: string | null;
  amount: number | string;
  shiftId?: string;
  stationId?: string;
  vehicleId?: string | null;
  productId?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  attendantId?: string | null;
  duId?: string | null;
  notes?: string;
  transactionDate?: string;
}

const omcSchema = z.object({
  customerId: z.string().min(1).nullish(),
  amount: z.coerce.number().positive('amount must be positive'),
  shiftId: z.string().min(1).optional(),
  stationId: z.string().min(1).optional(),
  vehicleId: z.string().nullish(),
  productId: z.string().nullish(),
  quantity: z.coerce.number().positive().nullish(),
  unitPrice: z.coerce.number().nonnegative().nullish(),
  attendantId: z.string().nullish(),
  duId: z.string().nullish(),
  notes: z.string().max(500).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
});

export interface RecordOmcCardSaleDeps {
  ledger: CustomerLedgerRepository;
  customers: CustomerRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

/**
 * Record an OMC fleet-card fuel sale. Unlike a credit sale, this is NOT a
 * customer receivable: the Oil Marketing Company settles the value to the
 * station's CMS (card-settlement) account, so the money is posted IN to CMS by
 * the caller (LedgerPostingService.postOmcCardSale) — it never touches the cash
 * drawer and never debits a customer balance. A customer link is optional (MIS
 * only). The fuel is already metered via nozzle readings, so no stock moves.
 * Run inside runInTransaction.
 */
export class RecordOmcCardSale implements UseCase<RecordOmcCardSaleCommand, CustomerLedgerEntry> {
  constructor(private readonly deps: RecordOmcCardSaleDeps) {}

  async execute(input: RecordOmcCardSaleCommand, ctx: ExecutionContext): Promise<Result<CustomerLedgerEntry>> {
    const p = omcSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordOmcCardSale command', { issues: p.error.flatten() }));
    const cmd = p.data;

    let customerId: string | null = null;
    if (cmd.customerId) {
      const customer = await this.deps.customers.findById(cmd.customerId);
      if (!customer || customer.organizationId !== ctx.organizationId) return err(notFoundError('Customer', cmd.customerId));
      customerId = customer.id;
    }

    let businessDayId: string;
    let shiftId: string | null = null;
    if (cmd.shiftId) {
      const shift = await this.deps.shifts.findById(cmd.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
      if (shift.status === 'LOCKED') return err(invariantViolation('Shift is locked', { shiftId: shift.id }));
      businessDayId = shift.businessDayId;
      shiftId = shift.id;
    } else if (cmd.stationId) {
      const date = cmd.transactionDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
      const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, cmd.stationId, date);
      businessDayId = bd.id;
    } else {
      return err(validationError('Either shiftId or stationId is required'));
    }

    const now = ctx.clock.now().toISOString();
    const attendantId = shiftId ? (cmd.attendantId ?? ctx.actorId ?? null) : null;
    const entry: CustomerLedgerEntry = {
      id: ctx.ids.newId(),
      shiftId,
      businessDayId,
      customerId,
      vehicleId: cmd.vehicleId ?? null,
      productId: cmd.productId ?? null,
      attendantId,
      duId: shiftId ? (cmd.duId ?? null) : null,
      transactionType: 'OMC Sale',
      amount: String(cmd.amount),
      quantity: cmd.quantity != null ? String(cmd.quantity) : null,
      unitPrice: cmd.unitPrice != null ? String(cmd.unitPrice) : null,
      referenceType: 'OMC_CARD_SALE',
      referenceId: null,
      notes: cmd.notes ?? null,
      createdAt: now,
    };
    await this.deps.ledger.save(entry);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.OMC_CARD_SALE_CREATED,
        aggregateType: 'Customer',
        aggregateId: customerId ?? entry.id,
        businessDayId,
        payload: { omcSaleId: entry.id, customerId, vehicleId: entry.vehicleId, amount: entry.amount, duId: entry.duId ?? null },
      }),
    ]);

    return ok(entry);
  }
}

export interface VoidOmcCardSaleCommand {
  /** The customer_transactions id of the OMC-card-sale entry to void. */
  id: string;
}

export interface VoidOmcCardSaleDeps {
  ledger: CustomerLedgerRepository;
  shifts: ShiftRepository;
  events: EventPublisher;
}

/**
 * Void an OMC fleet-card sale (correction while the originating shift is still
 * OPEN). Only an 'OMC Sale' entry may be voided here; the caller also reverses
 * the CMS money-in posting. Run inside runInTransaction.
 */
export class VoidOmcCardSale implements UseCase<VoidOmcCardSaleCommand, { id: string }> {
  constructor(private readonly deps: VoidOmcCardSaleDeps) {}

  async execute(input: VoidOmcCardSaleCommand, ctx: ExecutionContext): Promise<Result<{ id: string }>> {
    if (!input?.id) return err(validationError('id is required'));
    if (!this.deps.ledger.findById || !this.deps.ledger.delete) {
      return err(invariantViolation('Ledger repository does not support void'));
    }
    const entry = await this.deps.ledger.findById(input.id);
    if (!entry) return err(notFoundError('OmcCardSale', input.id));
    if (entry.transactionType !== 'OMC Sale' || entry.referenceType !== 'OMC_CARD_SALE') {
      return err(invariantViolation('Only an OMC card sale can be voided', { id: input.id, type: entry.transactionType }));
    }
    if (entry.shiftId) {
      const shift = await this.deps.shifts.findById(entry.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', entry.shiftId));
      if (shift.status !== 'OPEN') return err(invariantViolation('Cannot void an OMC card sale after its shift is closed', { shiftId: shift.id, status: shift.status }));
    }

    await this.deps.ledger.delete(input.id);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.OMC_CARD_SALE_VOIDED,
        aggregateType: 'Customer',
        aggregateId: entry.customerId ?? entry.id,
        businessDayId: entry.businessDayId,
        payload: { omcSaleId: input.id, customerId: entry.customerId, amount: entry.amount, duId: entry.duId ?? null },
      }),
    ]);

    return ok({ id: input.id });
  }
}
