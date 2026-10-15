// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  createTestQueryClient,
  muteExpectedConsoleErrors,
  renderWithProviders,
} from '../../test/renderWithProviders.js';
import { __resetNavIntentForTests } from '../../nav-intent/store.js';
import { closeQuickEntry, useQuickEntry } from '../../quick-entry/store.js';

/**
 * The Shifts page on the Page Frame (#533): Live shift layout B, the header
 * actions shared by every tab, and the idle state. The figures themselves are
 * pinned in liveShiftModel.test.ts; these pin what each role sees.
 */
vi.mock('../../hooks/useStationBusinessDate.js', () => ({
  useStationBusinessDate: () => '2026-10-14',
}));

const openShift = vi.fn();
const getShiftStatus = vi.fn();
const closeShift = vi.fn();
vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Base = actual.CloudShiftService as new () => object;
  return {
    ...actual,
    CloudShiftService: class extends Base {
      openShift = (...a: unknown[]) => openShift(...a);
      getShiftStatus = (...a: unknown[]) => getShiftStatus(...a);
      closeShift = (...a: unknown[]) => closeShift(...a);
    },
  };
});

const { ShiftsManagement } = await import('./ShiftsManagement.js');
const { queryKeys } = await import('../../query/hooks.js');

const STATION = {
  id: 'st-1',
  name: 'Kozhikode NH-66',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as never;

const reading = (id: string, duId: string, opening: number, closing: number) => ({
  nozzleId: id,
  nozzleName: id.toUpperCase(),
  duId,
  duCode: duId.toUpperCase(),
  productId: 'p-ms',
  productName: 'Petrol',
  unit: 'L',
  openingReading: String(opening),
  closingReading: String(closing),
  unitPrice: '100.00',
});

const activeShift = {
  id: 'sh-1',
  businessDayId: 'bd-1',
  businessDate: '2026-10-14',
  templateName: 'Evening',
  openedAt: '2026-10-14T08:30:00.000Z',
  openedByName: 'Anita',
  scheduledStartTime: '14:00',
  scheduledEndTime: '22:00',
  nozzleReadings: [reading('n1', 'du1', 100, 150), reading('n2', 'du2', 200, 200)],
  staffAssignments: [
    { userId: 'u1', userName: 'Ravi', duId: 'du1', duCode: 'DU1', openingFloat: '1000' },
    { userId: 'u2', userName: 'Suresh', duId: 'du2', duCode: 'DU2', openingFloat: '1000' },
  ],
  handovers: [
    {
      id: 'h1',
      userId: 'u1',
      duId: 'du1',
      cashHandedOver: '4000.00',
      cardHandedOver: '1120.00',
      upiHandedOver: '0',
      creditHandedOver: '0',
      varianceAmount: '120.00',
      cashDrops: '0',
      createdAt: '2026-10-14T14:00:00.000Z',
    },
  ],
  terminalLinks: [],
  merchandiseHandovers: [],
  merchandiseSales: [],
  reconciliation: { openingFloat: 2000, cashSales: 3000, handoverCashDrops: 0, drawers: [] },
};

const seed = (shift: unknown, lastShiftId = 'sh-0') => {
  const client = createTestQueryClient();
  client.setQueryData(queryKeys.shiftStatus('st-1', false), {
    activeShift: shift,
    lastShift: shift
      ? null
      : {
          id: lastShiftId,
          templateName: 'Morning',
          businessDate: '2026-10-14',
          shiftSequence: 1,
          closedAt: '2026-10-14T08:32:00.000Z',
          closedByName: 'Anita',
        },
    lastShiftSummary: { shiftId: 'sh-0', snapshotData: { cashVariance: 0 } },
    templates: [
      { id: 't1', name: 'Morning', startTime: '06:00', endTime: '14:00' },
      { id: 't2', name: 'Evening', startTime: '14:00', endTime: '22:00' },
    ],
    nozzles: [],
    staff: [],
    dispensers: [],
    terminals: [],
  });
  client.setQueryData(queryKeys.shiftTransactions('sh-1'), {});
  client.setQueryData(queryKeys.inventoryStatus('st-1'), []);
  client.setQueryData(queryKeys.dssrPreview('st-1', '2026-10-14'), null);
  client.setQueryData(queryKeys.businessDayStatus('st-1', '2026-10-14'), {
    requestedState: 'OPEN',
    openBusinessDays: [{ id: 'bd-1', businessDate: '2026-10-14' }],
  });
  client.setQueryData(queryKeys.merchandiseHandovers('sh-1'), []);
  client.setQueryData(queryKeys.merchandiseSales('sh-1'), []);
  return client;
};

const mount = (
  role: 'Owner' | 'Manager' | 'Staff' | 'Accountant',
  shift: unknown = activeShift,
) => {
  const client = seed(shift);
  return renderWithProviders(
    <ShiftsManagement
      selectedStation={STATION}
      userRole={role}
      userName="Anita"
      onNavigate={vi.fn()}
    />,
    { queryClient: client },
  );
};

let restoreConsole: () => void;
beforeEach(() => {
  openShift.mockReset();
  getShiftStatus.mockReset();
  closeShift.mockReset();
  sessionStorage.clear();
  // 17:30 IST on the shift's day: before its 22:00 scheduled end.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00.000Z'));
  __resetNavIntentForTests();
  closeQuickEntry();
  restoreConsole = muteExpectedConsoleErrors([/not wrapped in act/, /Warning:/]);
});
afterEach(() => {
  cleanup();
  restoreConsole();
  vi.useRealTimers();
});

describe('Shifts page frame (#533)', () => {
  it('titles the page Shifts with Live shift · Business days · History', () => {
    mount('Manager');
    expect(screen.getByRole('heading', { name: 'Shifts' })).toBeDefined();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs.join(' ')).toMatch(/Live shift.*Business days.*History/);
  });

  it('offers Record and Close shift as the one primary while a shift is open', () => {
    mount('Manager');
    expect(screen.getByRole('button', { name: /^Record$/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Close shift/ })).toBeDefined();
  });

  it('keeps the Product sale hotkey (M) on the Live shift tab', () => {
    mount('Manager');
    fireEvent.keyDown(window, { key: 'm' });
    // The quick-entry store is global: read it through a probe.
    const Probe = () => <span data-testid="qe">{useQuickEntry().type ?? ''}</span>;
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('qe').textContent).toBe('merchandise-sale');
  });

  it('hides Live shift and Close shift from an Accountant, as before', () => {
    mount('Accountant');
    expect(screen.queryByRole('tab', { name: /Live shift/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Close shift/ })).toBeNull();
  });
});

