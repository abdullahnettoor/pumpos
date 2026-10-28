// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryClientProvider, useQuery, type QueryKey } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient } from '../../test/renderWithProviders.js';

/**
 * #606: each patched write updates its list from the answer while the
 * background refetch never answers, and leaves the cache as it was when the
 * write fails. Every list here is held by a live observer whose fetch hangs,
 * so whatever it shows after the write came from the patch.
 */
const tx = {
  recordMerchandiseHandover: vi.fn(),
  deleteMerchandiseHandover: vi.fn(),
  recordSale: vi.fn(),
  voidExpense: vi.fn(),
  voidIncome: vi.fn(),
  getMerchandiseSales: vi.fn(),
};

vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Base = actual.CloudTransactionService as new () => object;
  return {
    ...actual,
    CloudTransactionService: class extends Base {
      recordMerchandiseHandover = (...a: unknown[]) => tx.recordMerchandiseHandover(...a);
      deleteMerchandiseHandover = (...a: unknown[]) => tx.deleteMerchandiseHandover(...a);
      recordSale = (...a: unknown[]) => tx.recordSale(...a);
      voidExpense = (...a: unknown[]) => tx.voidExpense(...a);
      voidIncome = (...a: unknown[]) => tx.voidIncome(...a);
      getMerchandiseSales = (...a: unknown[]) => tx.getMerchandiseSales(...a);
    },
  };
});

const hooks = await import('../hooks.js');
const officeRecords = await import('../../office-records/useRecordOfficeRecord.js');
const { queryKeys } = hooks;

const never = () => new Promise<never>(() => {});

/** A client holding `seed` under each key, each watched by an observer whose refetch hangs. */
function setup(seed: [QueryKey, unknown][]) {
  const queryClient = createTestQueryClient();
  for (const [key, data] of seed) queryClient.setQueryData(key, data);
  const Watch: React.FC<{ queryKey: QueryKey }> = ({ queryKey }) => {
    useQuery({ queryKey, queryFn: never });
    return null;
  };
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {seed.map(([key]) => (
        <Watch key={JSON.stringify(key)} queryKey={key} />
      ))}
      {children}
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
}

afterEach(() => {
  cleanup();
  for (const fn of Object.values(tx)) fn.mockReset();
});

const ravisOldSale = {
  id: 'sale-old',
  attendantId: 'u-ravi',
  attendantName: 'Ravi',
  subtotalAmount: '200.00',
  taxAmount: '36.00',
  totalAmount: '236.00',
  nonCashAmount: '0.00',
  createdAt: '2026-10-15T07:00:00.000Z',
  items: [],
};
const saleAnswer = {
  sale: {
    id: 'sale-new',
    shiftId: 'shift-1',
    attendantId: 'u-ravi',
    subtotalAmount: '400.00',
    taxAmount: '72.00',
    totalAmount: '472.00',
    nonCashAmount: '100.00',
    createdAt: '2026-10-15T09:00:00.000Z',
  },
  lines: [
    {
      saleId: 'sale-new',
      productId: 'p-oil',
      quantity: '2',
      unitPrice: '236.00',
      lineTotal: '472.00',
    },
  ],
};
const labels = { attendantName: 'Ravi', productNames: { 'p-oil': 'Engine oil 1L' } };

describe('Handover Product Sale', () => {
  const key = queryKeys.merchandiseHandovers('shift-1');

  it('replaces the employee’s sale from the answer while the refetch hangs', async () => {
    tx.recordMerchandiseHandover.mockResolvedValue(saleAnswer);
    const { queryClient, wrapper } = setup([[key, [ravisOldSale]]]);
    const { result } = renderHook(() => hooks.useRecordHandoverProductSale('station-1'), {
      wrapper,
    });

    await act(() =>
      result.current.mutateAsync({
        shiftId: 'shift-1',
        payload: { attendantId: 'u-ravi', lines: [{ productId: 'p-oil', quantity: 2 }] },
        idempotencyKey: 'k1',
        labels,
      }),
    );

    expect(queryClient.getQueryData(key)).toEqual([
      {
        id: 'sale-new',
        attendantId: 'u-ravi',
        attendantName: 'Ravi',
        subtotalAmount: '400.00',
        taxAmount: '72.00',
        totalAmount: '472.00',
        nonCashAmount: '100.00',
        createdAt: '2026-10-15T09:00:00.000Z',
        items: [
          {
            saleId: 'sale-new',
            productId: 'p-oil',
            productName: 'Engine oil 1L',
            quantity: '2',
            unitPrice: '236.00',
            lineTotal: '472.00',
          },
        ],
      },
    ]);
    await waitFor(() => expect(queryClient.isFetching({ queryKey: key })).toBe(1));
  });

  it('leaves the list as it was when the save fails', async () => {
    tx.recordMerchandiseHandover.mockRejectedValue(new Error('Insufficient stock'));
    const { queryClient, wrapper } = setup([[key, [ravisOldSale]]]);
    const before = queryClient.getQueryData(key);
    const { result } = renderHook(() => hooks.useRecordHandoverProductSale('station-1'), {
      wrapper,
    });

    await act(() =>
      result.current
        .mutateAsync({
          shiftId: 'shift-1',
          payload: { attendantId: 'u-ravi', lines: [] },
          idempotencyKey: 'k1',
          labels,
        })
        .catch(() => undefined),
    );

    expect(queryClient.getQueryData(key)).toBe(before);
  });

  it('drops a removed sale from the answer', async () => {
    tx.deleteMerchandiseHandover.mockResolvedValue({ id: 'sale-old' });
    const { queryClient, wrapper } = setup([[key, [ravisOldSale]]]);
    const { result } = renderHook(() => hooks.useDeleteHandoverProductSale('station-1'), {
      wrapper,
    });

    await act(() =>
      result.current.mutateAsync({ saleId: 'sale-old', shiftId: 'shift-1', idempotencyKey: 'k' }),
    );

    expect(queryClient.getQueryData(key)).toEqual([]);
  });
});

