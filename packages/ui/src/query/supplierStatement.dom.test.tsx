import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RangedPartyLedger } from '@pump/shared';
import { CloudTransactionService } from '../services/cloud.js';
import { useSupplierStatement } from './hooks.js';

/**
 * "Earlier months" widens the range, which changes the query key. The rows of
 * the range already on screen must stay until the wider one arrives, but never
 * another supplier's rows.
 */

const ledger = (marker: string): RangedPartyLedger => ({
  periodOpeningBalance: '0',
  closingBalance: '0',
  hasEarlier: true,
  entries: [
    {
      id: marker,
      transactionType: 'Purchase',
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

describe('useSupplierStatement', () => {
  it('keeps the previous range on screen while a wider one loads', async () => {
    let release: (v: RangedPartyLedger) => void = () => {};
    vi.spyOn(CloudTransactionService.prototype, 'getSupplierLedgerRange').mockImplementation(
      async (_id, range) =>
        range.from === '2026-05-01'
          ? ledger('six-months')
          : new Promise<RangedPartyLedger>((resolve) => (release = resolve)),
    );
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ from }: { from: string }) => useSupplierStatement('s-1', { from, to: '9999-12-31' }),
      { wrapper, initialProps: { from: '2026-05-01' } },
    );
    await waitFor(() => expect(result.current.data?.entries[0].id).toBe('six-months'));

    rerender({ from: '2025-11-01' });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data?.entries[0].id).toBe('six-months');

    release(ledger('twelve-months'));
    await waitFor(() => expect(result.current.data?.entries[0].id).toBe('twelve-months'));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it("never shows another supplier's rows while a supplier loads", async () => {
    vi.spyOn(CloudTransactionService.prototype, 'getSupplierLedgerRange').mockImplementation(
      async (id) => (id === 's-1' ? ledger('s-1-row') : new Promise<RangedPartyLedger>(() => {})),
    );
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useSupplierStatement(id, { from: '2026-05-01', to: '9999-12-31' }),
      { wrapper, initialProps: { id: 's-1' } },
    );
    await waitFor(() => expect(result.current.data?.entries[0].id).toBe('s-1-row'));
    rerender({ id: 's-2' });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });
});
