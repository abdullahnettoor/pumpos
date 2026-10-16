/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders.js';

const saveDecantation = vi.fn();
let dayState: 'OPEN' | 'CLOSED' = 'OPEN';

vi.mock('../../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudTransactionService: class {
    saveDecantation = saveDecantation;
  },
}));

const tanks = [
  { id: 't-ms', name: 'Tank 1', productId: 'p-ms', productName: 'MS', currentVolume: 8000 },
  { id: 't-hsd', name: 'Tank 2', productId: 'p-hsd', productName: 'HSD', currentVolume: 5000 },
  { id: 't-hsd2', name: 'Tank 3', productId: 'p-hsd', productName: 'HSD', currentVolume: 2000 },
];
const purchase = {
  purchaseId: 'pur-hsd',
  documentNumber: 'PUR-1',
  invoiceNumber: 'INV-77',
  supplierName: 'IOCL',
  entryDate: '2026-10-11',
  invoiceQty: 12000,
  invoiceDensity: 830,
  linkedDecantationCount: 0,
  awaitingDecantation: true,
};
vi.mock('../../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useInventoryStatus: () => ({ data: tanks }),
  useLinkablePurchases: (_s: string, ids: string[]) =>
    ids.map((id) => ({ data: id === 'p-hsd' ? [purchase] : [], isLoading: false })),
  useBusinessDayStatus: () => ({ data: { requestedState: dayState } }),
}));

const { DecantationDrawer } = await import('./DecantationDrawer.js');

const station = { id: 'st-1', settings: { timezone: 'Asia/Kolkata', densityToleranceKgM3: 3 } };
const onClose = vi.fn();
const open = () =>
  renderWithProviders(<DecantationDrawer isOpen station={station} onClose={onClose} />);

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const header = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const save = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

