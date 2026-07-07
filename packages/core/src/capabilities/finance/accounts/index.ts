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
  | 'INTEREST'
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
  /** Remove all entries of a given source type for one account (used to rewrite the OPENING entry). */
  deleteByAccountAndSource(accountId: string, sourceType: LedgerSourceType): Promise<void>;
}

const accountTypeEnum = z.enum(['CASH_IN_HAND', 'PETTY_CASH', 'BANK', 'MERCHANT_CLEARING', 'OWNER']);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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

export interface SetOpeningBalanceCommand {
  id: string;
  openingBalance: number | string;
  openingDate?: string | null;
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

const setOpeningSchema = z.object({
  id: z.string().min(1),
  openingBalance: z.coerce.number(),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'openingDate must be YYYY-MM-DD').nullish(),
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

/**
 * Set (or correct) an account's opening balance at any time. Rewrites the single
 * immutable OPENING ledger entry — deletes any existing OPENING entry for the
 * account and re-seeds one at the given amount/date (none when zero) — and keeps
 * the stored `openingBalance`/`openingDate` in sync so balances reconcile from
 * that date. Later sales/expenses/etc. are untouched. Run inside runInTransaction.
 */
export class SetOpeningBalance implements UseCase<SetOpeningBalanceCommand, FinancialAccount> {
  constructor(private readonly deps: FinancialAccountDeps) {}

  async execute(input: SetOpeningBalanceCommand, ctx: ExecutionContext): Promise<Result<FinancialAccount>> {
    const p = setOpeningSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid SetOpeningBalance command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const existing = await this.deps.accounts.findById(cmd.id);
    if (!existing) return err(notFoundError('FinancialAccount', cmd.id));
    if (existing.organizationId !== ctx.organizationId) return err(forbiddenError('Account belongs to another organization'));

    const now = ctx.clock.now().toISOString();
    const opening = round2(Number(cmd.openingBalance));
    const openingDate =
      cmd.openingDate ??
      existing.openingDate ??
      resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });

    const updated: FinancialAccount = {
      ...existing,
      openingBalance: String(opening),
      openingDate,
      updatedAt: now,
    };
    await this.deps.accounts.save(updated);

    // Rewrite the OPENING ledger entry: drop the old one, seed a fresh one when non-zero.
    await this.deps.ledger.deleteByAccountAndSource(existing.id, 'OPENING');
    if (opening !== 0) {
      await this.deps.ledger.saveMany([
        {
          id: ctx.ids.newId(),
          organizationId: ctx.organizationId,
          stationId: existing.stationId,
          accountId: existing.id,
          direction: opening >= 0 ? 'in' : 'out',
          amount: String(Math.abs(opening)),
          entryDate: openingDate,
          sourceType: 'OPENING',
          sourceId: existing.id,
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
        eventType: BusinessEvents.FINANCIAL_ACCOUNT_UPDATED,
        aggregateType: 'FinancialAccount',
        aggregateId: existing.id,
        stationId: existing.stationId ?? undefined,
        payload: { accountId: existing.id, openingBalance: updated.openingBalance, openingDate },
      }),
    ]);

    return ok(updated);
  }
}

export interface RecordTransferCommand {
  fromAccountId: string;
  toAccountId: string;
  amount: number | string;
  date?: string | null;
  notes?: string | null;
}

export interface TransferResult {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  entryDate: string;
}

const transferSchema = z.object({
  fromAccountId: z.string().min(1, 'fromAccountId is required'),
  toAccountId: z.string().min(1, 'toAccountId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').nullish(),
  notes: z.string().max(500).nullish(),
});

/**
 * Move money between two accounts (cash deposit to bank, petty-cash float,
 * bank↔bank …). Writes two linked ledger entries sharing a transferId — OUT of
 * the source, IN to the destination — that net to zero. A cash/petty → bank move
 * is tagged DEPOSIT, everything else TRANSFER. Run inside runInTransaction.
 */
export class RecordTransfer implements UseCase<RecordTransferCommand, TransferResult> {
  constructor(private readonly deps: FinancialAccountDeps) {}

