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
const createDispenserWithNozzles = vi.fn();
const createNozzle = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudDispenserService: class {
    updateDispenser = (...a: unknown[]) => updateDispenser(...a);
    createDispenser = vi.fn();
    createDispenserWithNozzles = (...a: unknown[]) => createDispenserWithNozzles(...a);
    deleteDispenser = vi.fn();
  },
  CloudNozzleService: class {
    createNozzle = (...a: unknown[]) => createNozzle(...a);
  },
}));

const dispensers = [
  { id: 'du-1', stationId: 'st-1', name: 'Pump One', code: 'DU-1', status: 'ACTIVE' },
  { id: 'du-2', stationId: 'st-1', name: 'Pump Two', code: 'DU-2', status: 'MAINTENANCE' },
  { id: 'du-3', stationId: 'st-1', name: 'Pump Three', code: 'DU-3', status: 'INACTIVE' },
];

/** Tanks and fuels, empty unless a test needs the add-dispenser form filled in. */
const fixtures: { tanks: unknown[]; products: unknown[] } = { tanks: [], products: [] };

/**
 * Mocked at the QUERY layer, not just the service. Taking a pump out of
 * service changes what the shifts screen may offer, and that cache is a
 * different (operational, 15s) tier from the dispenser list — a test that only
 * watches the service call cannot tell whether it was refreshed.
 */
const invalidateOperational = vi.fn();

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDispensers: () => ({ data: dispensers, isPending: false }),
  useTanks: () => ({ data: fixtures.tanks, isPending: false }),
  useProducts: () => ({ data: fixtures.products, isPending: false }),
  useNozzles: () => ({ data: [], isPending: false }),
  useInvalidateOperational: () => invalidateOperational,
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
    invalidateOperational.mockReset().mockResolvedValue(undefined);
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
      expect(updateDispenser).toHaveBeenCalledWith(
        'du-1',
        { status: 'MAINTENANCE' },
        { idempotencyKey: expect.any(String) },
      ),
    );
  });

  it('sends ACTIVE for a pump being returned', async () => {
    render();
    fireEvent.click(card('Pump Two').getByRole('button', { name: /return to service/i }));
    await waitFor(() =>
      expect(updateDispenser).toHaveBeenCalledWith(
        'du-2',
        { status: 'ACTIVE' },
        { idempotencyKey: expect.any(String) },
      ),
    );
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

  it('a retry after a dropped connection sends the same Idempotency-Key; a new change after success gets a new one', async () => {
    // A one-off action opens its own session; the shared store hands the
    // unsettled key back for the same body, so the change cannot apply twice.
    updateDispenser.mockRejectedValueOnce(new Error('Network down'));
    render();
    const toggle = () =>
      fireEvent.click(card('Pump One').getByRole('button', { name: /maintenance/i }));
    const keyOf = (n: number) =>
      (updateDispenser.mock.calls[n]?.[2] as { idempotencyKey: string }).idempotencyKey;

    toggle();
    await waitFor(() => expect(updateDispenser).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Network down/i)).toBeDefined());
    toggle();
    await waitFor(() => expect(updateDispenser).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));

    await waitFor(() =>
      expect(card('Pump One').getByRole('button', { name: /maintenance/i })).toBeDefined(),
    );
    toggle();
    await waitFor(() => expect(updateDispenser).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).not.toBe(keyOf(1));
  });

  describe('refreshing what the change reaches', () => {
    it('refreshes the shifts screen, which decides whether the pump is offered', async () => {
      // The dispenser list and shift status are different cache tiers. Only
      // invalidating the list leaves shift open still offering a pump that was
      // just taken out of service, for up to the operational staleness window.
      render();
      fireEvent.click(card('Pump One').getByRole('button', { name: /maintenance/i }));
      await waitFor(() => expect(invalidateOperational).toHaveBeenCalledTimes(1));
    });

    it('refreshes it when a pump comes back into service too', async () => {
      render();
      fireEvent.click(card('Pump Two').getByRole('button', { name: /return to service/i }));
      await waitFor(() => expect(invalidateOperational).toHaveBeenCalledTimes(1));
    });

    it('does not refresh anything when the change itself failed', async () => {
      updateDispenser.mockRejectedValueOnce(new Error('Network down'));
      render();
      fireEvent.click(card('Pump One').getByRole('button', { name: /maintenance/i }));
      await waitFor(() => expect(screen.getByText(/Network down/i)).toBeDefined());
      expect(invalidateOperational).not.toHaveBeenCalled();
    });

    it('still reports success when only the refresh fails', async () => {
      // The status did change. Reporting that as a failed change would send
      // the operator back to flip it again.
      invalidateOperational.mockRejectedValueOnce(new Error('offline'));
      render();
      fireEvent.click(card('Pump One').getByRole('button', { name: /maintenance/i }));
      await waitFor(() => expect(screen.getByText(/is out of service\./i)).toBeDefined());
      expect(screen.queryByText(/Could not change the dispenser status/i)).toBeNull();
    });
  });
});

