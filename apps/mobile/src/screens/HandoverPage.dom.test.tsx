// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * The owner / manager's handover page: the shared form inside a detail page,
 * with its one Save handover action in the page's bottom action bar and the
 * same payload as the inline form. `@pump/ui` is the mock seam, as in
 * HandoverPanel.dom.test.tsx.
 */
const mutateAsync = vi.fn();
const assignment: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useMyAssignment: () => assignment,
    useProducts: () => ({ data: [] }),
    useCustomers: () => ({ data: [] }),
    useAllVehicles: () => ({ data: [] }),
    useInventoryItems: () => ({ data: [] }),
    useMerchandiseHandovers: () => ({ data: [] }),
    useRecordHandoverMutation: () => ({ mutateAsync, isPending: false }),
    CloudTransactionService: class {
      recordMerchandiseHandover = vi.fn();
      recordCollection = vi.fn();
      voidCreditSale = vi.fn();
      voidOmcCardSale = vi.fn();
    },
    runTask: (p: Promise<unknown>) => p.catch(() => {}),
  };
});
vi.mock('../components/CashCountSheet.js', () => ({ CashCountSheet: () => null }));

const { HandoverPage } = await import('./HandoverPage.js');
const { HandoverPanel } = await import('../components/HandoverPanel.js');
const { NavProvider, useNav } = await import('../shell/nav.js');
const { PageActiveContext } = await import('../ui/backStack.js');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

const NOZZLE = '33333333-3333-4333-8333-333333333333';

const echo = (payload: any) => ({
  handover: {
    id: 'h1',
    shiftId: payload.shiftId,
    duId: payload.duId,
    cashHandedOver: String(payload.cashHandedOver ?? 0),
    cardHandedOver: '0',
    upiHandedOver: '0',
    creditHandedOver: '0',
    expectedSales: '0',
    varianceAmount: '0',
    createdAt: '2026-10-09T12:10:00.000Z',
  },
  terminalEntries: [],
  nozzleReadings: (payload.nozzleReadings ?? []).map((r: any, i: number) => ({
    id: `hr-${i}`,
    nozzleId: r.nozzleId,
    closingReading: Number(r.closingReading ?? 0),
    testingVolume: 0,
    netVolume: 0,
  })),
  omcCardSales: 0,
  expectedTotal: 0,
  declaredTotal: Number(payload.cashHandedOver ?? 0),
  varianceAmount: 0,
});

const makeAssignment = (handover?: unknown) => ({
  userId: 'u1',
  station: { id: 'st-1', name: 'Highway Fuels' },
  shift: {
    id: 'shift-2',
    templateName: 'Shift 2',
    stationId: 'st-1',
    openedAt: '2026-10-09T08:30:00.000Z',
  },
  stationHasConfiguredTerminals: false,
  dispenserUnits: [
    {
      duId: 'du-2',
      duName: 'DU2',
      nozzles: [
        {
          nozzleId: NOZZLE,
          nozzleName: 'N3',
          productId: 'p1',
          productName: 'Diesel',
          unit: 'L',
          unitPrice: 100,
          openingReading: 1000,
        },
      ],
      terminals: [],
      creditSales: [],
      omcSales: [],
      handover,
    },
  ],
});

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const renderPage = () =>
  render(
    <QueryClientProvider client={client()}>
      <NavProvider tabs={['home']}>
        <HandoverPage />
      </NavProvider>
    </QueryClientProvider>,
  );

const fillAndSave = async () => {
  await waitFor(() => expect(screen.getByLabelText(/N3 · Diesel/)).toBeDefined());
  fireEvent.change(screen.getByLabelText(/N3 · Diesel/), { target: { value: '1050' } });
  fireEvent.change(screen.getByLabelText(/^Cash \(₹\)/), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: /Save handover/i }));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
};

beforeEach(() => {
  mutateAsync
    .mockReset()
    .mockImplementation(({ payload }: { payload: unknown }) => Promise.resolve(echo(payload)));
  assignment.data = makeAssignment();
  assignment.isLoading = false;
});
afterEach(cleanup);

