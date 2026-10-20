// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

const reopenShift = vi.fn((..._args: unknown[]) => Promise.resolve({}));
const recordCollection = vi.fn((..._args: unknown[]) => Promise.resolve({ id: 'c1' }));

vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CloudTransactionService: class {
      recordCollection = recordCollection;
    },
    CloudShiftService: class {
      reopenShift = reopenShift;
    },
  };
});

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCustomers: () => ({
    data: [{ id: 'cust-1', name: 'Fleet Co', customerType: 'Fleet' }],
    isPending: false,
    error: null,
  }),
  useInvalidateOperational: () => () => Promise.resolve(),
}));

const { ShiftSummaryView } = await import('./ShiftSummaryView.js');

const STATION = { id: 'station-1', name: 'Test RO', settings: {} };

const record = {
  shiftId: 'shift-1',
  status: 'CLOSED',
  businessDate: '2026-03-01',
  shiftSequence: 1,
  snapshotData: {
    shiftId: 'shift-1',
    templateName: 'Morning',
    cashVarianceModel: 2,
    nozzleReadings: [],
    handovers: [
      {
        id: 'h1',
        attendantName: 'Ravi',
        duCode: 'DU1',
        cashHandedOver: 100,
        varianceAmount: -40,
      },
    ],
    cashVariance: 0,
    attendantVariance: -40,
  },
};

const view = (props: Record<string, unknown>) =>
  renderWithProviders(
    <ShiftSummaryView
      shiftSummary={record}
      userRole="Owner"
      canReopen={false}
      onReopenSuccess={() => {}}
      onBack={() => {}}
      station={STATION}
      {...props}
    />,
  );

describe('ShiftSummaryView', () => {
  afterEach(() => {
    cleanup();
    recordCollection.mockClear();
  });

  it('opens on the Page Frame with its back link to History', () => {
    view({});
    expect(screen.getByRole('heading', { name: 'Shift summary' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to History' })).toBeDefined();
    expect(screen.getByText('20260301-1')).toBeDefined();
  });

  it('reads variance in the shared words', () => {
    view({});
    expect(screen.getAllByText('Balanced').length).toBeGreaterThan(0);
    expect(screen.getAllByText('−₹40.00').length).toBeGreaterThan(0);
  });

  it("shows Couldn't load with Retry when the summary read fails", () => {
    const refetch = vi.fn();
    view({
      shiftSummary: null,
      query: { isPending: false, isError: true, fetchStatus: 'idle', error: new Error(), refetch },
    });
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it('records a credit sale with an Idempotency-Key', async () => {
    view({});
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: /Log credit sale/ }));
    await waitFor(() => expect(recordCollection).toHaveBeenCalledTimes(1));
    expect(recordCollection.mock.calls[0][0]).toMatchObject({
      shiftId: 'shift-1',
      customerId: 'cust-1',
      amount: 250,
      paymentMethod: 'Credit',
    });
    expect(
      (recordCollection.mock.calls[0][1] as { idempotencyKey: string }).idempotencyKey,
    ).toEqual(expect.any(String));
  });

  it('reopens with an Idempotency-Key', async () => {
    const onReopenSuccess = vi.fn();
    view({ canReopen: true, onReopenSuccess });
    fireEvent.click(screen.getByRole('button', { name: /Reopen shift/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(reopenShift).toHaveBeenCalledTimes(1));
    expect(reopenShift.mock.calls[0][0]).toBe('shift-1');
    expect((reopenShift.mock.calls[0][1] as { idempotencyKey: string }).idempotencyKey).toEqual(
      expect.any(String),
    );
    await waitFor(() => expect(onReopenSuccess).toHaveBeenCalled());
  });
});