describe('DispensersList — the Station page Add menu', () => {
  afterEach(cleanup);

  it('opens the add drawer once per request and reports it handled', () => {
    const onCreateHandled = vi.fn();
    renderWithProviders(
      <DispensersList stationId="st-1" createRequest={1} onCreateHandled={onCreateHandled} />,
    );
    expect(screen.getByText('Add Dispenser Island')).toBeDefined();
    expect(onCreateHandled).toHaveBeenCalledTimes(1);
  });

  it('keeps the drawer closed without a request', () => {
    renderWithProviders(<DispensersList stationId="st-1" />);
    expect(screen.queryByText('Add Dispenser Island')).toBeNull();
  });
});

describe('DispensersList — adding a dispenser with its nozzles (#591)', () => {
  const fuel = (id: string, code: string) => ({
    id,
    code,
    name: code,
    productType: 'FUEL',
    isActive: true,
    unit: 'L',
  });

  afterEach(() => {
    cleanup();
    fixtures.tanks = [];
    fixtures.products = [];
    createDispenserWithNozzles.mockReset();
    createNozzle.mockReset();
    invalidateOperational.mockReset().mockResolvedValue(undefined);
  });

  const openDual = () => {
    fixtures.products = [fuel('p-ms', 'MS'), fuel('p-hsd', 'HSD')];
    fixtures.tanks = [
      { id: 't-ms', stationId: 'st-1', name: 'Tank MS', productId: 'p-ms' },
      { id: 't-hsd', stationId: 'st-1', name: 'Tank HSD', productId: 'p-hsd' },
    ];
    render();
    fireEvent.click(screen.getByRole('button', { name: /dual dispenser/i }));
  };
  const save = () => fireEvent.click(screen.getByRole('button', { name: 'Create Dispenser' }));

  it('sends the dispenser and every nozzle as one keyed request', async () => {
    createDispenserWithNozzles.mockResolvedValue({ dispenser: { id: 'du-new' }, nozzles: [] });
    openDual();
    save();

    await waitFor(() => expect(createDispenserWithNozzles).toHaveBeenCalledTimes(1));
    expect(createDispenserWithNozzles).toHaveBeenCalledWith(
      {
        stationId: 'st-1',
        name: 'Dispenser Unit 4',
        code: 'DU-04',
        status: 'ACTIVE',
        nozzles: [
          { name: 'N1', tankId: 't-ms', productId: 'p-ms', currentReading: 1000 },
          { name: 'N2', tankId: 't-hsd', productId: 'p-hsd', currentReading: 1000 },
        ],
      },
      { idempotencyKey: expect.any(String) },
    );
    expect(createNozzle).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Dispenser unit created.')).toBeDefined());
  });

  it('refreshes the shifts screen, which reads nozzles from shift status', async () => {
    createDispenserWithNozzles.mockResolvedValue({ dispenser: { id: 'du-new' }, nozzles: [] });
    openDual();
    save();

    await waitFor(() => expect(invalidateOperational).toHaveBeenCalledTimes(1));
  });

  it('refreshes nothing when the save failed', async () => {
    createDispenserWithNozzles.mockRejectedValueOnce(new Error('Network down'));
    openDual();
    save();

    await waitFor(() => expect(screen.getByText(/Network down/i)).toBeDefined());
    expect(invalidateOperational).not.toHaveBeenCalled();
  });

  it('retries a dropped save under the same key, so it cannot add a second dispenser', async () => {
    createDispenserWithNozzles
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce({ dispenser: { id: 'du-new' }, nozzles: [] });
    openDual();
    save();
    await waitFor(() => expect(screen.getByText(/Network down/i)).toBeDefined());
    save();

    await waitFor(() => expect(createDispenserWithNozzles).toHaveBeenCalledTimes(2));
    const keyOf = (n: number) =>
      (createDispenserWithNozzles.mock.calls[n][1] as { idempotencyKey: string }).idempotencyKey;
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('sends nothing while a nozzle has no tank', async () => {
    openDual();
    const tank = screen
      .getAllByRole('combobox')
      .find((el) => within(el).queryByRole('option', { name: /Tank MS/ }));
    fireEvent.change(tank as HTMLElement, { target: { value: '' } });
    save();

    await waitFor(() =>
      expect(screen.getByText(/all nozzles have a valid tank and product/i)).toBeDefined(),
    );
    expect(createDispenserWithNozzles).not.toHaveBeenCalled();
  });
});
