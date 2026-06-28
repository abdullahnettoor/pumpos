import { z } from 'zod';
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
      const date = cmd.transactionDate ?? ctx.clock.now().toISOString().slice(0, 10);
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
