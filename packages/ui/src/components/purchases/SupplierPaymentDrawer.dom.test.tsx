/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

const recordSupplierPayment = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudTransactionService: class {
    recordSupplierPayment = recordSupplierPayment;
  },
}));
vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useFundingAccounts: () => ({
    isSuccess: true,
    data: [{ id: 'acc-1', name: 'Cash in Hand', accountType: 'CASH_IN_HAND', isActive: true }],
  }),
  useStationTimeZone: () => 'Asia/Kolkata',
  useInvalidateOperational: () => async () => {},
}));

const { SupplierPaymentDrawer } = await import('./SupplierPaymentDrawer.js');

const supplier = { id: 'sup-1', name: 'Bharat Fuels', currentBalance: 5000 };

const open = () =>
  renderWithProviders(
    <SupplierPaymentDrawer isOpen supplier={supplier} stationId="st-1" onClose={() => {}} />,
  );

const submit = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Record Payment' }));
  });

const setAmount = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value } });

beforeEach(() => recordSupplierPayment.mockReset());
afterEach(cleanup);

describe('SupplierPaymentDrawer', () => {
  it('sends the Office Record payload with an Idempotency-Key', async () => {
    recordSupplierPayment.mockResolvedValue({});
    open();
    await submit();
    const [payload, opts] = recordSupplierPayment.mock.calls[0];
    expect(payload).toMatchObject({
      stationId: 'st-1',
      supplierId: 'sup-1',
      fundingAccountId: 'acc-1',
      amount: 5000,
    });
    expect(payload).not.toHaveProperty('shiftId');
    expect(opts.idempotencyKey).toEqual(expect.any(String));
  });

  it('says why an amount is refused instead of doing nothing', async () => {
    open();
    setAmount('10000000000');
    await submit();
    expect(recordSupplierPayment).not.toHaveBeenCalled();
    expect(screen.getByText('That is more than a payment can hold.')).toBeTruthy();
  });

  it('keeps the key after a network drop and replaces it after a refusal', async () => {
    recordSupplierPayment
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'NETWORK' }))
      .mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 403, code: 'FORBIDDEN' }))
      .mockResolvedValue({});
    open();
    await submit();
    await submit();
    await submit();
    const keys = recordSupplierPayment.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[1]).toBe(keys[0]); // outcome unknown: same key
    expect(keys[2]).not.toBe(keys[1]); // 403 decided: a fresh key
  });
});