/** Tanker + one HSD line with a before dip. */
const fillBasics = () => {
  type('Tanker no.', 'KL-07-CB-4412');
  click('Continue to tanks');
  fireEvent.change(screen.getByLabelText('Tank, line 1'), { target: { value: 't-hsd' } });
  type('Before dip, line 1', '4000');
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T04:00:00.000Z'));
  saveDecantation.mockReset();
  dayState = 'OPEN';
  onClose.mockReset();
  saveDecantation.mockResolvedValue({ decantation: { flags: [] }, warnings: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DecantationDrawer stepper', () => {
  it('collapses a finished step into a compact card and expands it again on click', () => {
    open();
    type('Tanker no.', 'KL-07-CB-4412');
    type('Driver', 'Ravi');
    click('Continue to tanks');

    // Step 1 is collapsed: its inputs are gone, the recorded values show as a card.
    expect(screen.queryByLabelText('Tanker no.')).toBeNull();
    const card = screen.getByRole('region', { name: 'Tanker & invoices' });
    expect(within(card).getByText('KL-07-CB-4412')).toBeTruthy();
    expect(within(card).getByText('Ravi')).toBeTruthy();
    // ...and step 2 opened.
    expect(screen.getByRole('button', { name: /Add tank/ })).toBeTruthy();

    fireEvent.click(header('Tanker & invoices'));
    expect((screen.getByLabelText('Tanker no.') as HTMLInputElement).value).toBe('KL-07-CB-4412');
  });

  it('shows the chamber table only behind the Check tanker chambers checkbox', () => {
    open();
    fireEvent.click(header('Tanker chambers'));
    expect(screen.queryByRole('button', { name: /Add chamber/ })).toBeNull();

    fireEvent.click(screen.getByLabelText(/Check tanker chambers/));
    expect(screen.getByRole('button', { name: /Add chamber/ })).toBeTruthy();
    expect(screen.getByLabelText('Chamber 1 into tank')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chamber 1 OK' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chamber 1 Short' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chamber 1 Excess' })).toBeTruthy();
    expect(screen.getByLabelText('Chamber 1 seal OK')).toBeTruthy();
    expect(screen.getByLabelText('Chamber 1 emptied')).toBeTruthy();
    expect(screen.getByLabelText('Chamber 1 dip mm')).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Check tanker chambers/));
    expect(screen.queryByRole('button', { name: /Add chamber/ })).toBeNull();
  });

  it('keeps chamber inputs mounted while editing and toggles a dip mark', () => {
    open();
    fireEvent.click(header('Tanker chambers'));
    fireEvent.click(screen.getByLabelText(/Check tanker chambers/));
    const qty = screen.getByLabelText('Chamber 1 quantity') as HTMLInputElement;
    type('Chamber 1 quantity', '5000');
    click('Chamber 1 Short');
    // Same node: the grid did not remount (an operator typing would lose focus).
    expect(screen.getByLabelText('Chamber 1 quantity')).toBe(qty);
    expect(qty.value).toBe('5000');
    const short = screen.getByRole('button', { name: 'Chamber 1 Short' });
    expect(short.getAttribute('aria-pressed')).toBe('true');
    click('Chamber 1 Short');
    expect(short.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('DecantationDrawer save', () => {
  it('saves a clean visit and does not send chambers or links that were not set', async () => {
    open();
    fillBasics();
    expect(screen.getByRole('button', { name: 'Save decantation' })).toBeTruthy();
    await save('Save decantation');
    const [body, opts] = saveDecantation.mock.calls[0];
    expect(body).toMatchObject({
      stationId: 'st-1',
      tankerNumber: 'KL-07-CB-4412',
      chambersChecked: false,
      lines: [{ tankId: 't-hsd', beforeDip: 4000 }],
    });
    expect(body).not.toHaveProperty('draft');
    expect(body).not.toHaveProperty('links');
    expect(opts.idempotencyKey).toEqual(expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });

  it('flags a density out of tolerance live and saves with flag without blocking', async () => {
    open();
    type('Tanker no.', 'KL-07-CB-4412');
    // Pick the HSD invoice (density 830).
    fireEvent.click(screen.getByRole('button', { name: /INV-77/ }));
    click('Continue to tanks');
    fireEvent.change(screen.getByLabelText('Tank, line 1'), { target: { value: 't-hsd' } });
    type('Before dip, line 1', '4000');
    expect(screen.getByRole('button', { name: 'Save decantation' })).toBeTruthy();

    type('RO density, line 1', '836');
    expect(screen.queryByRole('button', { name: 'Save decantation' })).toBeNull();
    expect(screen.getByText(/RO density differs from invoice density/)).toBeTruthy();

    await save('Save with flag');
    const [body] = saveDecantation.mock.calls[0];
    expect(body.links).toEqual([{ productId: 'p-hsd', purchaseId: 'pur-hsd' }]);
    expect(body.lines[0]).toMatchObject({ roDensity: 836, invoiceDensity: 830 });
    expect(body.invoiceQuantity).toBe(12000);
    expect(body).not.toHaveProperty('draft');
  });

  it('saves as draft with only the tanker and a tank', async () => {
    open();
    type('Tanker no.', 'KL-07-CB-4412');
    click('Continue to tanks');
    fireEvent.change(screen.getByLabelText('Tank, line 1'), { target: { value: 't-hsd' } });
    type('Before dip, line 1', '4000');
    await save('Save as draft');
    expect(saveDecantation.mock.calls[0][0]).toMatchObject({ draft: true });
  });

  it('never sends a draft line without a before dip: says so on the field instead', async () => {
    open();
    type('Tanker no.', 'KL-07-CB-4412');
    click('Continue to tanks');
    fireEvent.change(screen.getByLabelText('Tank, line 1'), { target: { value: 't-hsd' } });
    await save('Save as draft');
    expect(saveDecantation).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Enter the before dip \(a tank line needs it even in a draft\)/),
    ).toBeTruthy();
  });

  it('names the missing tank on the field even for a draft', async () => {
    open();
    type('Tanker no.', 'KL-07-CB-4412');
    await save('Save as draft');
    expect(saveDecantation).not.toHaveBeenCalled();
    expect(screen.getByText(/Choose the tank/)).toBeTruthy();
  });

  it('asks for the before dip on a full save and opens the Tanks step', async () => {
    open();
    type('Tanker no.', 'KL-07-CB-4412');
    click('Continue to tanks');
    fireEvent.change(screen.getByLabelText('Tank, line 1'), { target: { value: 't-hsd' } });
    click('Continue to Tanker chambers');
    await save('Save decantation');
    expect(saveDecantation).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter the before dip/)).toBeTruthy();
  });

  it('keeps the drawer open and shows the refusal when the save fails', async () => {
    saveDecantation.mockRejectedValue(Object.assign(new Error('Tank not found'), { status: 404 }));
    open();
    fillBasics();
    await save('Save decantation');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Tank not found');
  });

  it('measures a line now: sends the after dip, time and sales during', async () => {
    open();
    fillBasics();
    fireEvent.click(header('After unloading'));
    fireEvent.click(screen.getByLabelText('Measure line 1 now'));
    type('After dip, line 1', '9000');
    type('After dip time, line 1', '15:10');
    type('Sales during, line 1', '50');
    expect(screen.getByText('5,050.00 L')).toBeTruthy();
    await save('Save decantation');
    expect(saveDecantation.mock.calls[0][0].lines[0]).toMatchObject({
      afterDip: 9000,
      salesDuring: 50,
      afterDipAt: '2026-10-11T09:40:00.000Z',
    });
  });
});

describe('DecantationDrawer on a sealed business day', () => {
  const decantation: any = {
    id: 'd-1',
    stationId: 'st-1',
    businessDayId: 'bd-1',
    businessDate: '2026-10-09',
    documentNumber: 'DEC-1',
    tankerNumber: 'KL-07-CB-4412',
    driverName: null,
    unloadStartedAt: null,
    unloadEndedAt: null,
    chambersChecked: false,
    status: 'PENDING_MEASUREMENT',
    flags: [],
    notes: null,
    createdAt: '2026-10-09T05:00:00.000Z',
    updatedAt: '2026-10-09T05:00:00.000Z',
    chambers: [],
    links: [],
    lines: [
      {
        id: 'l-1',
        tankId: 't-hsd',
        productId: 'p-hsd',
        beforeDip: 4000,
        beforeDipAt: null,
        observedDensity: null,
        observedTempC: null,
        roDensity: null,
        afterDip: null,
        afterDipAt: null,
        salesDuring: 0,
        receivedQty: null,
        status: 'PENDING_MEASUREMENT',
      },
    ],
  };

  it('opens only the After unloading step for edit, with a note, and surfaces server errors', async () => {
    dayState = 'CLOSED';
    saveDecantation.mockRejectedValue(
      new Error('Business day is closed; only an after dip can be added'),
    );
    renderWithProviders(
      <DecantationDrawer isOpen station={station} decantation={decantation} onClose={onClose} />,
    );
    expect(screen.getByRole('note').textContent).toContain('closed');
    // Other steps are read-only cards: their headers cannot be opened.
    expect((header('Tanker & invoices') as HTMLButtonElement).disabled).toBe(true);
    expect((header('Tanks') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save as draft' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Measure line 1 now'));
    type('After dip, line 1', '9000');
    await save('Save after dip');
    expect(saveDecantation.mock.calls[0][1]).toMatchObject({ decantationId: 'd-1' });
    expect(screen.getByRole('alert').textContent).toContain('only an after dip');
  });
});
