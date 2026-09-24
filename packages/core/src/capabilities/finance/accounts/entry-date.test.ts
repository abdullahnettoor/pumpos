import { describe, expect, it } from 'vitest';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext } from '../../../kernel/index.js';
import {
  CreateFinancialAccount,
  RecordLedgerAdjustment,
  RecordSettlement,
  RecordTransfer,
  SetOpeningBalance,
} from './index.js';
import type {
  FinancialAccount,
  FinancialAccountDeps,
  FinancialAccountType,
  LedgerEntry,
} from './index.js';

// Bank work is an Office Record: it is dated by the Entry Date (plain
// station-timezone calendar date), never the sales day (ADR 0005, #285).

function account(id: string, accountType: FinancialAccountType): FinancialAccount {
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeDeps() {
  const accounts = new Map<string, FinancialAccount>([
    ['cash', account('cash', 'CASH_IN_HAND')],
    ['bank', account('bank', 'BANK')],
    ['clearing', account('clearing', 'MERCHANT_CLEARING')],
  ]);
  const entries: LedgerEntry[] = [];
  const events: EventPublisher = { publish: async () => {} };
  const deps: FinancialAccountDeps = {
    accounts: {
      findById: async (id) => accounts.get(id) ?? null,
      existsByName: async () => false,
      save: async (a) => void accounts.set(a.id, a),
    },
    ledger: {
      saveMany: async (e) => void entries.push(...e),
      deleteByAccountAndSource: async () => {},
    },
    events,
  };
  return { deps, entries };
}

// 03:00 IST on the 15th, Day Start 06:00 → sales day is the 14th, Entry Date the 15th.
function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    stationId: 'st-1',
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    clock: new FixedClock(new Date('2026-03-14T21:30:00Z')),
    ids: new SequentialIdGenerator('t'),
    timeZone: 'Asia/Kolkata',
    businessDayStartsAt: '06:00',
  } as ExecutionContext;
}

describe('bank work defaults to the Entry Date (#285)', () => {
  it('RecordTransfer', async () => {
    const { deps, entries } = makeDeps();
    const r = await new RecordTransfer(deps).execute(
      { fromAccountId: 'cash', toAccountId: 'bank', amount: 100 },
      makeContext(),
    );
    expect(r.success && r.data.entryDate).toBe('2026-03-15');
    expect(entries.map((e) => e.entryDate)).toEqual(['2026-03-15', '2026-03-15']);
  });

  it('RecordSettlement', async () => {
    const { deps, entries } = makeDeps();
    const r = await new RecordSettlement(deps).execute(
      { clearingAccountId: 'clearing', bankAccountId: 'bank', grossAmount: 100, feeAmount: 2 },
      makeContext(),
    );
    expect(r.success && r.data.entryDate).toBe('2026-03-15');
    expect(entries.every((e) => e.entryDate === '2026-03-15')).toBe(true);
  });

  it('RecordLedgerAdjustment', async () => {
    const { deps } = makeDeps();
    const r = await new RecordLedgerAdjustment(deps).execute(
      { accountId: 'bank', direction: 'out', amount: 10, sourceType: 'BANK_CHARGE' },
      makeContext(),
    );
    expect(r.success && r.data.entryDate).toBe('2026-03-15');
  });

  it('CreateFinancialAccount opening date', async () => {
    const { deps } = makeDeps();
    const r = await new CreateFinancialAccount(deps).execute(
      { stationId: 'st-1', accountType: 'BANK', name: 'HDFC', openingBalance: 500 },
      makeContext(),
    );
    expect(r.success && r.data.openingDate).toBe('2026-03-15');
  });

  it('SetOpeningBalance opening date', async () => {
    const { deps } = makeDeps();
    const r = await new SetOpeningBalance(deps).execute(
      { id: 'bank', openingBalance: 500 },
      makeContext(),
    );
    expect(r.success && r.data.openingDate).toBe('2026-03-15');
  });

  it('an explicit date still wins', async () => {
    const { deps } = makeDeps();
    const r = await new RecordTransfer(deps).execute(
      { fromAccountId: 'cash', toAccountId: 'bank', amount: 100, date: '2026-03-01' },
      makeContext(),
    );
    expect(r.success && r.data.entryDate).toBe('2026-03-01');
  });
});