describe('Billed Product Sale', () => {
  const key = queryKeys.merchandiseSales('shift-1');

  it('leads the list with the answer, keyed', async () => {
    tx.recordSale.mockResolvedValue({
      sale: {
        ...saleAnswer.sale,
        documentNumber: 'SAL-000042',
        customerId: null,
        paymentMethod: 'UPI',
        buyerDetails: { name: 'Anil' },
      },
      lines: saleAnswer.lines,
    });
    const { queryClient, wrapper } = setup([[key, [{ id: 'sale-0' }]]]);
    const { result } = renderHook(() => hooks.useRecordProductSale('station-1'), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        payload: { shiftId: 'shift-1', paymentMethod: 'UPI', lines: [] },
        idempotencyKey: 'k-sale',
        labels: { ...labels, customerName: null },
      }),
    );

    expect(tx.recordSale.mock.calls[0][1]).toEqual({ idempotencyKey: 'k-sale' });
    const list = queryClient.getQueryData<{ id: string; customerName?: string }[]>(key)!;
    expect(list.map((r) => r.id)).toEqual(['sale-new', 'sale-0']);
    expect(list[0]).toMatchObject({
      documentNumber: 'SAL-000042',
      attendantName: 'Ravi',
      customerName: 'Anil',
      paymentMethod: 'UPI',
      totalAmount: '472.00',
      items: [{ productName: 'Engine oil 1L', quantity: '2', lineTotal: '472.00' }],
    });
  });
});

describe('Billed Product Sale, refetch fails', () => {
  it('keeps the accepted sale when the revalidation fails', async () => {
    const key = queryKeys.merchandiseSales('shift-1');
    tx.recordSale.mockResolvedValue({
      sale: { ...saleAnswer.sale, paymentMethod: 'Cash' },
      lines: [],
    });
    tx.getMerchandiseSales.mockRejectedValue(new Error('offline'));
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(key, [{ id: 'sale-0' }]);
    const Live: React.FC = () => {
      hooks.useMerchandiseSales('shift-1', { staleTime: 0 });
      return null;
    };
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <Live />
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(() => hooks.useRecordProductSale('station-1'), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        payload: { shiftId: 'shift-1', paymentMethod: 'Cash', lines: [] },
        idempotencyKey: 'k',
        labels,
      }),
    );
    await waitFor(() => expect(queryClient.getQueryState(key)?.status).toBe('error'));

    const list = queryClient.getQueryData<{ id: string }[]>(key)!;
    expect(list.map((r) => r.id)).toEqual(['sale-new', 'sale-0']);
  });
});

