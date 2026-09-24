// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  createTestQueryClient,
  muteExpectedConsoleErrors,
  renderWithProviders,
} from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { ExpenseEntryForm } from './ExpenseEntryForm.js';
import { CollectionEntryForm } from './CollectionEntryForm.js';
import { PurchaseEntryForm } from './PurchaseEntryForm.js';

/**
 * Expenses, income, collections and supplier payments are Office Records
 * (ADR 0005): each carries an entry date and a funding account, never a shift.
 * These pin what the forms hand to `onSubmit`.
 */
const STATION = 's1';
const ACCOUNTS = [
  { id: 'cash', name: 'Cash in Hand', accountType: 'CASH_IN_HAND', stationId: STATION },
  { id: 'bank', name: 'HDFC Current', accountType: 'BANK', stationId: STATION },
  { id: 'clr', name: 'Card Clearing', accountType: 'MERCHANT_CLEARING', stationId: STATION },
];
const TERMINALS = [
  { id: 'pos-1', label: 'Pine POS', supportsCard: true, supportsUpi: false, isActive: true },
];

const seeded = (accounts = ACCOUNTS) => {
  const qc = createTestQueryClient();
  qc.setQueryData(queryKeys.fundingAccounts(STATION), accounts);
  qc.setQueryData(queryKeys.paymentTerminals(STATION), TERMINALS);
  qc.setQueryData(queryKeys.stations(), [{ id: STATION, settings: { timezone: 'Asia/Kolkata' } }]);
  return qc;
};

const submitVia = (label: string) => {
  fireEvent.submit(screen.getByRole('button', { name: label }).closest('form')!);
};
const setInput = (name: string, value: string) =>
  fireEvent.change(document.querySelector(`[name="${name}"]`)!, { target: { value } });

describe('office record forms', () => {
  let restoreConsole: () => void;
  beforeEach(() => {
    restoreConsole = muteExpectedConsoleErrors([/not wrapped in act/]);
  });
  afterEach(() => {
    cleanup();
    restoreConsole();
  });

  it('ExpenseEntryForm refuses to submit without a funding account', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <ExpenseEntryForm
        categories={[{ id: 'c1', name: 'Tea' }]}
        stationId={STATION}
        defaultValues={{ categoryId: 'c1', amount: 50 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
      { queryClient: seeded() },
    );
    submitVia('Add Expense');
    await waitFor(() => expect(screen.getByText('Choose the account')).toBeDefined());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ExpenseEntryForm submits the entry date and chosen account', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <ExpenseEntryForm
        categories={[{ id: 'c1', name: 'Tea' }]}
        stationId={STATION}
        defaultValues={{ categoryId: 'c1', amount: 50, fundingAccountId: 'bank' }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
      { queryClient: seeded() },
    );
    setInput('entryDate', '2026-01-15');
    submitVia('Add Expense');
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      entryDate: '2026-01-15',
      fundingAccountId: 'bank',
      categoryId: 'c1',
      amount: 50,
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('targetShiftId');
  });

  it('CollectionEntryForm preselects the only cash account for a Cash collection', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <CollectionEntryForm
        customers={[{ id: 'cu1', name: 'Acme' }]}
        stationId={STATION}
        usePaymentMethodButtons
        defaultValues={{ customerId: 'cu1', amount: 900 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
      { queryClient: seeded() },
    );
    submitVia('Log Collection');
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      paymentMethod: 'Cash',
      fundingAccountId: 'cash',
    });
  });

  it('CollectionEntryForm sends a Card collection through the chosen terminal', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <CollectionEntryForm
        customers={[{ id: 'cu1', name: 'Acme' }]}
        stationId={STATION}
        usePaymentMethodButtons
        defaultValues={{ customerId: 'cu1', amount: 900 }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
      { queryClient: seeded() },
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Card' }));
    setInput('terminalId', 'pos-1');
    await waitFor(() =>
      expect(screen.getByText("Posts to the terminal's clearing account")).toBeDefined(),
    );
    submitVia('Log Collection');
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ paymentMethod: 'Card', terminalId: 'pos-1' });
  });

  it('PurchaseEntryForm pay-now carries the funding account and entry date', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <PurchaseEntryForm
        shiftOptions={[]}
        suppliers={[{ id: 'sup', name: 'IOCL', isActive: true }]}
        products={[{ id: 'oil', name: 'Oil', productType: 'MERCHANDISE', unit: 'unit' }]}
        tanks={[]}
        stationId={STATION}
        timeZone="Asia/Kolkata"
        enablePayment
        defaultValues={{
          supplierId: 'sup',
          lines: [{ productId: 'oil', quantity: 2, unitPrice: 100 } as never],
        }}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
      { queryClient: seeded([ACCOUNTS[1]]) },
    );
    fireEvent.click(screen.getByLabelText('Record payment now'));
    submitVia('Add Purchase');
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payment = onSubmit.mock.calls[0][1];
    expect(payment).toMatchObject({ amount: 200, fundingAccountId: 'bank' });
    expect(payment.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payment).not.toHaveProperty('accountId');
  });
});
