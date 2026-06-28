import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { DocumentNumberGenerator, EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { ShiftRepository } from '../../station-ops/shifts/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../../station-ops/business-days/index.js';
import type { CustomerRepository } from '../customers/index.js';

export type CollectionPaymentMethod = 'Cash' | 'Card' | 'UPI' | 'BankTransfer';

export interface Collection {
  id: string;
  documentNumber: string;
  shiftId: string | null;
  businessDayId: string;
  customerId: string;
  vehicleId: string | null;
  amount: string;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
}

export interface CollectionRepository {
  save(collection: Collection): Promise<void>;
}

/** A customer-ledger entry (credit sale debit, collection credit, adjustment). */
export interface CustomerLedgerEntry {
  id: string;
  shiftId: string | null;
  businessDayId: string;
  customerId: string;
  vehicleId: string | null;
  productId: string | null;
  /** Operator who recorded the entry (attendant accountability); null for back-office entries. */
  attendantId?: string | null;
  /** DU the fuel-on-credit was dispensed from; set for credit sales declared in a DU handover. */
  duId?: string | null;
  transactionType: string;
  amount: string;
  quantity: string | null;
  unitPrice: string | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CustomerLedgerRepository {
  save(entry: CustomerLedgerEntry): Promise<void>;
  /** Look up a single ledger entry by id (for void/correction). */
  findById?(id: string): Promise<CustomerLedgerEntry | null>;
  /** Hard-delete a ledger entry (used to void an in-shift credit-sale correction). */
  delete?(id: string): Promise<void>;
}

export interface RecordCollectionCommand {
  customerId: string;
  amount: number | string;
  paymentMethod: CollectionPaymentMethod;
  shiftId?: string;
  stationId?: string;
  vehicleId?: string | null;
  notes?: string;
  transactionDate?: string;
}

const schema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'BankTransfer']),
  shiftId: z.string().min(1).optional(),
  stationId: z.string().min(1).optional(),
  vehicleId: z.string().nullish(),
  notes: z.string().max(500).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD').optional(),
});

export interface RecordCollectionDeps {
  collections: CollectionRepository;
  ledger: CustomerLedgerRepository;
  customers: CustomerRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayRepository;
  docNumbers: DocumentNumberGenerator;
  events: EventPublisher;
}

/**
 * Record a payment received against a customer's receivable. Only CASH collected
 * at the counter touches the drawer/shift; bank/UPI/card collections (e.g. paid
 * to accounts or the owner) are anchored to the business day with no shift.
 */
export class RecordCollection implements UseCase<RecordCollectionCommand, Collection> {
  constructor(private readonly deps: RecordCollectionDeps) {}

  async execute(input: RecordCollectionCommand, ctx: ExecutionContext): Promise<Result<Collection>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordCollection command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const customer = await this.deps.customers.findById(cmd.customerId);
    if (!customer || customer.organizationId !== ctx.organizationId) return err(notFoundError('Customer', cmd.customerId));

    const affectsDrawer = cmd.paymentMethod === 'Cash';

    let businessDayId: string;
    let shiftId: string | null;
    if (cmd.shiftId) {
      const shift = await this.deps.shifts.findById(cmd.shiftId);
      if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
      if (shift.status === 'LOCKED') return err(invariantViolation('Shift is locked', { shiftId: shift.id }));
      businessDayId = shift.businessDayId;
      shiftId = affectsDrawer ? shift.id : null;
    } else if (cmd.stationId) {
      const date = cmd.transactionDate ?? ctx.clock.now().toISOString().slice(0, 10);
      const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, cmd.stationId, date);
      businessDayId = bd.id;
      shiftId = null;
    } else {
      return err(validationError('Either shiftId or stationId is required'));
    }

    const now = ctx.clock.now().toISOString();
    const documentNumber = await this.deps.docNumbers.next('COLLECTION');
    const collection: Collection = {
      id: ctx.ids.newId(),
      documentNumber,
      shiftId,
      businessDayId,
      customerId: customer.id,
      vehicleId: cmd.vehicleId ?? null,
      amount: String(cmd.amount),
      paymentMethod: cmd.paymentMethod,
      notes: cmd.notes ?? null,
      createdAt: now,
    };
    await this.deps.collections.save(collection);

    // Customer ledger credit (reduces receivable).
    await this.deps.ledger.save({
      id: ctx.ids.newId(),
      shiftId,
      businessDayId,
      customerId: customer.id,
      vehicleId: cmd.vehicleId ?? null,
      productId: null,
      transactionType: 'Collection',
      amount: String(cmd.amount),
      quantity: null,
      unitPrice: null,
      referenceType: 'COLLECTION',
      referenceId: collection.id,
      notes: cmd.notes ?? null,
      createdAt: now,
    });

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CREDIT_PAYMENT_RECEIVED,
        aggregateType: 'Customer',
        aggregateId: customer.id,
        businessDayId,
        payload: { collectionId: collection.id, customerId: customer.id, amount: collection.amount, paymentMethod: cmd.paymentMethod, affectsDrawer, shiftId },
      }),
    ]);

    return ok(collection);
  }
}
