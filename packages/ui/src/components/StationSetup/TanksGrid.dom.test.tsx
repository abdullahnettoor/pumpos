// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

/**
 * The Station page owns the one "Add" action (#537): its Add ▾ menu asks the
 * tab to open its drawer with a fresh `createRequest`, and the tab hands the
 * request back so revisiting it never reopens the drawer.
 */
const createTank = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudTankService: class {
    createTank = (...a: unknown[]) => createTank(...a);
  },
}));

const products = [
  { id: 'p-ms', code: 'MS', name: 'Petrol', productType: 'FUEL', isActive: true, unit: 'L' },
];

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTanks: () => ({ data: [], isPending: false }),
  useProducts: () => ({ data: products, isPending: false }),
}));

const { TanksGrid } = await import('./TanksGrid.js');

describe('TanksGrid — the Station page Add menu', () => {
  afterEach(() => {
    cleanup();
    createTank.mockReset();
  });

  it('opens the add drawer for a request and reports it handled', () => {
    const onCreateHandled = vi.fn();
    renderWithProviders(
      <TanksGrid stationId="st-1" createRequest={1} onCreateHandled={onCreateHandled} />,
    );
    expect(screen.getByText('Add Storage Tank')).toBeDefined();
    expect(onCreateHandled).toHaveBeenCalledTimes(1);
  });

  it('keeps the drawer closed without a request, and offers no header Add button', () => {
    renderWithProviders(<TanksGrid stationId="st-1" />);
    expect(screen.queryByText('Add Storage Tank')).toBeNull();
    expect(screen.queryByRole('button', { name: /add tank/i })).toBeNull();
  });

  it('sends the create under an Idempotency-Key', async () => {
    createTank.mockResolvedValue({ id: 't-1' });
    renderWithProviders(<TanksGrid stationId="st-1" createRequest={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Tank' }));
    await waitFor(() =>
      expect(createTank).toHaveBeenCalledWith(
        { stationId: 'st-1', name: 'Tank 1', productId: 'p-ms', capacity: 20000 },
        { idempotencyKey: expect.any(String) },
      ),
    );
    await waitFor(() => expect(screen.getByText('Tank created.')).toBeDefined());
  });
});
