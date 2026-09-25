// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LegacyPurchasesTable } from './LegacyPurchasesTable.js';
import { legacyPurchases } from '../../services/reports/legacyPurchases.js';

// #308: new Shift Summaries hold no purchases; older snapshots that stored them
// keep rendering them, because a snapshot is never recalculated.
const OLD_SNAPSHOT = {
  purchases: [
    {
      supplierName: 'IOCL Depot',
      documentNumber: 'PUR-000007',
      invoiceNumber: 'INV-42',
      notes: 'Tanker into Tank A',
      amount: '450000',
    },
  ],
};

describe('LegacyPurchasesTable', () => {
  afterEach(cleanup);

  it('shows the purchases an older snapshot stored', () => {
    render(<LegacyPurchasesTable snapshot={OLD_SNAPSHOT} />);
    expect(screen.getByText('Supplier Fuel Intakes')).toBeTruthy();
    expect(screen.getByText('IOCL Depot')).toBeTruthy();
    expect(screen.getByText(/PUR-000007/)).toBeTruthy();
    expect(screen.getByText(/INV-42/)).toBeTruthy();
  });

  it.each([
    ['a new snapshot with no purchases key', {}],
    ['an empty purchases array', { purchases: [] }],
    ['a missing snapshot', null],
  ])('renders nothing for %s', (_label, snapshot) => {
    const { container } = render(<LegacyPurchasesTable snapshot={snapshot} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('legacyPurchases', () => {
  it('reads stored purchases and tolerates non-array shapes', () => {
    expect(legacyPurchases(OLD_SNAPSHOT)).toHaveLength(1);
    expect(legacyPurchases({ purchases: 'x' })).toEqual([]);
    expect(legacyPurchases(undefined)).toEqual([]);
  });
});
