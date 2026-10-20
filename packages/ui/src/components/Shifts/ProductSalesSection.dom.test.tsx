// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  createTestQueryClient,
  muteExpectedConsoleErrors,
  renderWithProviders,
} from '../../test/renderWithProviders.js';

/**
 * Product sales (#533) replaces the Merchandise handovers panel: same data,
 * API and flows. A Handover Product Sale save and a removal each send an
 * Idempotency-Key, and a save retried after a dropped answer reuses it.
 */
const recordSale = vi.fn();
const listProducts = vi.fn();
const removeSale = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Base = actual.CloudTransactionService as new () => object;
  const ProductBase = actual.CloudProductService as new () => object;
  return {
    ...actual,
    CloudProductService: class extends ProductBase {
      listProducts = (...a: unknown[]) => listProducts(...a);
    },
    CloudTransactionService: class extends Base {
      recordMerchandiseHandover = (...a: unknown[]) => recordSale(...a);
      deleteMerchandiseHandover = (...a: unknown[]) => removeSale(...a);
    },
  };
});

const { ProductSalesSection } = await import('./ProductSalesSection.js');
const { productSales } = await import('./liveShiftModel.js');
const { mutationKeys, queryKeys } = await import('../../query/hooks.js');

const handoverSales = [
  {
    id: 'm1',
    attendantId: 'u1',
    attendantName: 'Ravi',
    totalAmount: '450.00',
    nonCashAmount: '0',
    items: [{ productId: 'p-oil', quantity: '1' }],
  },
];
const billed = [
  { id: 'b1', attendantId: null, totalAmount: '200.00', paymentMethod: 'Cash', items: [] },
];

const mount = () => mountWith(handoverSales);

const mountWith = (sales: typeof handoverSales, opts: { products?: boolean } = {}) => {
  const client = createTestQueryClient();
  if (opts.products !== false)
    client.setQueryData(queryKeys.products(), [
      {
        id: 'p-oil',
        name: 'Engine oil',
        productType: 'LUBRICANT',
        sellingPrice: 450,
        taxCategory: 'GST',
        taxConfig: { gst_rate: 18 },
      },
    ]);
  client.setQueryData(queryKeys.users(), [
    { id: 'u1', fullName: 'Ravi', status: 'ACTIVE' },
    { id: 'u2', fullName: 'Suresh', status: 'ACTIVE' },
  ]);
  client.setQueryData(queryKeys.inventoryItems('st-1'), []);
  const figures = productSales({
    assignments: [
      { userId: 'u1', userName: 'Ravi', duId: 'du1', duCode: 'DU1' },
      { userId: 'u2', userName: 'Suresh', duId: 'du2', duCode: 'DU2' },
    ],
    handoverSales: sales,
    billed,
  });
  const done = { isPending: false, isError: false, fetchStatus: 'idle' as const };
  return renderWithProviders(
    <ProductSalesSection
      shiftId="sh-1"
      stationId="st-1"
      queries={[done, done]}
      sales={figures}
      handoverSales={sales}
      billed={billed}
    />,
    { queryClient: client },
  );
};

let restoreConsole: () => void;
beforeEach(() => {
  recordSale.mockReset();
  removeSale.mockReset();
  restoreConsole = muteExpectedConsoleErrors([/not wrapped in act/, /Warning:/]);
});
afterEach(() => {
  cleanup();
  restoreConsole();
});

