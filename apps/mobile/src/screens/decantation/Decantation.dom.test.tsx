// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Station } from '@pump/shared';

/**
 * The Decantation flows on mobile. `@pump/ui` is the seam for the read hooks
 * and the save mutation; the form model, the pages and the shell are real.
 */
const q = (data: unknown) => ({ data, isLoading: false, isError: false });

const feed = vi.hoisted(() => ({
  tanks: [] as unknown[],
  decantations: [] as any[],
  saved: [] as any[],
  discarded: [] as string[],
  failNext: false,
  toasts: [] as string[],
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useInventoryStatus: () => q(feed.tanks),
    useDecantations: (_s: string, status = '') =>
      q(status ? feed.decantations.filter((d) => d.status === status) : feed.decantations),
    useLinkablePurchases: (_s: string, ids: string[]) =>
      ids.map(() =>
        q([
          {
            purchaseId: 'p-ms',
            documentNumber: 'PUR-1',
            invoiceNumber: 'INV-7',
            supplierName: 'IOCL',
            entryDate: '2026-10-09',
            invoiceQty: 12000,
            invoiceDensity: 745,
            linkedDecantationCount: 0,
            awaitingDecantation: true,
          },
        ]),
      ),
    useRecordDecantation: () => ({
      isPending: false,
      mutateAsync: async (vars: unknown) => {
        feed.saved.push(vars);
        if (feed.failNext) {
          feed.failNext = false;
          throw Object.assign(new Error('network'), { status: undefined });
        }
        return { decantation: { flags: [] }, warnings: [] };
      },
    }),
    useDiscardDecantation: () => ({
      isPending: false,
      mutateAsync: async (vars: { decantationId: string }) => {
        feed.discarded.push(vars.decantationId);
        return {};
      },
    }),
    useLinkDecantationPurchase: () => ({ isPending: false, mutateAsync: async () => ({}) }),
    useToast: () => ({
      success: (m: string) => feed.toasts.push(m),
      error: (m: string) => feed.toasts.push(m),
      info: (m: string) => feed.toasts.push(m),
    }),
  };
});

const { NavProvider, useNav } = await import('../../shell/nav.js');
const { ShellContext } = await import('../../shell/context.js');
const { DecantationActions, DecantationCard } = await import('../home/DecantationEntry.js');
const { TankerArrivedPage } = await import('./TankerArrivedPage.js');
const { FinishUnloadingPage } = await import('./FinishUnloadingPage.js');

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as unknown as Station;

const TANKS = [
  { id: 'tk-ms', name: 'Tank 1', productId: 'ms', productName: 'Petrol', currentVolume: 8000 },
  { id: 'tk-hsd', name: 'Tank 2', productId: 'hsd', productName: 'Diesel', currentVolume: 9000 },
];

const draft = {
  id: 'dec-1',
  stationId: 'st-1',
  businessDayId: 'bd-1',
  businessDate: '2026-10-09',
  documentNumber: 'DEC-1',
  tankerNumber: 'KL-07-CB-4412',
  driverName: null,
  unloadStartedAt: '2026-10-09T08:30:00.000Z',
  unloadEndedAt: null,
  chambersChecked: true,
  status: 'DRAFT',
  flags: [],
  notes: null,
  createdAt: '2026-10-09T08:30:00.000Z',
  updatedAt: '2026-10-09T08:30:00.000Z',
  lines: [
    {
      id: 'line-1',
      tankId: 'tk-ms',
      productId: 'ms',
      beforeDip: 3000,
      beforeDipAt: null,
      observedDensity: null,
      observedTempC: null,
      roDensity: 745,
      afterDip: null,
      afterDipAt: null,
      salesDuring: 0,
      receivedQty: null,
      status: 'PENDING_MEASUREMENT',
    },
  ],
  chambers: [
    {
      id: 'ch-1',
      tankLineId: 'line-1',
      chamberNo: 1,
      capacityL: 6000,
      sealOk: true,
      mark: 'OK',
      dipMm: null,
      emptied: false,
    },
  ],
  links: [],
  unlinkedProductIds: ['ms'],
};

