// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

/**
 * Taking a dispenser out of service.
 *
 * The status column has existed on `dispenser_units` since the baseline
 * migration, the shift-status read already filters on it, and `UpdateDispenser`
 * already accepts it — but nothing in the product could ever set it, so every
 * dispenser was ACTIVE forever and the field was decoration.
 *
 * It matters now: opening a shift is blocked while a dispenser has no
 * attendant (#258), and a pump that nobody is working is a pump that is not in
 * use. Without a way to say so, a broken pump would wedge shift open entirely.
 */
const updateDispenser = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudDispenserService: class {
    updateDispenser = (...a: unknown[]) => updateDispenser(...a);
    createDispenser = vi.fn();
    deleteDispenser = vi.fn();
  },
}));

const dispensers = [
  { id: 'du-1', stationId: 'st-1', name: 'Pump One', code: 'DU-1', status: 'ACTIVE' },
  { id: 'du-2', stationId: 'st-1', name: 'Pump Two', code: 'DU-2', status: 'MAINTENANCE' },
  { id: 'du-3', stationId: 'st-1', name: 'Pump Three', code: 'DU-3', status: 'INACTIVE' },
];

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDispensers: () => ({ data: dispensers, isPending: false }),
  useTanks: () => ({ data: [], isPending: false }),
  useProducts: () => ({ data: [], isPending: false }),
  useNozzles: () => ({ data: [], isPending: false }),
}));

const { DispensersList } = await import('./DispensersList.js');

const render = () => renderWithProviders(<DispensersList stationId="st-1" />);

/** The card for one dispenser, found by its heading. */
const card = (name: string) =>
  within(screen.getByText(name).closest('[data-dispenser]') as HTMLElement);

describe('DispensersList — taking a pump out of service', () => {
  afterEach(() => {
    cleanup();
    updateDispenser.mockReset().mockResolvedValue({});
  });

  it('offers to take an in-service pump out', () => {
    render();
    expect(card('Pump One').getByRole('button', { name: /maintenance/i })).toBeDefined();
  });

  it('offers to return an out-of-service pump', () => {
    render();
    expect(card('Pump Two').getByRole('button', { name: /return to service/i })).toBeDefined();
  });

  it('sends MAINTENANCE for a pump being taken out', async () => {
    render();
    fireEvent.click(card('Pump One').getByRole('button', { name: /maintenance/i }));
    await waitFor(() =>
      expect(updateDispenser).toHaveBeenCalledWith('du-1', { status: 'MAINTENANCE' }),
    );
  });

  it('sends ACTIVE for a pump being returned', async () => {
    render();
    fireEvent.click(card('Pump Two').getByRole('button', { name: /return to service/i }));
    await waitFor(() => expect(updateDispenser).toHaveBeenCalledWith('du-2', { status: 'ACTIVE' }));
  });

  it('sends only the status, so a rename cannot ride along with it', async () => {
    render();
    fireEvent.click(card('Pump One').getByRole('button', { name: /maintenance/i }));
    await waitFor(() => expect(updateDispenser).toHaveBeenCalled());
    expect(Object.keys(updateDispenser.mock.calls[0][1])).toEqual(['status']);
  });

  it('says what being out of service costs the operator', () => {
    // The consequence is not obvious: its nozzles stop being asked for
    // opening readings, and it stops needing an attendant at shift open.
    render();
    expect(screen.getByText(/not offered at shift open/i)).toBeDefined();
  });

  it('offers no toggle on a retired dispenser', () => {
    // Retired is not the same as under repair. A two-state toggle over a
    // three-state enum would flip INACTIVE straight to ACTIVE and silently
    // un-retire it.
    render();
    expect(card('Pump Three').queryByRole('button', { name: /service|maintenance/i })).toBeNull();
    expect(card('Pump Three').getByText(/retired/i)).toBeDefined();
  });

  it('reports a failed change as a failure and does not claim success', async () => {
    updateDispenser.mockRejectedValueOnce(new Error('Network down'));
    render();
    fireEvent.click(card('Pump One').getByRole('button', { name: /maintenance/i }));
    await waitFor(() => expect(screen.getByText(/Network down/i)).toBeDefined());
    expect(screen.queryByText(/is out of service\./i)).toBeNull();
  });
});