describe('ProductSalesSection', () => {
  it('lists a row per employee, Unassigned last with no actions', () => {
    mount();
    const rows = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    expect(rows[1]).toMatch(/Ravi.*₹450\.00/);
    expect(rows[2]).toMatch(/Suresh/);
    expect(rows[3]).toMatch(/Unassigned.*₹200\.00/);
    expect(within(screen.getAllByRole('row')[3]).queryByRole('button')).toBeNull();
    expect(rows.at(-1)).toMatch(/Total.*₹200\.00.*₹450\.00.*₹650\.00/);
  });

  it('edits an employee’s Handover Product Sale with one Idempotency-Key per save', async () => {
    recordSale
      .mockRejectedValueOnce(Object.assign(new Error('Network down'), { status: undefined }))
      .mockResolvedValueOnce({ id: 'm1' });
    mount();
    fireEvent.click(screen.getByRole('button', { name: "Edit Ravi's handover product sale" }));
    expect(await screen.findByText('Edit handover product sale')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Update sale' }));
    await waitFor(() => expect(recordSale).toHaveBeenCalledTimes(1));
    await screen.findByText('Network down');
    fireEvent.click(screen.getByRole('button', { name: 'Update sale' }));
    await waitFor(() => expect(recordSale).toHaveBeenCalledTimes(2));

    const [shiftId, payload, first] = recordSale.mock.calls[0];
    expect(shiftId).toBe('sh-1');
    expect(payload).toEqual({
      attendantId: 'u1',
      lines: [{ productId: 'p-oil', quantity: 1 }],
      nonCashAmount: 0,
    });
    expect(first.idempotencyKey).toEqual(expect.any(String));
    // The outcome of the first send was unknown: the retry reuses its key.
    expect(recordSale.mock.calls[1][2].idempotencyKey).toBe(first.idempotencyKey);
  });

  it('keys each removal on its own: B never reuses A’s unanswered key; A again recovers it', async () => {
    removeSale
      .mockRejectedValueOnce(Object.assign(new Error('Network down'), { status: undefined }))
      .mockResolvedValue({});
    mountWith([
      ...handoverSales,
      {
        id: 'm2',
        attendantId: 'u2',
        attendantName: 'Suresh',
        totalAmount: '120.00',
        nonCashAmount: '0',
        items: [],
      },
    ]);
    const removeOne = async (name: string) => {
      fireEvent.click(
        screen.getByRole('button', { name: `Remove ${name}'s handover product sale` }),
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    };

    await removeOne('Ravi'); // A: the answer is lost
    await waitFor(() => expect(removeSale).toHaveBeenCalledTimes(1));
    await removeOne('Suresh'); // B
    await waitFor(() => expect(removeSale).toHaveBeenCalledTimes(2));
    await removeOne('Ravi'); // A again
    await waitFor(() => expect(removeSale).toHaveBeenCalledTimes(3));

    const [a1, b, a2] = removeSale.mock.calls;
    expect([a1[0], b[0], a2[0]]).toEqual(['m1', 'm2', 'm1']);
    expect(b[1].idempotencyKey).not.toBe(a1[1].idempotencyKey);
    expect(a2[1].idempotencyKey).toBe(a1[1].idempotencyKey);
  });

  it('loads the drawer’s products and employees in a Data Section with Retry', async () => {
    listProducts.mockRejectedValue(Object.assign(new Error('Server error'), { status: 500 }));
    mountWith(handoverSales, { products: false });
    fireEvent.click(screen.getByRole('button', { name: "Record Suresh's handover product sale" }));
    expect(await screen.findByText(/Couldn't load products and employees/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Record sale' })).toBeNull();
  });

  it('removes a Handover Product Sale after confirming, with an Idempotency-Key', async () => {
    removeSale.mockResolvedValue({});
    mount();
    fireEvent.click(screen.getByRole('button', { name: "Remove Ravi's handover product sale" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(removeSale).toHaveBeenCalledWith('m1', { idempotencyKey: expect.any(String) }),
    );
  });

  it('reads Saving… on the row while a removal is in flight, never its figure (#606)', async () => {
    let answer!: (v: unknown) => void;
    removeSale.mockReturnValue(new Promise((r) => (answer = r)));
    mount();
    fireEvent.click(screen.getByRole('button', { name: "Remove Ravi's handover product sale" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    const ravi = () => screen.getByText('Ravi').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(ravi()).getAllByText('Saving…')).toHaveLength(2));
    expect(within(ravi()).queryByText('₹450.00')).toBeNull();

    answer({ id: 'm1' });
    await waitFor(() => expect(within(ravi()).queryByText('Saving…')).toBeNull());
  });

  it('rolls a refused removal back with the reason on the row (#606)', async () => {
    const restore = muteExpectedConsoleErrors([/Shift is closed/]);
    try {
      removeSale.mockRejectedValue(new Error('Shift is closed'));
      mount();
      fireEvent.click(screen.getByRole('button', { name: "Remove Ravi's handover product sale" }));
      fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

      const ravi = () => screen.getByText('Ravi').closest('tr') as HTMLElement;
      await waitFor(() =>
        expect(within(ravi()).getByRole('alert').textContent).toContain('Shift is closed'),
      );
      expect(within(ravi()).getAllByText('₹450.00').length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it('a removal sent after a refused edit shows Saving…, not the old refusal (#606 review)', async () => {
    let answer!: (v: unknown) => void;
    removeSale.mockReturnValue(new Promise((r) => (answer = r)));
    const view = mount();
    // An earlier edit of Ravi's sale was refused.
    await view.queryClient
      .getMutationCache()
      .build(view.queryClient, {
        mutationKey: mutationKeys.handoverProductSale(),
        mutationFn: () => Promise.reject(new Error('Insufficient stock')),
      })
      .execute({ shiftId: 'sh-1', payload: { attendantId: 'u1' } })
      .catch(() => undefined);
    const ravi = () => screen.getByText('Ravi').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(ravi()).getByRole('alert')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: "Remove Ravi's handover product sale" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(within(ravi()).getAllByText('Saving…')).toHaveLength(2));
    expect(within(ravi()).queryByRole('alert')).toBeNull();

    // The removal succeeds: the old refusal must not come back (#606 review 2).
    answer({ id: 'm1' });
    await waitFor(() => expect(within(ravi()).queryByText('Saving…')).toBeNull());
    expect(within(ravi()).queryByRole('alert')).toBeNull();
  });

  it('a Billed Sale in flight reads Saving… on its seller’s row (#606 review)', async () => {
    const view = mount();
    void view.queryClient
      .getMutationCache()
      .build(view.queryClient, {
        mutationKey: mutationKeys.productSale(),
        mutationFn: () => new Promise(() => {}),
      })
      .execute({ payload: { shiftId: 'sh-1', attendantId: 'u2' } });

    const suresh = () => screen.getByText('Suresh').closest('tr') as HTMLElement;
    // Billed sales and the total wait; the Handover sale column is untouched.
    await waitFor(() => expect(within(suresh()).getAllByText('Saving…')).toHaveLength(2));
    const ravi = screen.getByText('Ravi').closest('tr') as HTMLElement;
    expect(within(ravi).queryByText('Saving…')).toBeNull();
  });
});
