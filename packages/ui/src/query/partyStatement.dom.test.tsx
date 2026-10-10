import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RangedPartyLedger } from '@pump/shared';
import { CloudTransactionService } from '../services/cloud.js';
import { usePartyStatement } from './hooks.js';

/**
 * "Earlier months" widens the range, which changes the query key. The rows of
 * the range already on screen must stay until the wider one arrives, but never
 * another party's rows. The same hook serves both kinds.
 */

const ledger = (marker: string, transactionType: string): RangedPartyLedger => ({
  periodOpeningBalance: '0',
  closingBalance: '0',
  hasEarlier: true,
  entries: [
    {
      id: marker,
      transactionType,
      amount: '10',
      businessDate: '2026-10-01',
      runningBalance: '10',
      notes: null,
      createdAt: '2026-10-01T00:00:00Z',
    },
  ],
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe.each([
  { kind: 'customer', method: 'getCustomerLedgerRange', type: 'Credit Sale', p1: 'c-1', p2: 'c-2' },
  { kind: 'supplier', method: 'getSupplierLedgerRange', type: 'Purchase', p1: 's-1', p2: 's-2' },
] as const)('usePartyStatement ($kind)', ({ kind, method, type, p1, p2 }) => {
  const spy = () => vi.spyOn(CloudTransactionService.prototype, method);

  it('keeps the previous range on screen while a wider one loads', async () => {
    let release: (v: RangedPartyLedger) => void = () => {};
    spy().mockImplementation(async (_id, range) =>
      range.from === '2026-05-01'
        ? ledger('six-months', type)
        : new Promise<RangedPartyLedger>((resolve) => (release = resolve)),
    );
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ from }: { from: string }) => usePartyStatement(kind, p1, { from, to: '2026-10-31' }),
      { wrapper, initialProps: { from: '2026-05-01' } },
    );
    await waitFor(() => expect(result.current.data?.entries[0].id).toBe('six-months'));

    rerender({ from: '2025-11-01' });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data?.entries[0].id).toBe('six-months');

    release(ledger('twelve-months', type));
    await waitFor(() => expect(result.current.data?.entries[0].id).toBe('twelve-months'));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it(`never shows another ${kind}'s rows while a ${kind} loads`, async () => {
    spy().mockImplementation(async (id) =>
      id === p1 ? ledger(`${p1}-row`, type) : new Promise<RangedPartyLedger>(() => {}),
    );
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        usePartyStatement(kind, id, { from: '2026-05-01', to: '2026-10-31' }),
      { wrapper, initialProps: { id: p1 } },
    );
    await waitFor(() => expect(result.current.data?.entries[0].id).toBe(`${p1}-row`));
    rerender({ id: p2 });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('loads from scratch when the Filter moves the range instead of widening it', async () => {
    spy().mockImplementation(async (_id, range) =>
      range.from === '2026-10-01'
        ? ledger('this-month', type)
        : new Promise<RangedPartyLedger>(() => {}),
    );
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ from, to }: { from: string; to: string }) => usePartyStatement(kind, p1, { from, to }),
      { wrapper, initialProps: { from: '2026-10-01', to: '2026-10-31' } },
    );
    await waitFor(() => expect(result.current.data?.entries[0].id).toBe('this-month'));

    // Last month: earlier start AND earlier end, so these rows are not part of it.
    rerender({ from: '2026-09-01', to: '2026-09-30' });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });
});
