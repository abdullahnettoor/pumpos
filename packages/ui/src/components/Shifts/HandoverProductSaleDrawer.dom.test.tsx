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
 * A Handover Product Sale line whose product has no MRP (#638). The server
 * refuses the sale ("Product has no selling price set"), so the form blocks it
 * instead of failing on save: the line reads "No MRP set", Save is off with the
 * reason beside it, and an Owner or Manager can set the MRP from the line.
 */
// jsdom has no layout, so it ships no scrollIntoView; the picker's highlight calls it.
Element.prototype.scrollIntoView = vi.fn();

const recordSale = vi.fn();
const listProducts = vi.fn();
const updateProduct = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const TxBase = actual.CloudTransactionService as new () => object;
  const ProductBase = actual.CloudProductService as new () => object;
  return {
    ...actual,
    CloudProductService: class extends ProductBase {
      listProducts = (...a: unknown[]) => listProducts(...a);
      updateProduct = (...a: unknown[]) => updateProduct(...a);
    },
    CloudTransactionService: class extends TxBase {
      recordMerchandiseHandover = (...a: unknown[]) => recordSale(...a);
    },
  };
});

const { HandoverProductSaleDrawer } = await import('./HandoverProductSaleDrawer.js');
const { queryKeys } = await import('../../query/hooks.js');

const oil = {
  id: 'p-oil',
  name: 'Engine oil',
  productType: 'LUBRICANT',
  sellingPrice: 450,
  taxCategory: 'GST',
  taxConfig: { gst_rate: 18 },
};
const coolant = {
  id: 'p-cool',
  name: 'Coolant',
  productType: 'LUBRICANT',
  sellingPrice: null,
  taxCategory: 'GST',
  taxConfig: { gst_rate: 18 },
};

const mount = (opts: { canSetMrp?: boolean } = {}) => {
  const client = createTestQueryClient();
  client.setQueryData(queryKeys.products(), [oil, coolant]);
  client.setQueryData(queryKeys.users(), [{ id: 'u1', fullName: 'Ravi', status: 'ACTIVE' }]);
  client.setQueryData(queryKeys.inventoryItems('st-1'), []);
  return renderWithProviders(
    <HandoverProductSaleDrawer
      isOpen
      onClose={() => {}}
      shiftId="sh-1"
      stationId="st-1"
      employeeId="u1"
      handoverSales={[
        {
          id: 'm1',
          attendantId: 'u1',
          nonCashAmount: 0,
          items: [
            { productId: 'p-oil', quantity: 2 },
            { productId: 'p-cool', quantity: 1 },
          ],
        },
      ]}
      billed={[]}
      canSetMrp={opts.canSetMrp}
    />,
    { queryClient: client },
  );
};

const saveButton = () => screen.getByRole('button', { name: 'Update sale' }) as HTMLButtonElement;

let restoreConsole: () => void;
beforeEach(() => {
  recordSale.mockReset();
  updateProduct.mockReset();
  listProducts.mockReset();
  restoreConsole = muteExpectedConsoleErrors([/not wrapped in act/, /Warning:/]);
});
afterEach(() => {
  cleanup();
  restoreConsole();
});

describe('HandoverProductSaleDrawer — a line with no MRP (#638)', () => {
  it('marks the line and disables Save, with the reason beside it', () => {
    mount();
    expect(screen.getByTestId('hps-no-mrp').textContent).toBe('No MRP set');
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByTestId('hps-no-mrp-reason').textContent).toMatch(/An item has no MRP/);
    fireEvent.click(saveButton());
    expect(recordSale).not.toHaveBeenCalled();
  });

  it('tells anyone but an Owner or Manager who can set it', () => {
    mount({ canSetMrp: false });
    expect(screen.queryByRole('button', { name: /Set MRP/ })).toBeNull();
    expect(screen.getAllByText(/Ask your Owner or Manager to set an MRP/).length).toBeGreaterThan(
      0,
    );
  });

  it('enables Save once the line no longer has a product without an MRP', async () => {
    mount();
    // The coolant line is the second; removing it leaves only priced lines.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove line' })[1]);
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(screen.queryByTestId('hps-no-mrp-reason')).toBeNull();
  });

  it('lets an Owner or Manager set the MRP from the line, and Save then works', async () => {
    updateProduct.mockResolvedValue({ ...coolant, sellingPrice: '150.00' });
    listProducts.mockResolvedValue([oil, { ...coolant, sellingPrice: '150.00' }]);
    recordSale.mockResolvedValue({ id: 'm1' });
    mount({ canSetMrp: true });

    fireEvent.click(screen.getByRole('button', { name: 'Set MRP of Coolant' }));
    const mrpDrawer = (await screen.findByText('Set price')).closest(
      '.drawer-container',
    ) as HTMLElement;
    fireEvent.change(within(mrpDrawer).getByPlaceholderText('e.g. 250'), {
      target: { value: '150' },
    });
    fireEvent.click(within(mrpDrawer).getByRole('button', { name: 'Save price' }));

    await waitFor(() =>
      expect(updateProduct).toHaveBeenCalledWith(
        'p-cool',
        { sellingPrice: 150 },
        { idempotencyKey: expect.any(String) },
      ),
    );
    // The answer's price is patched in: the line is priced and Save is back.
    await waitFor(() => expect(screen.queryByTestId('hps-no-mrp')).toBeNull());
    expect(saveButton().disabled).toBe(false);
    expect(screen.getAllByText('₹150.00').length).toBeGreaterThan(0);

    fireEvent.click(saveButton());
    await waitFor(() => expect(recordSale).toHaveBeenCalledTimes(1));
  });

  it('still offers a product with no MRP in the picker, marked "No price set"', () => {
    mount();
    // Open the picker on the first line.
    fireEvent.click(screen.getByRole('button', { name: /Engine oil/ }));
    const option = screen
      .getAllByRole('option')
      .find((o) => o.textContent?.startsWith('Coolant')) as HTMLElement;
    const note = within(option).getByText('No price set');
    expect(note.className).toContain('text-warning-fg');
  });
});