describe('Office Records', () => {
  const answered = (over: Record<string, unknown>) => ({
    id: 'rec-new',
    stationId: 'station-1',
    entryDate: '2026-10-14',
    amount: '1500.00',
    createdAt: '2026-10-15T09:00:00.000Z',
    status: 'ACTIVE',
    ...over,
  });
  const older = { id: 'rec-old', entryDate: '2026-10-13', createdAt: '2026-10-13T10:00:00.000Z' };
  const newer = { id: 'rec-top', entryDate: '2026-10-15', createdAt: '2026-10-15T06:00:00.000Z' };
  const request = (answer: unknown, fail = false) => ({
    kind: 'expense' as const,
    body: {},
    send: () => (fail ? Promise.reject(new Error('Account is closed')) : Promise.resolve(answer)),
  });

  it('puts a saved Expense in its place in the ledger, named from the pick', async () => {
    const key = queryKeys.expenses();
    const { queryClient, wrapper } = setup([[key, [newer, older]]]);
    const { result } = renderHook(() => officeRecords.useRecordOfficeRecord(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        stationId: 'station-1',
        kind: 'expense',
        request: request(answered({ categoryId: 'cat-1' })),
        idempotencyKey: 'k',
        labels: { categoryName: 'Electricity', accountName: 'Cash in Hand', accountType: 'CASH' },
      }),
    );

    const list = queryClient.getQueryData<Record<string, unknown>[]>(key)!;
    expect(list.map((r) => r.id)).toEqual(['rec-top', 'rec-new', 'rec-old']);
    expect(list[1]).toMatchObject({
      amount: '1500.00',
      entryDate: '2026-10-14',
      categoryName: 'Electricity',
      accountName: 'Cash in Hand',
      accountType: 'CASH',
    });
  });

  it('adds Income only to the cached ranges it falls in', async () => {
    const october = queryKeys.income('station-1', '2026-10-01', '2026-10-31');
    const september = queryKeys.income('station-1', '2026-09-01', '2026-09-30');
    const { queryClient, wrapper } = setup([
      [october, []],
      [september, []],
    ]);
    const { result } = renderHook(() => officeRecords.useRecordOfficeRecord(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        stationId: 'station-1',
        kind: 'income',
        request: request(answered({})),
        idempotencyKey: 'k',
        labels: { categoryName: 'Rent' },
      }),
    );

    expect(queryClient.getQueryData<unknown[]>(october)).toHaveLength(1);
    expect(queryClient.getQueryData<unknown[]>(september)).toEqual([]);
  });

  it('names a Collection and a Supplier payment by the party picked', async () => {
    const collections = queryKeys.collections();
    const payments = queryKeys.supplierPayments('station-1', '2026-10-01', '2026-10-31');
    const { queryClient, wrapper } = setup([
      [collections, []],
      [payments, []],
    ]);
    const { result } = renderHook(() => officeRecords.useRecordOfficeRecord(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        stationId: 'station-1',
        kind: 'collection',
        request: request(answered({ customerId: 'c-1', paymentMethod: 'UPI' })),
        idempotencyKey: 'k1',
        labels: { partyName: 'Kerala Roadways', accountName: 'HDFC Current' },
      }),
    );
    await act(() =>
      result.current.mutateAsync({
        stationId: 'station-1',
        kind: 'supplier-payment',
        request: request(answered({ id: 'pay-1', supplierId: 's-1', notes: null })),
        idempotencyKey: 'k2',
        labels: { partyName: 'IOCL', accountName: 'HDFC Current', accountType: 'BANK' },
      }),
    );

    expect(queryClient.getQueryData(collections)).toEqual([
      expect.objectContaining({ customerName: 'Kerala Roadways', accountName: 'HDFC Current' }),
    ]);
    expect(queryClient.getQueryData(payments)).toEqual([
      {
        id: 'pay-1',
        stationId: 'station-1',
        supplierId: 's-1',
        entryDate: '2026-10-14',
        amount: '1500.00',
        notes: null,
        createdAt: '2026-10-15T09:00:00.000Z',
        supplierName: 'IOCL',
        accountName: 'HDFC Current',
        accountType: 'BANK',
      },
    ]);
  });

  it('leaves the ledger as it was when the save fails', async () => {
    const key = queryKeys.expenses();
    const { queryClient, wrapper } = setup([[key, [older]]]);
    const before = queryClient.getQueryData(key);
    const { result } = renderHook(() => officeRecords.useRecordOfficeRecord(), { wrapper });

    await act(() =>
      result.current
        .mutateAsync({
          stationId: 'station-1',
          kind: 'expense',
          request: request(null, true),
          idempotencyKey: 'k',
          labels: {},
        })
        .catch(() => undefined),
    );

    expect(queryClient.getQueryData(key)).toBe(before);
  });

  it('marks a voided Expense Voided from the answer', async () => {
    const key = queryKeys.expenses();
    tx.voidExpense.mockResolvedValue(answered({ id: 'rec-old', status: 'VOIDED' }));
    const { queryClient, wrapper } = setup([[key, [{ ...older, status: 'ACTIVE' }]]]);
    const { result } = renderHook(() => officeRecords.useVoidCategoryRecord(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        kind: 'expense',
        id: 'rec-old',
        stationId: 'station-1',
        idempotencyKey: 'k-void',
      }),
    );

    expect(tx.voidExpense).toHaveBeenCalledWith('rec-old', undefined, { idempotencyKey: 'k-void' });
    expect(queryClient.getQueryData(key)).toEqual([{ ...older, status: 'VOIDED' }]);
  });
});
