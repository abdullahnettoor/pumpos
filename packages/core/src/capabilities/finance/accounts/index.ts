import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, conflictError, err, eventFromContext, forbiddenError, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';

export type FinancialAccountType = 'CASH_IN_HAND' | 'PETTY_CASH' | 'BANK' | 'MERCHANT_CLEARING' | 'OWNER';
export type LedgerDirection = 'in' | 'out';
export type LedgerSourceType =
  | 'OPENING'
  | 'SALE_CASH'
  | 'SALE_CARD'
  | 'COLLECTION'
  | 'EXPENSE'
  | 'SUPPLIER_PAYMENT'
  | 'DEPOSIT'
  | 'TRANSFER'
  | 'SETTLEMENT'
  | 'BANK_CHARGE'
  | 'ADJUSTMENT';

export interface FinancialAccount {
  id: string;
  organizationId: string;
  stationId: string | null;
  accountType: FinancialAccountType;
  name: string;
  openingBalance: string;
  openingDate: string | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  organizationId: string;
  stationId: string | null;
  accountId: string;
  direction: LedgerDirection;
  amount: string;
  entryDate: string;
  sourceType: LedgerSourceType;
  sourceId: string | null;
  transferId: string | null;
  businessDayId: string | null;
  shiftId: string | null;
  reconciled: boolean;
  notes: string | null;
  createdAt: string;
}

export interface FinancialAccountRepository {
  findById(id: string): Promise<FinancialAccount | null>;
  existsByName(organizationId: string, stationId: string | null, name: string, excludeId?: string): Promise<boolean>;
  save(account: FinancialAccount): Promise<void>;
}

/** Default display name per system account type (used when auto-provisioning). */
export const DEFAULT_ACCOUNT_NAME: Record<FinancialAccountType, string> = {
  CASH_IN_HAND: 'Cash in Hand',
  PETTY_CASH: 'Petty Cash',
  BANK: 'Bank',
  MERCHANT_CLEARING: 'Card/UPI Clearing',
  OWNER: 'Owner',
};

/** Which account a collection lands in, by payment method (cash → drawer, else bank). */
export function accountTypeForPaymentMethod(method: string): FinancialAccountType {
  return method === 'Cash' ? 'CASH_IN_HAND' : 'BANK';
}

/** Which account an expense / supplier payment comes out of, by funding source. */
export function accountTypeForPaidFrom(paidFrom: string): FinancialAccountType {
  if (paidFrom === 'SHIFT_CASH') return 'CASH_IN_HAND';
  if (paidFrom === 'OWNER') return 'OWNER';
  return 'BANK';
}

export interface LedgerEntryRepository {
  saveMany(entries: LedgerEntry[]): Promise<void>;
}

const accountTypeEnum = z.enum(['CASH_IN_HAND', 'PETTY_CASH', 'BANK', 'MERCHANT_CLEARING', 'OWNER']);

export interface CreateFinancialAccountCommand {
  stationId?: string | null;
  accountType: FinancialAccountType;
  name: string;
  openingBalance?: number | string;
  openingDate?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateFinancialAccountCommand {
  id: string;
  name?: string;
  metadata?: Record<string, unknown> | null;
  isActive?: boolean;
}

const createSchema = z.object({
  stationId: z.string().nullish(),
  accountType: accountTypeEnum,
  name: z.string().trim().min(1, 'name is required').max(150),
  openingBalance: z.union([z.coerce.number(), z.string()]).optional(),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'openingDate must be YYYY-MM-DD').nullish(),
  metadata: z.record(z.any()).nullish(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(150).optional(),
  metadata: z.record(z.any()).nullish(),
  isActive: z.boolean().optional(),
});

export interface FinancialAccountDeps {
  accounts: FinancialAccountRepository;
  ledger: LedgerEntryRepository;
  events: EventPublisher;
}

/**
 * Create a money account (drawer / petty cash / bank / card-UPI clearing /
 * owner). A non-zero opening balance seeds an immutable `OPENING` ledger entry
 * (in when positive, out when negative) so balances reconcile from day one.
 * Run inside runInTransaction.
 */
export class CreateFinancialAccount implements UseCase<CreateFinancialAccountCommand, FinancialAccount> {
  constructor(private readonly deps: FinancialAccountDeps) {}

  async execute(input: CreateFinancialAccountCommand, ctx: ExecutionContext): Promise<Result<FinancialAccount>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateFinancialAccount command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const stationId = cmd.stationId ?? null;
    if (await this.deps.accounts.existsByName(ctx.organizationId, stationId, cmd.name)) {
      return err(conflictError(`An account named "${cmd.name}" already exists`, { name: cmd.name }));
    }

    const now = ctx.clock.now().toISOString();
    const openingBalance = cmd.openingBalance != null ? Number(cmd.openingBalance) : 0;
    const openingDate = cmd.openingDate ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });

    const account: FinancialAccount = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId,
      accountType: cmd.accountType,
      name: cmd.name,
      openingBalance: String(openingBalance),
      openingDate,
      metadata: cmd.metadata ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.accounts.save(account);

    // Seed the opening balance as an immutable OPENING ledger entry so the
    // running ledger and the stored opening figure always agree.
    if (openingBalance !== 0) {
      await this.deps.ledger.saveMany([
        {
          id: ctx.ids.newId(),
          organizationId: ctx.organizationId,
          stationId,
          accountId: account.id,
          direction: openingBalance >= 0 ? 'in' : 'out',
          amount: String(Math.abs(openingBalance)),
          entryDate: openingDate,
          sourceType: 'OPENING',
          sourceId: account.id,
          transferId: null,
          businessDayId: null,
          shiftId: null,
          reconciled: false,
          notes: 'Opening balance',
          createdAt: now,
        },
      ]);
    }

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.FINANCIAL_ACCOUNT_CREATED,
        aggregateType: 'FinancialAccount',
        aggregateId: account.id,
        stationId: stationId ?? undefined,
        payload: { accountId: account.id, accountType: account.accountType, name: account.name, openingBalance: account.openingBalance },
      }),
    ]);

    return ok(account);
  }
}

/** Edit an account's name / metadata / active flag. Opening balance is immutable
 * once set (correct it with an ADJUSTMENT entry, not by editing). */
export class UpdateFinancialAccount implements UseCase<UpdateFinancialAccountCommand, FinancialAccount> {
  constructor(private readonly deps: FinancialAccountDeps) {}

  async execute(input: UpdateFinancialAccountCommand, ctx: ExecutionContext): Promise<Result<FinancialAccount>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateFinancialAccount command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const existing = await this.deps.accounts.findById(cmd.id);
    if (!existing) return err(notFoundError('FinancialAccount', cmd.id));
    if (existing.organizationId !== ctx.organizationId) return err(forbiddenError('Account belongs to another organization'));
    if (cmd.name !== undefined && cmd.name !== existing.name && (await this.deps.accounts.existsByName(ctx.organizationId, existing.stationId, cmd.name, existing.id))) {
      return err(conflictError(`An account named "${cmd.name}" already exists`, { name: cmd.name }));
    }

    const updated: FinancialAccount = {
      ...existing,
      name: cmd.name ?? existing.name,
      metadata: cmd.metadata !== undefined ? cmd.metadata : existing.metadata,
      isActive: cmd.isActive ?? existing.isActive,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.accounts.save(updated);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.FINANCIAL_ACCOUNT_UPDATED,
        aggregateType: 'FinancialAccount',
        aggregateId: updated.id,
        stationId: updated.stationId ?? undefined,
        payload: { accountId: updated.id },
      }),
    ]);

    return ok(updated);
  }
}
