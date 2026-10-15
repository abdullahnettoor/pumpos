// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const removeSale = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Base = actual.CloudTransactionService as new () => object;
  return {
    ...actual,
    CloudTransactionService: class extends Base {
      recordMerchandiseHandover = (...a: unknown[]) => recordSale(...a);
      deleteMerchandiseHandover = (...a: unknown[]) => removeSale(...a);
    },
  };
});

const { ProductSalesSection } = await import('./ProductSalesSection.js');
const { productSales } = await import('./liveShiftModel.js');
const { queryKeys } = await import('../../query/hooks.js');

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

const mount = () => {
  const client = createTestQueryClient();
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
  const sales = productSales({
    assignments: [
      { userId: 'u1', userName: 'Ravi', duId: 'du1', duCode: 'DU1' },
      { userId: 'u2', userName: 'Suresh', duId: 'du2', duCode: 'DU2' },
    ],
    handoverSales,
    billed,
  });
  const done = { isPending: false, isError: false, fetchStatus: 'idle' as const };
  return renderWithProviders(
    <ProductSalesSection
      shiftId="sh-1"
      stationId="st-1"
      queries={[done, done]}
      sales={sales}
      handoverSales={handoverSales}
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

  it('removes a Handover Product Sale after confirming, with an Idempotency-Key', async () => {
    removeSale.mockResolvedValue({});
    mount();
    fireEvent.click(screen.getByRole('button', { name: "Remove Ravi's handover product sale" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(removeSale).toHaveBeenCalledWith('m1', { idempotencyKey: expect.any(String) }),
    );
  });
});