  async execute(input: RecordTransferCommand, ctx: ExecutionContext): Promise<Result<TransferResult>> {
    const p = transferSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordTransfer command', { issues: p.error.flatten() }));
    const cmd = p.data;

    if (cmd.fromAccountId === cmd.toAccountId) return err(validationError('Cannot transfer to the same account'));

    const from = await this.deps.accounts.findById(cmd.fromAccountId);
    if (!from || from.organizationId !== ctx.organizationId) return err(notFoundError('FinancialAccount', cmd.fromAccountId));
    const to = await this.deps.accounts.findById(cmd.toAccountId);
    if (!to || to.organizationId !== ctx.organizationId) return err(notFoundError('FinancialAccount', cmd.toAccountId));

    const now = ctx.clock.now().toISOString();
    const entryDate = cmd.date ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
    const transferId = ctx.ids.newId();
    const amount = String(cmd.amount);
    const stationId = from.stationId ?? to.stationId ?? null;
    const isDeposit = (from.accountType === 'CASH_IN_HAND' || from.accountType === 'PETTY_CASH') && to.accountType === 'BANK';
    const sourceType: LedgerSourceType = isDeposit ? 'DEPOSIT' : 'TRANSFER';
    const label = cmd.notes ?? `${isDeposit ? 'Deposit' : 'Transfer'} ${from.name} → ${to.name}`;

    await this.deps.ledger.saveMany([
      {
        id: ctx.ids.newId(),
        organizationId: ctx.organizationId,
        stationId,
        accountId: from.id,
        direction: 'out',
        amount,
        entryDate,
        sourceType,
        sourceId: transferId,
        transferId,
        businessDayId: null,
        shiftId: null,
        reconciled: false,
        notes: label,
        createdAt: now,
      },
      {
        id: ctx.ids.newId(),
        organizationId: ctx.organizationId,
        stationId,
        accountId: to.id,
        direction: 'in',
        amount,
        entryDate,
        sourceType,
        sourceId: transferId,
        transferId,
        businessDayId: null,
        shiftId: null,
        reconciled: false,
        notes: label,
        createdAt: now,
      },
    ]);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.LEDGER_ENTRY_POSTED,
        aggregateType: 'LedgerTransfer',
        aggregateId: transferId,
        stationId: stationId ?? undefined,
        payload: { transferId, fromAccountId: from.id, toAccountId: to.id, amount, sourceType },
      }),
    ]);

    return ok({ transferId, fromAccountId: from.id, toAccountId: to.id, amount, entryDate });
  }
}

export interface RecordSettlementCommand {
  clearingAccountId: string;
  bankAccountId: string;
  /** Gross card/UPI batch being settled (leaves the clearing account). */
  grossAmount: number | string;
  /** MDR / processing fee withheld by the acquirer (booked as a cost). */
  feeAmount?: number | string;
  date?: string | null;
  notes?: string | null;
}

export interface SettlementResult {
  settlementId: string;
  gross: string;
  fee: string;
  net: string;
  entryDate: string;
}

const settlementSchema = z.object({
  clearingAccountId: z.string().min(1, 'clearingAccountId is required'),
  bankAccountId: z.string().min(1, 'bankAccountId is required'),
  grossAmount: z.coerce.number().positive('grossAmount must be positive'),
  feeAmount: z.coerce.number().min(0).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').nullish(),
  notes: z.string().max(500).nullish(),
});

/**
 * Settle a card/UPI clearing batch to a bank account (FA5). The acquirer deposits
 * the batch NET of MDR, so this posts: clearing OUT (net) → bank IN (net) as a
 * linked transfer, plus clearing OUT (fee) as a BANK_CHARGE cost. Net result: the
 * clearing balance drops by the full gross (net + fee), the bank rises by net, and
 * the MDR is an explicit, queryable cost. Run inside runInTransaction.
 */
export class RecordSettlement implements UseCase<RecordSettlementCommand, SettlementResult> {
  constructor(private readonly deps: FinancialAccountDeps) {}

