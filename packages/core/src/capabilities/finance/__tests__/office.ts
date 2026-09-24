/**
 * Test fixtures for Office Records (ADR 0005): an in-memory account book, a
 * terminal lookup and a station-clocked context. Test-only (excluded from the
 * build).
 */
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import type {
  FinancialAccount,
  FinancialAccountRepository,
  FinancialAccountType,
} from '../accounts/index.js';
import type { OfficePaymentTerminal, PaymentTerminalLookup } from '../office-entry.js';

export function account(
  id: string,
  accountType: FinancialAccountType,
  over: Partial<FinancialAccount> = {},
): FinancialAccount {
  return {
    id,
    organizationId: 'org-1',
    stationId: 'st-1',
    accountType,
    name: id,
    openingBalance: '0',
    openingDate: null,
    metadata: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

/** Cash in Hand, Petty Cash, a bank, a clearing account and Owner. */
export function standardAccounts(): FinancialAccount[] {
  return [
    account('cash', 'CASH_IN_HAND', { name: 'Cash in Hand' }),
    account('petty', 'PETTY_CASH', { name: 'Petty Cash' }),
    account('hdfc', 'BANK', { name: 'HDFC Current' }),
    account('clearing', 'MERCHANT_CLEARING', { name: 'Card/UPI Clearing' }),
    account('owner', 'OWNER', { name: 'Owner' }),
  ];
}

export class AccountRepo implements FinancialAccountRepository {
  constructor(readonly rows: FinancialAccount[] = standardAccounts()) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async existsByName() {
    return false;
  }
  async save() {}
}

export function terminal(
  id: string,
  over: Partial<OfficePaymentTerminal> = {},
): OfficePaymentTerminal {
  return {
    id,
    organizationId: 'org-1',
    stationId: 'st-1',
    isActive: true,
    supportsCard: true,
    supportsUpi: true,
    clearingAccountId: null,
    ...over,
  };
}

export class TerminalLookup implements PaymentTerminalLookup {
  constructor(
    readonly rows: OfficePaymentTerminal[] = [],
    readonly defaultClearing = 'clearing',
  ) {}
  async findById(organizationId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.organizationId === organizationId) ?? null;
  }
  async defaultClearingAccountId() {
    return this.defaultClearing;
  }
}

/** 10:00 UTC on 2026-03-15 = 15:30 IST; station day starts at 06:00. */
export function officeCtx(now = '2026-03-15T10:00:00Z'): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    clock: new FixedClock(new Date(now)),
    ids: new SequentialIdGenerator('e'),
    timeZone: 'Asia/Kolkata',
    businessDayStartsAt: '06:00',
  };
}

export function eventBus() {
  const store = new InMemoryEventStore();
  return { store, events: new InProcessEventDispatcher({ store }) };
}
