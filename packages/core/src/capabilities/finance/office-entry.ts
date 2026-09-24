import { isValidBusinessDate, resolveEntryDate } from '@pump/shared';
import { err, notFoundError, ok, validationError } from '../../kernel/index.js';
import type { ExecutionContext, Result } from '../../kernel/index.js';
import type {
  FinancialAccount,
  FinancialAccountRepository,
  FinancialAccountType,
} from './accounts/index.js';

/**
 * Where an Office Record sits (ADR 0005): a station, an Entry Date and the
 * Funding Account its money moved through. No Business Day, no Shift.
 */
export interface OfficeEntry {
  stationId: string;
  entryDate: string;
  fundingAccount: FinancialAccount;
  /** The Payment Terminal the money went through (#276), when one was named. */
  terminalId: string | null;
}

/** A Payment Terminal (POS machine) as an Office Record sees it (#276). */
export interface OfficePaymentTerminal {
  id: string;
  organizationId: string;
  stationId: string;
  isActive: boolean;
  supportsCard: boolean;
  supportsUpi: boolean;
  clearingAccountId: string | null;
}

export interface PaymentTerminalLookup {
  findById(id: string): Promise<OfficePaymentTerminal | null>;
  /** The station's generic Merchant Clearing account (created on first use). */
  defaultClearingAccountId(organizationId: string, stationId: string): Promise<string>;
}

export interface OfficeEntryCommand {
  stationId?: string | null;
  /** Station-timezone calendar date; defaults to today. Never in the future. */
  entryDate?: string | null;
  fundingAccountId?: string | null;
  /** Optional Payment Terminal for a Card/UPI receipt (#276). */
  terminalId?: string | null;
}

export interface OfficeEntryOptions {
  /** Account types this record may move money through (e.g. by payment method). */
  allowedAccountTypes?: readonly FinancialAccountType[];
  /**
   * The payment method, when the record has one. A terminal is only valid for
   * Card or UPI, and must support that method. Omitted: the terminal must
   * support Card or UPI.
   */
  paymentMethod?: string;
}

/** Account types a Collection may land in, by payment method. */
export function accountTypesForPaymentMethod(method: string): readonly FinancialAccountType[] {
  if (method === 'Cash') return ['CASH_IN_HAND', 'PETTY_CASH'];
  if (method === 'BankTransfer') return ['BANK'];
  return ['BANK', 'MERCHANT_CLEARING'];
}

/**
 * Resolve and validate an Office Record's station, Entry Date and Funding
 * Account. Never opens or touches a Business Day.
 */
export async function resolveOfficeEntry(
  deps: { accounts: FinancialAccountRepository; terminals?: PaymentTerminalLookup },
  ctx: ExecutionContext,
  cmd: OfficeEntryCommand,
  opts: OfficeEntryOptions = {},
): Promise<Result<OfficeEntry>> {
  const stationId = cmd.stationId ?? ctx.stationId;
  if (!stationId) return err(validationError('stationId is required'));

  const today = resolveEntryDate({ now: ctx.clock.now(), timeZone: ctx.timeZone });
  const entryDate = cmd.entryDate ?? today;
  if (!isValidBusinessDate(entryDate))
    return err(validationError('entryDate must be a valid YYYY-MM-DD date'));
  if (entryDate > today)
    return err(validationError('entryDate cannot be in the future', { entryDate, today }));

  // A named terminal decides the Funding Account: its own clearing account,
  // else the station's generic Merchant Clearing (#276).
  let fundingAccountId = cmd.fundingAccountId ?? null;
  let terminalId: string | null = null;
  if (cmd.terminalId) {
    const terminal = await resolveTerminal(deps.terminals, ctx, stationId, cmd.terminalId, opts);
    if (!terminal.success) return terminal;
    terminalId = terminal.data.id;
    fundingAccountId =
      terminal.data.clearingAccountId ??
      (await deps.terminals!.defaultClearingAccountId(ctx.organizationId, stationId));
  }

  if (!fundingAccountId) return err(validationError('fundingAccountId is required'));
  const account = await deps.accounts.findById(fundingAccountId);
  if (
    !account ||
    account.organizationId !== ctx.organizationId ||
    (account.stationId !== null && account.stationId !== stationId)
  )
    return err(notFoundError('FinancialAccount', fundingAccountId));
  if (!account.isActive)
    return err(validationError(`Account "${account.name}" is inactive`, { accountId: account.id }));
  if (opts.allowedAccountTypes && !opts.allowedAccountTypes.includes(account.accountType))
    return err(
      validationError(`Account "${account.name}" cannot be used for this payment method`, {
        accountId: account.id,
        accountType: account.accountType,
        allowed: opts.allowedAccountTypes,
      }),
    );

  return ok({ stationId, entryDate, fundingAccount: account, terminalId });
}

async function resolveTerminal(
  terminals: PaymentTerminalLookup | undefined,
  ctx: ExecutionContext,
  stationId: string,
  terminalId: string,
  opts: OfficeEntryOptions,
): Promise<Result<OfficePaymentTerminal>> {
  if (!terminals) return err(validationError('A payment terminal cannot be used for this record'));
  const method = opts.paymentMethod;
  if (method !== undefined && method !== 'Card' && method !== 'UPI')
    return err(validationError('A payment terminal is only used for Card or UPI payments'));
  const terminal = await terminals.findById(terminalId);
  if (
    !terminal ||
    terminal.organizationId !== ctx.organizationId ||
    terminal.stationId !== stationId ||
    !terminal.isActive
  )
    return err(notFoundError('PaymentTerminal', terminalId));
  const supported =
    method === 'Card'
      ? terminal.supportsCard
      : method === 'UPI'
        ? terminal.supportsUpi
        : terminal.supportsCard || terminal.supportsUpi;
  if (!supported)
    return err(
      validationError(`This terminal does not accept ${method ?? 'Card or UPI'} payments`, {
        terminalId,
      }),
    );
  return ok(terminal);
}
