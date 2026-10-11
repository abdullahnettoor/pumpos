/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { QueryProvider } from '../../query/queryClient.js';
import { CloudTransactionService } from '../../services/cloud.js';
import { ToastProvider } from '../primitives/ToastProvider.js';
import { CustomerFormDrawer } from './CustomerFormDrawer.js';

/**
 * Editing a customer's credit limit is an Owner / Manager right (the API refuses
 * anyone else). The desktop form mirrors it: other Roles see the limit but
 * cannot change it, and the form does not send it, so saving the rest of the
 * profile still works for an Accountant.
 */

afterEach(cleanup);

const update = vi.spyOn(CloudTransactionService.prototype, 'updateCustomer');
beforeEach(() => {
  update.mockReset();
  update.mockResolvedValue({});
});

const customer = {
  id: 'c1',
  name: 'KTC Logistics',
  customerType: 'Fleet',
  creditLimit: '200000',
  fleetCode: 'FL-1',
  isPrepaid: false,
  settlementCycle: 'OPEN',
  isActive: true,
};

const mount = (userRole?: string) =>
  render(
    <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <CustomerFormDrawer
          isOpen
          editingCustomer={customer}
          stationId="st-1"
          userRole={userRole}
          onClose={() => {}}
        />
      </ToastProvider>
    </QueryProvider>,
  );

const limit = () => screen.getByPlaceholderText('50000') as HTMLInputElement;
const saveForm = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save Customer' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  return update.mock.calls[0]![1] as Record<string, unknown>;
};

describe('CustomerFormDrawer credit limit', () => {
  it.each(['Owner', 'Manager'])('%s can change the limit, and it is sent', async (role) => {
    mount(role);
    expect(limit().disabled).toBe(false);
    fireEvent.change(limit(), { target: { value: '250000' } });
    expect((await saveForm()).creditLimit).toBe(250000);
  });

  it.each(['Accountant', 'Staff'])('%s sees it locked and it is not sent', async (role) => {
    mount(role);
    expect(limit().disabled).toBe(true);
    expect(limit().value).toBe('200000');
    expect(screen.getByText(/Only an Owner or Manager can change the credit limit/)).toBeTruthy();
    expect('creditLimit' in (await saveForm())).toBe(false);
  });

  it('leaves the form as it was when the Role is not known', async () => {
    mount(undefined);
    expect(limit().disabled).toBe(false);
    expect((await saveForm()).creditLimit).toBe(200000);
  });
});
