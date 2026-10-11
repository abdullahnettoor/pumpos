/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { DataTable } from '../primitives/DataTable.js';
import { buildPurchaseColumns } from './columns.js';

const linkDecantationPurchase = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudTransactionService: class {
    getPurchaseItems = async () => [{ productId: 'ms', productName: 'MS' }];
    getDecantations = async () => [
      {
        id: 'd-old',
        documentNumber: 'DEC-OLD',
        tankerNumber: 'KA01',
        businessDate: '2026-10-01',
        createdAt: '2026-10-01T05:00:00Z',
        unlinkedProductIds: ['ms'],
      },
      {
        id: 'd-new',
        documentNumber: 'DEC-NEW',
        tankerNumber: 'KA02',
        businessDate: '2026-10-09',
        createdAt: '2026-10-09T05:00:00Z',
        unlinkedProductIds: ['ms'],
      },
      {
        id: 'd-linked',
        documentNumber: 'DEC-LINKED',
        tankerNumber: 'KA03',
        businessDate: '2026-10-09',
        createdAt: '2026-10-09T06:00:00Z',
        unlinkedProductIds: [],
      },
    ];
    linkDecantationPurchase = linkDecantationPurchase;
  },
}));

const { LinkToDecantationDrawer } = await import('./LinkToDecantationDrawer.js');

const purchase = {
  id: 'p-1',
  stationId: 'st-1',
  documentNumber: 'PUR-1',
  invoiceNumber: 'INV-1',
  supplierName: 'IOCL',
  businessDayId: null,
  awaitingDecantation: true,
  entryDate: '2026-10-09',
};

beforeEach(() => linkDecantationPurchase.mockReset());
afterEach(cleanup);

describe('purchase row link action (#469)', () => {
  it('shows "Link to decantation" only on awaiting Fuel Purchases and does not open the row', () => {
    const onLink = vi.fn();
    const onRow = vi.fn();
    renderWithProviders(
      <DataTable
        columns={buildPurchaseColumns(onLink)}
        data={[purchase, { ...purchase, id: 'p-2', awaitingDecantation: false }]}
        onRowClick={onRow}
      />,
    );
    expect(screen.getAllByText('Awaiting decantation')).toHaveLength(1);
    const buttons = screen.getAllByRole('button', { name: 'Link to decantation' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-1' }));
    expect(onRow).not.toHaveBeenCalled();
  });

  it('lists decantations with an unlinked line newest first and links via the PUT call', async () => {
    linkDecantationPurchase.mockResolvedValue({});
    const onClose = vi.fn();
    renderWithProviders(<LinkToDecantationDrawer purchase={purchase} onClose={onClose} />);
    await screen.findByText('DEC-NEW');
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('DEC-LINKED');
    expect(text.indexOf('DEC-NEW')).toBeLessThan(text.indexOf('DEC-OLD'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Link' })[0]);
    });
    expect(linkDecantationPurchase).toHaveBeenCalledWith('d-new', {
      productId: 'ms',
      purchaseId: 'p-1',
    });
    expect(onClose).toHaveBeenCalled();
  });
});
