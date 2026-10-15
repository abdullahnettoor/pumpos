// @vitest-environment jsdom
import React from 'react';
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
vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Base = actual.CloudShiftService as new () => object;
  return {
    ...actual,
    CloudShiftService: class extends Base {
      openShift = (...a: unknown[]) => openShift(...a);
      getShiftStatus = (...a: unknown[]) => getShiftStatus(...a);
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

const mount = (
  role: 'Owner' | 'Manager' | 'Staff' | 'Accountant',
  shift: unknown = activeShift,
) => {
  const client = createTestQueryClient();
  client.setQueryData(queryKeys.shiftStatus('st-1', false), {
    activeShift: shift,
    lastShift: shift
      ? null
      : {
          id: 'sh-0',
          templateName: 'Morning',
          businessDate: '2026-10-14',
          shiftSequence: 1,
          closedAt: '2026-10-14T08:32:00.000Z',
          closedByName: 'Anita',
        },
    lastShiftSummary: { shiftId: 'sh-0', snapshotData: { cashVariance: 0 } },
    templates: [{ id: 't1', name: 'Morning', startTime: '06:00', endTime: '14:00' }],
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

  it('groups the readings by drawer, each with its handover button', () => {
    mount('Manager');
    const table = screen.getByRole('table', { name: 'Nozzle readings' });
    expect(within(table).getByText('DU1 · Ravi')).toBeDefined();
    expect(within(table).getByRole('button', { name: 'View handover' })).toBeDefined();
    expect(within(table).getByRole('button', { name: 'Record handover' })).toBeDefined();
    expect(within(table).getByText('Total excl. DU2')).toBeDefined();
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
});

describe('the last shift summary link', () => {
  it('sits in the live shift bar when a closed shift exists', () => {
    mount('Manager');
    const bar = screen.getByTestId('live-shift-bar');
    fireEvent.click(within(bar).getByRole('button', { name: /Last shift summary/ }));
    expect(screen.getByRole('tab', { name: /History/ }).getAttribute('aria-selected')).toBe('true');
  });
});