  async execute(input: RecordSettlementCommand, ctx: ExecutionContext): Promise<Result<SettlementResult>> {
    const p = settlementSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordSettlement command', { issues: p.error.flatten() }));
    const cmd = p.data;

    if (cmd.clearingAccountId === cmd.bankAccountId) return err(validationError('Clearing and bank must be different accounts'));
    const fee = cmd.feeAmount ?? 0;
    if (fee > cmd.grossAmount) return err(validationError('Fee cannot exceed the gross amount'));

    const clearing = await this.deps.accounts.findById(cmd.clearingAccountId);
    if (!clearing || clearing.organizationId !== ctx.organizationId) return err(notFoundError('FinancialAccount', cmd.clearingAccountId));
    const bank = await this.deps.accounts.findById(cmd.bankAccountId);
    if (!bank || bank.organizationId !== ctx.organizationId) return err(notFoundError('FinancialAccount', cmd.bankAccountId));

    const now = ctx.clock.now().toISOString();
    const entryDate = cmd.date ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
    const settlementId = ctx.ids.newId();
    const net = round2(cmd.grossAmount - fee);
    const stationId = clearing.stationId ?? bank.stationId ?? null;
    const label = cmd.notes ?? `Settlement ${clearing.name} → ${bank.name}`;

    const entries = [
      {
        id: ctx.ids.newId(),
        organizationId: ctx.organizationId,
        stationId,
        accountId: clearing.id,
        direction: 'out' as LedgerDirection,
        amount: String(net),
        entryDate,
        sourceType: 'SETTLEMENT' as LedgerSourceType,
        sourceId: settlementId,
        transferId: settlementId,
        businessDayId: null,
        shiftId: null,
        reconciled: false,
        notes: label,
        createdAt: now,
      },
      {
        id: ctx.ids.newId(),
        organizationId: ctx.organizationId,
        stationId,
        accountId: bank.id,
        direction: 'in' as LedgerDirection,
        amount: String(net),
        entryDate,
        sourceType: 'SETTLEMENT' as LedgerSourceType,
        sourceId: settlementId,
        transferId: settlementId,
        businessDayId: null,
        shiftId: null,
        reconciled: false,
        notes: label,
        createdAt: now,
      },
    ];
    if (fee > 0) {
      entries.push({
        id: ctx.ids.newId(),
        organizationId: ctx.organizationId,
        stationId,
        accountId: clearing.id,
        direction: 'out' as LedgerDirection,
        amount: String(round2(fee)),
        entryDate,
        sourceType: 'BANK_CHARGE' as LedgerSourceType,
        sourceId: settlementId,
        transferId: settlementId,
        businessDayId: null,
        shiftId: null,
        reconciled: false,
        notes: `MDR / processing fee (${label})`,
        createdAt: now,
      });
    }
    await this.deps.ledger.saveMany(entries);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.LEDGER_ENTRY_POSTED,
        aggregateType: 'MerchantSettlement',
        aggregateId: settlementId,
        stationId: stationId ?? undefined,
        payload: { settlementId, clearingAccountId: clearing.id, bankAccountId: bank.id, gross: String(round2(cmd.grossAmount)), fee: String(round2(fee)), net: String(net) },
      }),
    ]);

    return ok({ settlementId, gross: String(round2(cmd.grossAmount)), fee: String(round2(fee)), net: String(net), entryDate });
  }
}

export interface RecordLedgerAdjustmentCommand {
  accountId: string;
  direction: LedgerDirection;
  amount: number | string;
  /** BANK_CHARGE for fees/charges, INTEREST for interest paid/earned, ADJUSTMENT for corrections. */
  sourceType?: 'BANK_CHARGE' | 'INTEREST' | 'ADJUSTMENT';
  date?: string | null;
  notes?: string | null;
}

const adjustmentSchema = z.object({
  accountId: z.string().min(1, 'accountId is required'),
  direction: z.enum(['in', 'out']),
  amount: z.coerce.number().positive('amount must be positive'),
  sourceType: z.enum(['BANK_CHARGE', 'INTEREST', 'ADJUSTMENT']).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').nullish(),
  notes: z.string().max(500).nullish(),
});

/**
 * Post a single manual ledger entry against one account — bank charges/fees
 * (out), interest (in), or a balance correction (ADJUSTMENT). This is the
 * reconciliation MVP: record bank-originated items so the book balance matches
 * the statement. Run inside runInTransaction.
 */
export class RecordLedgerAdjustment implements UseCase<RecordLedgerAdjustmentCommand, LedgerEntry> {
  constructor(private readonly deps: FinancialAccountDeps) {}

  async execute(input: RecordLedgerAdjustmentCommand, ctx: ExecutionContext): Promise<Result<LedgerEntry>> {
    const p = adjustmentSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordLedgerAdjustment command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const account = await this.deps.accounts.findById(cmd.accountId);
    if (!account || account.organizationId !== ctx.organizationId) return err(notFoundError('FinancialAccount', cmd.accountId));

    const now = ctx.clock.now().toISOString();
    const entryDate = cmd.date ?? resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
    const entry: LedgerEntry = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: account.stationId,
      accountId: account.id,
      direction: cmd.direction,
      amount: String(round2(Number(cmd.amount))),
      entryDate,
      sourceType: cmd.sourceType ?? 'ADJUSTMENT',
      sourceId: null,
      transferId: null,
      businessDayId: null,
      shiftId: null,
      reconciled: false,
      notes: cmd.notes ?? null,
      createdAt: now,
    };
    await this.deps.ledger.saveMany([entry]);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.LEDGER_ENTRY_POSTED,
        aggregateType: 'LedgerEntry',
        aggregateId: entry.id,
        stationId: account.stationId ?? undefined,
        payload: { accountId: account.id, direction: entry.direction, amount: entry.amount, sourceType: entry.sourceType },
      }),
    ]);

    return ok(entry);
  }
}
