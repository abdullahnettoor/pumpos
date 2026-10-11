// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { DataTable } from '../primitives/DataTable.js';
import { purchaseColumns } from './columns.js';

afterEach(cleanup);

describe('purchaseColumns', () => {
  it('lets the list default-sort newest first by the Date column (id entryDate)', () => {
    const rows = [
      { id: 'a', entryDate: '2026-10-01', supplierName: 'Old Supplier' },
      { id: 'b', entryDate: null, businessDate: '2026-10-09', supplierName: 'New Supplier' },
      { id: 'c', entryDate: '2026-10-05', supplierName: 'Mid Supplier' },
    ];
    const { container } = renderWithProviders(
      <DataTable
        columns={purchaseColumns}
        data={rows}
        initialSorting={[{ id: 'entryDate', desc: true }]}
      />,
    );
    const text = container.textContent ?? '';
    const order = ['New Supplier', 'Mid Supplier', 'Old Supplier'].map((n) => text.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
});
