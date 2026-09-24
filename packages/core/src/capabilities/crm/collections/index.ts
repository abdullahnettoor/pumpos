import { z } from 'zod';
import {
  BusinessEvents,
  err,
  eventFromContext,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type {
  DocumentNumberGenerator,
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type { FinancialAccountRepository } from '../../finance/accounts/index.js';
import {
  accountTypesForPaymentMethod,
  resolveOfficeEntry,
  type PaymentTerminalLookup,
} from '../../finance/office-entry.js';
import type { CustomerRepository } from '../customers/index.js';

export type CollectionPaymentMethod = 'Cash' | 'Card' | 'UPI' | 'BankTransfer';

export interface Collection {
  id: string;
  organizationId: string;
  documentNumber: string;
  stationId: string;
  entryDate: string;
  fundingAccountId: string;
  /** Payment Terminal used for a Card/UPI collection (#276). */
  terminalId: string | null;
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
  /** Look up a single ledger entry by id, scoped to the organization (for void/correction). */
  findById?(id: string, organizationId: string): Promise<CustomerLedgerEntry | null>;
  /** Hard-delete a ledger entry, scoped to the organization (void of an in-shift correction). */
  delete?(id: string, organizationId: string): Promise<void>;
}

export interface RecordCollectionCommand {
  customerId: string;
  amount: number | string;
  paymentMethod: CollectionPaymentMethod;
  stationId?: string;
  entryDate?: string;
  /** Required unless a terminal is named (its clearing account is used). */
  fundingAccountId?: string;
  terminalId?: string | null;
  vehicleId?: string | null;
  notes?: string;
}

const schema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  paymentMethod: z.enum(['Cash', 'Card', 'UPI', 'BankTransfer']),
  stationId: z.string().min(1).optional(),
  entryDate: z.string().optional(),
  fundingAccountId: z.string().min(1).optional(),
  terminalId: z.string().min(1).nullish(),
  vehicleId: z.string().nullish(),
  notes: z.string().max(500).optional(),
});

export interface RecordCollectionDeps {
  collections: CollectionRepository;
  customers: CustomerRepository;
  accounts: FinancialAccountRepository;
  terminals?: PaymentTerminalLookup;
  docNumbers: DocumentNumberGenerator;
  events: EventPublisher;
}

/**
 * Record a payment received against a customer's receivable. A Collection is
 * an Office Record (ADR 0005): dated by its Entry Date and landing in the
 * chosen Funding Account, whose type must suit the payment method. It never
 * touches a Shift or the Drawer. The customer balance reads collections
 * directly (Σ credit sales − Σ collections), so no customer-ledger row is
 * written.
 */
export class RecordCollection implements UseCase<RecordCollectionCommand, Collection> {
  constructor(private readonly deps: RecordCollectionDeps) {}

  async execute(
    input: RecordCollectionCommand,
    ctx: ExecutionContext,
  ): Promise<Result<Collection>> {
    const p = schema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid RecordCollection command', { issues: p.error.flatten() }),
      );
    const cmd = p.data;

    const customer = await this.deps.customers.findById(cmd.customerId);
    if (!customer || customer.organizationId !== ctx.organizationId)
      return err(notFoundError('Customer', cmd.customerId));

    const entry = await resolveOfficeEntry(this.deps, ctx, cmd, {
      allowedAccountTypes: accountTypesForPaymentMethod(cmd.paymentMethod),
      paymentMethod: cmd.paymentMethod,
    });
    if (!entry.success) return entry;
    const { stationId, entryDate, fundingAccount, terminalId } = entry.data;

    const now = ctx.clock.now().toISOString();
    const documentNumber = await this.deps.docNumbers.next('COLLECTION');
    const collection: Collection = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      documentNumber,
      stationId,
      entryDate,
      fundingAccountId: fundingAccount.id,
      terminalId,
      customerId: customer.id,
      vehicleId: cmd.vehicleId ?? null,
      amount: String(cmd.amount),
      paymentMethod: cmd.paymentMethod,
      notes: cmd.notes ?? null,
      metadata: {},
      createdAt: now,
    };
    await this.deps.collections.save(collection);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CREDIT_PAYMENT_RECEIVED,
        aggregateType: 'Customer',
        aggregateId: customer.id,
        stationId,
        businessDayId: null,
        payload: {
          collectionId: collection.id,
          customerId: customer.id,
          amount: collection.amount,
          paymentMethod: cmd.paymentMethod,
          entryDate,
          fundingAccountId: fundingAccount.id,
          terminalId,
        },
        presentation: {
          templateId: 'credit-payment-received.v2',
          values: {
            customerName: customer.name,
            amount: Number(collection.amount),
            paymentMethod: cmd.paymentMethod,
            accountName: fundingAccount.name,
          },
        },
      }),
    ]);

    return ok(collection);
  }
}