const Probe: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const nav = useNav();
  return (
    <>
      {children}
      {nav.stacks[nav.active]?.map((e) => (
        <div key={e.id}>{e.element}</div>
      ))}
    </>
  );
};

const mount = (role: string, ui: React.ReactNode) =>
  render(
    <NavProvider tabs={['home']}>
      <ShellContext.Provider
        value={
          {
            station,
            stationName: station.name,
            userName: 'Asha',
            role,
            openAccount: () => {},
          } as never
        }
      >
        <Probe>{ui}</Probe>
      </ShellContext.Provider>
    </NavProvider>,
  );

beforeEach(() => {
  Object.assign(feed, {
    tanks: TANKS,
    decantations: [draft],
    saved: [],
    toasts: [],
    discarded: [],
    failNext: false,
  });
});
afterEach(cleanup);

describe('Decantation entry points', () => {
  it.each(['Owner', 'Manager', 'Accountant'])(
    '%s sees Tanker arrived and the list link',
    (role) => {
      mount(role, <DecantationActions station={station} />);
      expect(screen.getByRole('button', { name: 'Tanker arrived' })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Decantations/ })).toBeTruthy();
    },
  );

  it.each(['Attendant', 'Staff'])('%s never sees them, nor the pinned card', (role) => {
    mount(
      role,
      <>
        <DecantationActions station={station} />
        <DecantationCard station={station} />
      </>,
    );
    expect(screen.queryByRole('button', { name: 'Tanker arrived' })).toBeNull();
    expect(screen.queryByText(/Finish unloading/)).toBeNull();
  });

  it('pins a card while a draft exists and opens Finish unloading', () => {
    mount('Manager', <DecantationCard station={station} />);
    const card = screen.getByRole('button', { name: /KL-07-CB-4412/ });
    expect(card.textContent).toContain('KL-07-CB-4412 · Tank 1 · arrived 14:00');
    expect(card.textContent).toContain('Finish unloading');
    fireEvent.click(card);
    expect(screen.getAllByText('Finish unloading').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Save/ })).toBeTruthy();
  });

  it('has no card when no draft exists', () => {
    feed.decantations = [{ ...draft, status: 'PENDING_MEASUREMENT' }];
    mount('Manager', <DecantationCard station={station} />);
    expect(screen.queryByText(/Finish unloading/)).toBeNull();
  });
});