describe('HandoverPage', () => {
  it('names the Shift, the DU and when it started, with a Not saved badge', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Your handover' })).toBeTruthy();
    expect(screen.getByText(/^Shift 2 · DU2 · since \d{1,2}:\d{2} [ap]m$/)).toBeTruthy();
    expect(screen.getByText('Not saved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('shows Saved once the server holds the handover', () => {
    assignment.data = makeAssignment({ cashHandedOver: '5000', varianceAmount: '0' });
    renderPage();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.queryByText('Not saved')).toBeNull();
  });

  it('puts Save handover in the bottom action bar, with the running variance', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save handover/i })).toBeTruthy(),
    );
    const save = screen.getByRole('button', { name: /Save handover/i });
    const bar = save.closest('.border-dock-line') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(within(bar).getByText('Variance')).toBeTruthy();
    // The bar is the page's own, after the form, not a second bar inside it.
    expect(document.querySelectorAll('.border-dock-line')).toHaveLength(1);
    expect(bar.previousElementSibling?.contains(screen.getByLabelText(/N3 · Diesel/))).toBe(true);
  });

  it('sends exactly what the inline form sends', async () => {
    renderPage();
    await fillAndSave();
    const fromPage = mutateAsync.mock.calls[0][0].payload;
    expect(fromPage).toMatchObject({
      shiftId: 'shift-2',
      userId: 'u1',
      duId: 'du-2',
      cashHandedOver: 5000,
      nozzleReadings: [{ nozzleId: NOZZLE, closingReading: 1050, testingVolume: 0 }],
    });

    cleanup();
    mutateAsync.mockClear();
    render(
      <QueryClientProvider client={client()}>
        <HandoverPanel />
      </QueryClientProvider>,
    );
    await fillAndSave();
    expect(mutateAsync.mock.calls[0][0].payload).toEqual(fromPage);
  });

  it("has no bar while the assignment loads, and not the form's own sticky one either", () => {
    assignment.data = undefined;
    assignment.isLoading = true;
    renderPage();
    expect(screen.getByText(/Loading your shift/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save handover/i })).toBeNull();
    expect(document.querySelectorAll('.border-dock-line')).toHaveLength(0);
    expect(document.querySelector('.sticky')).toBeNull();
  });

  it('loses the bar, and does not fall back to a sticky one, once the Shift closes', async () => {
    const view = renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save handover/i })).toBeTruthy(),
    );
    assignment.data = null;
    view.rerender(
      <QueryClientProvider client={client()}>
        <NavProvider tabs={['home']}>
          <HandoverPage />
        </NavProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText(/No open shift assigned to you/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save handover/i })).toBeNull();
    expect(document.querySelectorAll('.border-dock-line')).toHaveLength(0);
    expect(document.querySelector('.sticky')).toBeNull();
  });

  it('a Shift with no Dispenser Unit of mine left has no Save, and no sticky bar of its own', () => {
    assignment.data = { ...makeAssignment(), dispenserUnits: [] };
    renderPage();
    expect(screen.queryByRole('button', { name: /Save handover/i })).toBeNull();
    expect(document.querySelectorAll('.border-dock-line')).toHaveLength(0);
    expect(screen.queryByText('Not saved')).toBeNull();
  });

  it('has no action bar, and no badge, when there is no assignment left', () => {
    assignment.data = null;
    renderPage();
    expect(screen.getByText(/No open shift assigned to you/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save handover/i })).toBeNull();
    expect(document.querySelectorAll('.border-dock-line')).toHaveLength(0);
    expect(screen.queryByText('Not saved')).toBeNull();
  });
});

/** The page as the shell holds it: pushed on a stack, so back goes through the history. */
const Stage: React.FC<{ shown?: boolean }> = ({ shown = true }) => {
  const nav = useNav();
  const top = nav.stacks.home?.at(-1);
  return top ? (
    <PageActiveContext.Provider value={shown}>{top.element}</PageActiveContext.Provider>
  ) : (
    <button type="button" onClick={() => nav.push(<HandoverPage />, 'handover')}>
      open handover
    </button>
  );
};

const openPushed = (shown = true) => {
  render(
    <QueryClientProvider client={client()}>
      <NavProvider tabs={['home']}>
        <Stage shown={shown} />
      </NavProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'open handover' }));
};
const type = async (value = '5000') => {
  await waitFor(() => expect(screen.getByLabelText(/^Cash \(₹\)/)).toBeDefined());
  fireEvent.change(screen.getByLabelText(/^Cash \(₹\)/), { target: { value } });
};
const onPage = () => screen.queryByRole('heading', { name: 'Your handover' });
const asking = () => screen.queryByRole('dialog', { name: 'Discard changes?' });

describe('HandoverPage back with unsaved edits', () => {
  it('leaves at once when nothing was typed', async () => {
    openPushed();
    await waitFor(() => expect(onPage()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(onPage()).toBeNull());
    expect(asking()).toBeNull();
  });

  it('the Back button asks before discarding typing; Keep editing stays with it', async () => {
    openPushed();
    await type();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(asking()).toBeTruthy());
    expect(onPage()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(asking()).toBeNull());
    expect((screen.getByLabelText(/^Cash \(₹\)/) as HTMLInputElement).value).toBe('5000');
  });

  it('Discard changes leaves the page', async () => {
    openPushed();
    await type();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(asking()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(onPage()).toBeNull());
    expect(screen.getByRole('button', { name: 'open handover' })).toBeTruthy();
  });

  it('the system back gesture asks too, keeps the page, and a second gesture means keep editing', async () => {
    openPushed();
    await type();
    window.history.back();
    await waitFor(() => expect(asking()).toBeTruthy());
    expect(onPage()).toBeTruthy();

    // The gesture consumed a history entry; the guard put it back, so back still works.
    window.history.back();
    await waitFor(() => expect(asking()).toBeNull());
    expect(onPage()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(asking()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(onPage()).toBeNull());
  });

  it('a page that is not the one on screen does not guard back', async () => {
    openPushed(false);
    await type();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(onPage()).toBeNull());
    expect(asking()).toBeNull();
  });

  it('after a save there is nothing to discard', async () => {
    openPushed();
    await type();
    fireEvent.change(screen.getByLabelText(/N3 · Diesel/), { target: { value: '1050' } });
    fireEvent.click(screen.getByRole('button', { name: /Save handover/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Saved at/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(onPage()).toBeNull());
    expect(asking()).toBeNull();
  });
});