describe('Live shift, layout B', () => {
  it('shows the shift bar: Live, the scheduled end and the handover count', () => {
    mount('Manager');
    const bar = screen.getByTestId('live-shift-bar');
    expect(within(bar).getByText('Live')).toBeDefined();
    expect(bar.textContent).toMatch(/Scheduled end\s*10:00 pm/);
    expect(bar.textContent).toMatch(/Handovers\s*1 of 2/);
  });

  it('shows Staff the drawer variance tile and each drawer’s variance (owner decision)', () => {
    mount('Staff');
    const tile = screen.getByText('Drawer variance').closest('[data-alert]') as HTMLElement;
    expect(tile.getAttribute('data-alert')).toBe('warning');
    expect(tile.textContent).toContain('+₹120.00');
    const table = screen.getByRole('table', { name: 'Nozzle readings' });
    expect(within(table).getByText('+₹120.00')).toBeDefined();
  });

  it('says in the Sales hint what the fuel figure leaves out, in the total row’s words', () => {
    mount('Manager');
    const sales = screen.getByText('Sales').closest('[title]')!;
    expect(sales.textContent).toContain('Excl. DU2, not handed over · Fuel');
  });

  it('groups the readings by drawer, each with its handover button', () => {
    mount('Manager');
    const table = screen.getByRole('table', { name: 'Nozzle readings' });
    expect(within(table).getByText('DU1 · Ravi')).toBeDefined();
    expect(within(table).getByRole('button', { name: 'View handover' })).toBeDefined();
    expect(within(table).getByRole('button', { name: 'Record handover' })).toBeDefined();
    expect(within(table).getByText('Total excl. DU2, not handed over')).toBeDefined();
  });

  it('lists every attendant under Product sales, in GLOSSARY words', () => {
    mount('Manager');
    const section = screen.getByRole('region', { name: 'Product sales' });
    expect(within(section).getByText('Ravi')).toBeDefined();
    expect(within(section).getByText('Suresh')).toBeDefined();
    expect(section.textContent).not.toMatch(/merchandise/i);
  });

  it('lists the Before close checklist', () => {
    mount('Manager');
    const list = screen.getByRole('list', { name: 'Before close' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(list.textContent).toContain('1 of 2 recorded');
  });
});

describe('Live shift with no shift open', () => {
  it('says no shift is open and offers Open shift, which shows the form', () => {
    mount('Manager', null);
    expect(screen.getByText('No shift open')).toBeDefined();
    expect(
      screen.getByText(/Morning \(20261014-1\) closed 14 Oct 2026, 02:02 pm by Anita, balanced/),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /View last shift summary/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Open shift/ }));
    expect(screen.getByText('Shift details')).toBeDefined();
    // The form's own submit is the primary now; the header has none.
    expect(screen.queryByRole('button', { name: /^Open shift$/ })).toBeNull();
  });
});