describe('Tanker arrived (first half)', () => {
  it('asks inline for the tanker and the before dip, and saves nothing', async () => {
    mount('Owner', <TankerArrivedPage station={station} />);
    fireEvent.click(screen.getByRole('button', { name: /Save · start unloading/ }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Tanker number is required').length).toBeGreaterThan(0);
    expect(screen.getByText(/Enter the before dip/)).toBeTruthy();
    expect(feed.saved).toHaveLength(0);
  });

  it('POSTs a draft with the tanker, tank line, density and the picked invoice', async () => {
    mount('Owner', <TankerArrivedPage station={station} />);
    fireEvent.change(screen.getByLabelText('Tanker no.'), { target: { value: 'KL-01-A-1' } });
    fireEvent.change(screen.getByLabelText('Petrol invoice'), { target: { value: 'p-ms' } });
    fireEvent.change(screen.getByLabelText('Tank 1'), { target: { value: 'tk-ms' } });
    fireEvent.change(screen.getByLabelText('Before dip (L) tank 1'), { target: { value: '3000' } });
    fireEvent.change(screen.getByLabelText('RO density tank 1'), { target: { value: '746' } });
    fireEvent.click(screen.getByRole('button', { name: /Save · start unloading/ }));
    await waitFor(() => expect(feed.saved).toHaveLength(1));
    const { body, decantationId, idempotencyKey } = feed.saved[0];
    expect(decantationId).toBeUndefined();
    expect(idempotencyKey).toBeTruthy();
    expect(body).toMatchObject({
      stationId: 'st-1',
      tankerNumber: 'KL-01-A-1',
      draft: true,
      links: [{ productId: 'ms', purchaseId: 'p-ms' }],
      lines: [{ tankId: 'tk-ms', beforeDip: 3000, roDensity: 746 }],
    });
    expect(body.unloadEndedAt).toBeUndefined();
  });

  it('shows the tanker chambers only behind the checkbox', () => {
    mount('Owner', <TankerArrivedPage station={station} />);
    expect(screen.queryByText('Chamber 1')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Check tanker chambers/));
    expect(screen.getByText('Chamber 1')).toBeTruthy();
  });

  it('calculates density at 15 °C from the hydrometer reading', () => {
    mount('Owner', <TankerArrivedPage station={station} />);
    fireEvent.click(screen.getByText('Calculate at 15 °C'));
    fireEvent.change(screen.getByLabelText('Observed density'), { target: { value: '740' } });
    fireEvent.change(screen.getByLabelText('Temperature (°C)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /^Use .* kg\/m³ at 15 °C$/ }));
    expect((screen.getByLabelText('RO density tank 1') as HTMLInputElement).value).not.toBe('');
  });
});

describe('Finish unloading (second half)', () => {
  it('PUTs the full visit without draft, sending the line id back', async () => {
    mount('Owner', <FinishUnloadingPage station={station} decantation={draft as never} />);
    fireEvent.click(screen.getByLabelText(/Take after-unloading dip now/));
    fireEvent.change(screen.getByLabelText('After dip (L) tank 1'), { target: { value: '9000' } });
    fireEvent.click(screen.getByLabelText('Chamber 1'));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(feed.saved).toHaveLength(1));
    const { body, decantationId, idempotencyKey } = feed.saved[0];
    expect(decantationId).toBe('dec-1');
    expect(idempotencyKey).toBeTruthy();
    expect(body.draft).toBeUndefined();
    expect(body.unloadEndedAt).toBeTruthy();
    expect(body.lines[0]).toMatchObject({
      id: 'line-1',
      tankId: 'tk-ms',
      beforeDip: 3000,
      afterDip: 9000,
    });
    expect(body.chambers[0]).toMatchObject({ chamberNo: 1, emptied: true });
  });

  it('shows Pending measurement and still saves when no after dip is taken', async () => {
    mount('Owner', <FinishUnloadingPage station={station} decantation={draft as never} />);
    expect(screen.getByText('Pending measurement')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(feed.saved).toHaveLength(1));
    expect(feed.saved[0].body.lines[0].afterDip).toBeUndefined();
  });

  it('discards a draft only after an inline confirm', async () => {
    mount('Owner', <FinishUnloadingPage station={station} decantation={draft as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(feed.discarded).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm discard' }));
    await waitFor(() => expect(feed.discarded).toEqual(['dec-1']));
  });

  it('keeps the Idempotency-Key for an unchanged retry and renews it when the form changed', async () => {
    mount('Owner', <FinishUnloadingPage station={station} decantation={draft as never} />);
    feed.failNext = true;
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(feed.saved).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(feed.saved).toHaveLength(2));
    expect(feed.saved[1].idempotencyKey).toBe(feed.saved[0].idempotencyKey);
  });

  it('renews the Idempotency-Key when the form changed after a failed attempt', async () => {
    mount('Owner', <FinishUnloadingPage station={station} decantation={draft as never} />);
    feed.failNext = true;
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    fireEvent.click(screen.getByLabelText(/Take after-unloading dip now/));
    fireEvent.change(screen.getByLabelText('After dip (L) tank 1'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    await waitFor(() => expect(feed.saved).toHaveLength(2));
    expect(feed.saved[1].idempotencyKey).not.toBe(feed.saved[0].idempotencyKey);
  });
});
