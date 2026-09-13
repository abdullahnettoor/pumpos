import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { DocumentNumberGenerator, EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { resolveShiftBusinessDayWrite, type ShiftRepository } from '../../station-ops/shifts/index.js';
import { resolveBusinessDayWrite, type BusinessDayWriteRepository } from '../../station-ops/business-days/index.js';
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
  metadata?: Record<string, unknown>;
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
  /** Null only for an anonymous OMC fleet-card sale (settled to CMS, not a receivable). */
  customerId: string | null;
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
  metadata?: Record<string, unknown>;
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
  businessDays: BusinessDayWriteRepository;
  docNumbers: DocumentNumberGenerator;
  events: EventPublisher;
}

/**
 * Record a payment received against a customer's receivable. Only CASH collected
 * at the counter touches the drawer/shift; bank/UPI/card collections do not
 * affect the drawer but may retain optional shift attribution.
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
    let stationId: string;
    let lateEntry: boolean;
    if (cmd.shiftId) {
      const eligibility = await resolveShiftBusinessDayWrite(this.deps.shifts, this.deps.businessDays, ctx, cmd.shiftId, 'FINANCIAL');
      if (!eligibility.success) return eligibility as unknown as Result<Collection>;
      const shift = eligibility.data.shift;
      stationId = shift.stationId;
      businessDayId = eligibility.data.businessDay.id;
      lateEntry = eligibility.data.lateEntry;
      if (affectsDrawer && (lateEntry || shift.status !== 'OPEN')) {
        return err(invariantViolation('Cash collections require an open Shift and open Business Day', { shiftId: shift.id, shiftStatus: shift.status, businessDayId }));
      }
      shiftId = shift.id;
    } else if (cmd.stationId) {
      const date = cmd.transactionDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
      stationId = cmd.stationId;
      const eligibility = await resolveBusinessDayWrite(this.deps.businessDays, ctx, { stationId, businessDate: date, kind: 'FINANCIAL' });
      if (!eligibility.success) return eligibility as unknown as Result<Collection>;
      businessDayId = eligibility.data.businessDay.id;
      lateEntry = eligibility.data.lateEntry;
      shiftId = null;
      if (affectsDrawer) return err(validationError('Cash collections require shiftId'));
    } else {
      return err(validationError('Either shiftId or stationId is required'));
    }

    const now = ctx.clock.now().toISOString();
    const affectsDrawerToStore = shiftId !== null && affectsDrawer;
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
      metadata: lateEntry ? { lateEntry: true } : {},
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
      metadata: lateEntry ? { lateEntry: true } : {},
      createdAt: now,
    });

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CREDIT_PAYMENT_RECEIVED,
        aggregateType: 'Customer',
        aggregateId: customer.id,
        stationId,
        businessDayId,
        metadata: lateEntry ? { lateEntry: true, lateEntryPrimary: true } : undefined,
        payload: { collectionId: collection.id, customerId: customer.id, amount: collection.amount, paymentMethod: cmd.paymentMethod, affectsDrawer: affectsDrawerToStore, shiftId },
        presentation: {
          templateId: 'credit-payment-received.v1',
          values: { customerName: customer.name, amount: Number(collection.amount), paymentMethod: cmd.paymentMethod },
        },
      }),
    ]);

    return ok(collection);
  }
}
