import { z } from 'zod';
import {
  BusinessEvents,
  err,
  eventFromContext,
  notFoundError,
  ok,
  validationError,
} from '../../kernel/index.js';
import type {
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../kernel/index.js';
import type { SupplierRepository } from '../crm/suppliers/index.js';
import type { FinancialAccountRepository } from '../finance/accounts/index.js';
import { resolveOfficeEntry } from '../finance/office-entry.js';
import type { SupplierTransaction, SupplierTransactionRepository } from './ports.js';

export interface RecordSupplierPaymentCommand {
  supplierId: string;
  amount: number | string;
  stationId?: string;
  entryDate?: string;
  fundingAccountId: string;
  notes?: string;
}

const schema = z.object({
  supplierId: z.string().min(1, 'supplierId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  stationId: z.string().min(1).optional(),
  entryDate: z.string().optional(),
  fundingAccountId: z.string().min(1, 'fundingAccountId is required'),
  notes: z.string().max(500).optional(),
});

export interface RecordSupplierPaymentDeps {
  supplierTxns: SupplierTransactionRepository;
  suppliers: SupplierRepository;
  accounts: FinancialAccountRepository;
  events: EventPublisher;
}

/**
 * Record a payment made to a supplier (reduces the payable). An Office Record
 * (ADR 0005): dated by its Entry Date and paid out of the chosen Funding
 * Account. Never touches a Shift or the Drawer.
 */
export class RecordSupplierPayment implements UseCase<
  RecordSupplierPaymentCommand,
  SupplierTransaction
> {
  constructor(private readonly deps: RecordSupplierPaymentDeps) {}

  async execute(
    input: RecordSupplierPaymentCommand,
    ctx: ExecutionContext,
  ): Promise<Result<SupplierTransaction>> {
    const p = schema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid RecordSupplierPayment command', { issues: p.error.flatten() }),
      );
    const cmd = p.data;

    const supplier = await this.deps.suppliers.findById(cmd.supplierId);
    if (!supplier || supplier.organizationId !== ctx.organizationId)
      return err(notFoundError('Supplier', cmd.supplierId));

    const entry = await resolveOfficeEntry(this.deps, ctx, cmd);
    if (!entry.success) return entry;
    const { stationId, entryDate, fundingAccount } = entry.data;

    const now = ctx.clock.now().toISOString();
    const payment: SupplierTransaction = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId,
      entryDate,
      supplierId: supplier.id,
      transactionType: 'Payment',
      amount: String(cmd.amount),
      fundingAccountId: fundingAccount.id,
      referenceType: null,
      referenceId: null,
      notes: cmd.notes ?? null,
      metadata: {},
      createdAt: now,
    };
    await this.deps.supplierTxns.save(payment);

    const payload = {
      supplierId: supplier.id,
      amount: payment.amount,
      entryDate,
      fundingAccountId: fundingAccount.id,
    };
    const events: DomainEvent[] = [
      eventFromContext(ctx, {
        eventType: BusinessEvents.SUPPLIER_PAID,
        aggregateType: 'Supplier',
        aggregateId: supplier.id,
        stationId,
        businessDayId: null,
        payload,
        presentation: {
          templateId: 'supplier-paid.v2',
          values: {
            supplierName: supplier.name,
            amount: Number(payment.amount),
            accountName: fundingAccount.name,
          },
        },
      }),
      eventFromContext(ctx, {
        eventType: BusinessEvents.PAYMENT_MADE,
        aggregateType: 'Supplier',
        aggregateId: supplier.id,
        stationId,
        businessDayId: null,
        payload,
        presentation: {
          templateId: 'payment-made.v2',
          values: {
            partyName: supplier.name,
            amount: Number(payment.amount),
            accountName: fundingAccount.name,
          },
        },
      }),
    ];
    await this.deps.events.publish(events);

    return ok(payment);
  }
}