describe('opening a shift (#533 review)', () => {
  it('sends an Idempotency-Key, and a retry after a lost answer reuses it', async () => {
    openShift
      .mockRejectedValueOnce(Object.assign(new Error('Network down'), { status: undefined }))
      .mockResolvedValueOnce({ id: 'sh-new' });
    getShiftStatus.mockResolvedValue({ activeShift: null, templates: [] });
    mount('Manager', null);
    fireEvent.click(screen.getByRole('button', { name: /Open shift/ }));
    const start = () => screen.getByRole('button', { name: /Start Shift Operations/ });
    await waitFor(() => expect((start() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start());
    await waitFor(() => expect(openShift).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((start() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start());
    await waitFor(() => expect(openShift).toHaveBeenCalledTimes(2));
    const [first, second] = openShift.mock.calls;
    expect(first[0]).toMatchObject({ stationId: 'st-1', businessDate: '2026-10-14' });
    expect(first[1].idempotencyKey).toEqual(expect.any(String));
    expect(second[1].idempotencyKey).toBe(first[1].idempotencyKey);
  });

  it('keeps the key for the form’s lifetime, so an edited retry is refused, not opened twice', async () => {
    openShift
      .mockRejectedValueOnce(Object.assign(new Error('Network down'), { status: undefined }))
      .mockResolvedValueOnce({ id: 'sh-new' });
    getShiftStatus.mockResolvedValue({ activeShift: null, templates: [] });
    mount('Manager', null);
    fireEvent.click(screen.getByRole('button', { name: /Open shift/ }));
    const start = () => screen.getByRole('button', { name: /Start Shift Operations/ });
    await waitFor(() => expect((start() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start());
    await waitFor(() => expect(openShift).toHaveBeenCalledTimes(1));

    // The answer was lost; the operator changes the template and tries again.
    fireEvent.change(screen.getByDisplayValue(/Morning · Scheduled/), { target: { value: 't2' } });
    await waitFor(() => expect((start() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start());
    await waitFor(() => expect(openShift).toHaveBeenCalledTimes(2));

    const [first, second] = openShift.mock.calls;
    expect(first[0].shiftTemplateId).toBe('t1');
    expect(second[0].shiftTemplateId).toBe('t2');
    expect(second[1].idempotencyKey).toBe(first[1].idempotencyKey);
  });

  it('reports the open at once and refreshes in the background', async () => {
    openShift.mockResolvedValueOnce({ id: 'sh-new' });
    // The refresh never answers: the screen must not wait on it.
    getShiftStatus.mockReturnValue(new Promise(() => {}));
    mount('Manager', null);
    fireEvent.click(screen.getByRole('button', { name: /Open shift/ }));
    const start = () => screen.getByRole('button', { name: /Start Shift Operations/ });
    await waitFor(() => expect((start() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start());
    expect(await screen.findByText('Shift opened.')).toBeDefined();
    expect(screen.queryByText('Shift details')).toBeNull();
    expect(screen.getByLabelText('Loading the new shift')).toBeDefined();
  });
});

describe('the last shift summary link', () => {
  it('sits in the live shift bar when a closed shift exists', () => {
    mount('Manager');
    const bar = screen.getByTestId('live-shift-bar');
    fireEvent.click(within(bar).getByRole('button', { name: /Last shift summary/ }));
    // The summary is a page of its own (#535): its back link leads to History.
    expect(screen.getByRole('link', { name: 'Back to History' })).toBeDefined();
    expect(screen.queryByRole('tab', { name: /History/ })).toBeNull();
  });
});

/** The page under a shell that keeps its route, as the desktop and console shells do. */
function Host(props: {
  initial: string;
  role?: 'Owner' | 'Manager' | 'Staff' | 'Accountant';
  onRoute: (path: string, options?: { replace?: boolean }) => void;
}) {
  const [route, setRoute] = useState(props.initial);
  return (
    <ShiftsManagement
      selectedStation={STATION}
      userRole={props.role ?? 'Manager'}
      userName="Anita"
      onNavigate={vi.fn()}
      route={route}
      onRouteChange={(next, options) => {
        const path = typeof next === 'function' ? next(route) : next;
        props.onRoute(path, options);
        setRoute(path);
      }}
    />
  );
}

const allHandedOver = {
  ...activeShift,
  handovers: [
    ...activeShift.handovers,
    {
      id: 'h2',
      userId: 'u2',
      duId: 'du2',
      cashHandedOver: '1000.00',
      cardHandedOver: '0',
      upiHandedOver: '0',
      creditHandedOver: '0',
      varianceAmount: '0',
      cashDrops: '0',
      createdAt: '2026-10-14T14:10:00.000Z',
    },
  ],
};

const host = (
  initial: string,
  opts: {
    role?: 'Owner' | 'Manager' | 'Staff' | 'Accountant';
    shift?: unknown;
    lastShiftId?: string;
    client?: ReturnType<typeof seed>;
  } = {},
) => {
  const onRoute = vi.fn();
  const view = renderWithProviders(<Host initial={initial} role={opts.role} onRoute={onRoute} />, {
    queryClient: opts.client ?? seed('shift' in opts ? opts.shift : activeShift, opts.lastShiftId),
  });
  return { ...view, onRoute };
};

describe('Close shift page (#534)', () => {
  it('Close shift opens the page at /shifts/<id>/close', () => {
    const { onRoute } = host('/shifts');
    fireEvent.click(screen.getByRole('button', { name: /^Close shift$/ }));
    expect(onRoute).toHaveBeenCalledWith('/shifts/sh-1/close', undefined);
    expect(screen.getByRole('heading', { name: 'Close Evening' })).toBeDefined();
  });

  it('keeps the step in the address, rewriting the entry as it moves', () => {
    const { onRoute } = host('/shifts/sh-1/close?step=cash');
    expect(screen.getByLabelText('Counted office cash (float + deposited)')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onRoute).toHaveBeenLastCalledWith('/shifts/sh-1/close?step=confirm', { replace: true });
    expect(screen.getByRole('region', { name: 'Shift summary' })).toBeDefined();
  });

  it('keeps the draft across a reload, and offers Continue close at its step', () => {
    const first = host('/shifts/sh-1/close?step=cash');
    fireEvent.change(screen.getByLabelText('Counted office cash (float + deposited)'), {
      target: { value: '4800' },
    });
    first.unmount();

    host('/shifts/sh-1/close?step=cash');
    expect(
      (screen.getByLabelText('Counted office cash (float + deposited)') as HTMLInputElement).value,
    ).toBe('4800');
    cleanup();

    const { onRoute } = host('/shifts');
    fireEvent.click(screen.getByRole('button', { name: /Continue close/ }));
    expect(onRoute).toHaveBeenCalledWith('/shifts/sh-1/close?step=cash', undefined);
  });

  it('opens a missing handover in the Handover drawer on top of the step', async () => {
    host('/shifts/sh-1/close?step=handovers');
    fireEvent.click(screen.getByRole('button', { name: /Record DU2 · Suresh handover/ }));
    expect(await screen.findByText('Handover · DU2 · Suresh')).toBeDefined();
    // The page and its step are still there underneath.
    expect(screen.getByRole('heading', { name: 'Close Evening' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Drawers' })).toBeDefined();
  });

  it('closes with an Idempotency-Key, reused on a retry after a lost answer, then shows the outcome', async () => {
    closeShift
      .mockRejectedValueOnce(Object.assign(new Error('Network down'), { status: undefined }))
      .mockResolvedValueOnce({
        shift: { id: 'sh-1', closedAt: '2026-10-14T16:30:00.000Z' },
        snapshot: { expectedDrawerCash: 3000, closingCash: 0, cashVariance: -3000 },
      });
    getShiftStatus.mockResolvedValue({
      activeShift: null,
      lastShift: { id: 'sh-1', templateName: 'Evening', businessDate: '2026-10-14' },
      templates: [],
    });
    const { onRoute } = host('/shifts/sh-1/close?step=confirm', { shift: allHandedOver });
    fireEvent.click(screen.getByLabelText(/I confirm these readings are correct/));
    const close = () => screen.getByRole('button', { name: /^Close shift$/ }) as HTMLButtonElement;
    fireEvent.click(close());
    await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(close().disabled).toBe(false));
    fireEvent.click(close());
    await waitFor(() => expect(closeShift).toHaveBeenCalledTimes(2));

    const [first, second] = closeShift.mock.calls;
    expect(first[0]).toBe('sh-1');
    expect(first[2].idempotencyKey).toEqual(expect.any(String));
    expect(second[2].idempotencyKey).toBe(first[2].idempotencyKey);
    expect(await screen.findByRole('heading', { name: 'Evening closed' })).toBeDefined();
    expect(onRoute).toHaveBeenCalledWith('/shifts/sh-1/close?step=done', { replace: true });
    expect(screen.getByRole('button', { name: /Open next shift/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /View shift summary/ })).toBeDefined();
    // The office cash is the close response's snapshot.
    const office = screen.getByRole('region', { name: 'Office cash' });
    expect(within(office).getByText('₹3,000.00')).toBeDefined();
  });

  it('keeps the closed state across a reload made before the status refreshes (#534 review)', async () => {
    closeShift.mockResolvedValueOnce({
      shift: { id: 'sh-1', closedAt: '2026-10-14T12:05:00.000Z' },
    });
    // The refresh never answers: the cached status still says sh-1 is open.
    getShiftStatus.mockReturnValue(new Promise(() => {}));
    const client = seed(allHandedOver);
    vi.setSystemTime(new Date('2026-10-14T12:05:00.000Z'));
    const first = host('/shifts/sh-1/close?step=confirm', { client });
    fireEvent.click(screen.getByLabelText(/I confirm these readings are correct/));
    fireEvent.click(screen.getByRole('button', { name: /^Close shift$/ }));
    expect(await screen.findByRole('heading', { name: 'Evening closed' })).toBeDefined();
    first.unmount();

    // Reload at the outcome's address, the cached (pre-close) status unchanged.
    host('/shifts/sh-1/close?step=done', { client });
    expect(screen.getByRole('heading', { name: 'Evening closed' })).toBeDefined();
    expect(sessionStorage.getItem('pumpos:closed-shift:st-1:sh-1')).not.toBeNull();
  });

  it('drops a draft once the shift is closed elsewhere, and starts clean on a reopen', () => {
    sessionStorage.setItem(
      'pumpos:close-draft:st-1:sh-1',
      JSON.stringify({
        step: 'cash',
        closingCash: 4800,
        closeDrops: [],
        recordDip: false,
        dipReadings: {},
        dipReasons: {},
        cashBreakdown: {},
      }),
    );
    // Closed in another tab: the status names no open shift.
    host('/shifts/sh-1/close?step=cash', { shift: null });
    expect(screen.getByText('This shift is not open')).toBeDefined();
    expect(sessionStorage.getItem('pumpos:close-draft:st-1:sh-1')).toBeNull();
    cleanup();

    // Reopened: the page starts from an empty count.
    host('/shifts/sh-1/close?step=cash');
    expect(
      (screen.getByLabelText('Counted office cash (float + deposited)') as HTMLInputElement).value,
    ).toBe('');
  });

  it('never shows a stored outcome for a shift that is open again', () => {
    sessionStorage.setItem(
      'pumpos:closed-shift:st-1:sh-1',
      JSON.stringify({
        expectedCash: 3000,
        closingCash: 3000,
        variance: 0,
        lastClosedShiftId: 'sh-1',
        nextTemplateId: 't1',
        businessDate: '2026-10-14',
        currentBusinessDate: '2026-10-14',
        openedAt: '2026-10-14T08:30:00.000Z',
        closedAt: '2026-10-14T16:30:00.000Z',
        shiftName: 'Evening',
        tankDips: [],
        closeStatus: 'closed',
      }),
    );
    // The status says sh-1 is open (reopened since).
    host('/shifts/sh-1/close?step=done');
    expect(screen.queryByRole('heading', { name: 'Evening closed' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Close Evening' })).toBeDefined();
    expect(sessionStorage.getItem('pumpos:closed-shift:st-1:sh-1')).toBeNull();
  });

  it('shows a stored outcome the status confirms, and discards one that does not match', () => {
    const outcome = {
      expectedCash: 3000,
      closingCash: 3000,
      variance: 0,
      lastClosedShiftId: 'sh-1',
      nextTemplateId: 't1',
      businessDate: '2026-10-14',
      currentBusinessDate: '2026-10-14',
      openedAt: '2026-10-14T08:30:00.000Z',
      closedAt: '2026-10-14T16:30:00.000Z',
      shiftName: 'Evening',
      tankDips: [],
      closeStatus: 'closed',
    };
    sessionStorage.setItem('pumpos:closed-shift:st-1:sh-1', JSON.stringify(outcome));
    host('/shifts/sh-1/close?step=done', { shift: null, lastShiftId: 'sh-1' });
    expect(screen.getByRole('heading', { name: 'Evening closed' })).toBeDefined();
    cleanup();

    // Only the id survived: not an outcome, so nothing renders from it.
    sessionStorage.setItem(
      'pumpos:closed-shift:st-1:sh-1',
      JSON.stringify({ lastClosedShiftId: 'sh-1' }),
    );
    host('/shifts/sh-1/close?step=done', { shift: null, lastShiftId: 'sh-1' });
    expect(screen.queryByRole('heading', { name: 'Evening closed' })).toBeNull();
    expect(screen.getByText('This shift is not open')).toBeDefined();
  });

  it('holds Next on Cash count until a negative count is fixed, and never stores it', async () => {
    host('/shifts/sh-1/close?step=cash');
    const count = screen.getByLabelText('Counted office cash (float + deposited)');
    const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    fireEvent.change(count, { target: { value: '-50' } });
    expect(await screen.findByText('Enter an amount of zero or more.')).toBeDefined();
    expect(next().disabled).toBe(true);
    expect(sessionStorage.getItem('pumpos:close-draft:st-1:sh-1') ?? '').not.toContain('-50');
    fireEvent.change(count, { target: { value: '50' } });
    await waitFor(() => expect(next().disabled).toBe(false));
  });

  it('tells an Accountant at the address that their role cannot close', () => {
    host('/shifts/sh-1/close', { role: 'Accountant' });
    expect(screen.getByText('Your role cannot close shifts')).toBeDefined();
  });

  it('says a shift that is not open is not open', () => {
    host('/shifts/sh-9/close');
    expect(screen.getByText('This shift is not open')).toBeDefined();
  });
});
