/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { computeRange } from '../../pump-ds/index.js';
import { InventoryList } from '../InventoryList.js';

/**
 * Inventory on the shared modules (#536): Page Frame, the four owner-chosen
 * tiles, the Dashboard's tank gauge at the large size, layout B lists and
 * ledgers, Data Section per region, the status vocabulary.
 */

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};

const clock = { timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' };
const today = computeRange('today', clock).from;
const lastMonth = computeRange('last-month', clock).from;

const TANKS = [
  // 10% of 20 KL: critical at the default tank levels (25 / 40).
  {
    id: 't1',
    name: 'Tank 1',
    productId: 'p-ms',
    productName: 'Petrol',
    productCode: 'MS',
    productUnit: 'L',
    capacity: 20000,
    currentVolume: 2000,
    daysOfCover: 0.8,
  },
  // 115%: book stock over capacity.
  {
    id: 't2',
    name: 'Tank 2',
    productId: 'p-hsd',
    productName: 'Diesel',
    productCode: 'HSD',
    productUnit: 'L',
    capacity: 20000,
    currentVolume: 23000,
    waitingOnDecantation: true,
  },
  {
    id: 't3',
    name: 'Tank 3',
    productId: 'p-hsd',
    productName: 'Diesel',
    productCode: 'HSD',
    productUnit: 'L',
    capacity: 20000,
    currentVolume: 15000,
  },
];

const ITEMS = [
  {
    productId: 'i1',
    name: 'Engine oil 1L',
    code: 'EO1',
    productType: 'LUBRICANT',
    unit: 'Nos',
    quantity: 12,
  },
  {
    productId: 'i2',
    name: 'Coolant',
    code: 'CL',
    productType: 'LUBRICANT',
    unit: 'Nos',
    quantity: 0,
  },
  {
    productId: 'i3',
    name: 'Grease',
    code: 'GR',
    productType: 'LUBRICANT',
    unit: 'Nos',
    quantity: -2,
  },
];

const MOVEMENTS = [
  {
    id: 'm1',
    businessDate: today,
    productId: 'p-ms',
    productName: 'Petrol',
    productUnit: 'L',
    movementType: 'Sale',
    quantity: -500,
    referenceType: 'reading',
    tankName: 'Tank 1',
  },
  {
    id: 'm2',
    businessDate: today,
    productId: 'p-ms',
    productName: 'Petrol',
    productUnit: 'L',
    movementType: 'Decantation',
    quantity: 8000,
    referenceType: 'decantation_tank_line',
    tankName: 'Tank 1',
  },
  {
    id: 'm3',
    businessDate: lastMonth,
    productId: 'p-hsd',
    productName: 'Diesel',
    productUnit: 'L',
    movementType: 'Sale',
    quantity: -300,
    referenceType: 'reading',
    tankName: 'Tank 2',
  },
];

const VARIANCES = [
  {
    id: 'v1',
    businessDate: today,
    productId: 'p-ms',
    productName: 'Petrol',
    productUnit: 'L',
    tankName: 'Tank 1',
    expectedQuantity: 2100,
    actualQuantity: 2000,
    varianceQuantity: -100,
    reason: null,
  },
];

type Answer = { data: unknown } | 'fail';

function stubApi(answers: Record<string, Answer>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = Object.keys(answers)
      .sort((a, b) => b.length - a.length)
      .find((p) => url.includes(p));
    const answer = path ? answers[path] : { data: [] };
    if (answer === 'fail')
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INTERNAL', message: 'boom' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    return new Response(JSON.stringify({ success: true, data: answer.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const DATA: Record<string, Answer> = {
  '/transactions/inventory/status': { data: TANKS },
  '/transactions/inventory/items': { data: ITEMS },
  '/transactions/inventory/movements': { data: MOVEMENTS },
  '/transactions/inventory/variances': { data: VARIANCES },
};

const tileOf = (label: string) => {
  const tile = screen
    .getAllByText(label)
    .map((el) => el.parentElement?.parentElement)
    .find((t) => t?.querySelector('.kpi-value'));
  if (!tile) throw new Error(`no tile "${label}"`);
  return tile as HTMLElement;
};

const open = (answers = DATA) => {
  stubApi(answers);
  return renderWithProviders(<InventoryList selectedStation={station} userRole="Owner" />);
};

const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(name) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Inventory page (#536)', () => {
  it('is titled from the sidebar with one primary action', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Inventory' })).toBeTruthy();
    const primary = screen
      .getAllByRole('button')
      .filter((b) => b.className.includes('bg-brand') && !b.className.includes('bg-brand/'));
    expect(primary.map((b) => b.textContent)).toEqual(['Reconcile stock']);
  });

  it('shows exactly the four owner-chosen tiles, each "Now", coloured only for a problem', async () => {
    const { container } = open();
    await waitFor(() => expect(tileOf('Oversold').textContent).toContain('1'));
    const labels = [...container.querySelectorAll('.kpi-value')].map(
      (v) => v.parentElement!.firstElementChild!.firstElementChild!.textContent,
    );
    expect(labels).toEqual(['Fuel stock', 'Tanks low / critical', 'Out of stock', 'Oversold']);
    expect(tileOf('Fuel stock').textContent).toContain('40,000.00 L');
    expect(tileOf('Fuel stock').textContent).toContain('3 tanks');
    expect(tileOf('Fuel stock').dataset.alert).toBeUndefined();
    expect(tileOf('Tanks low / critical').dataset.alert).toBe('danger');
    expect(tileOf('Out of stock').dataset.alert).toBe('warning');
    expect(tileOf('Oversold').dataset.alert).toBe('danger');
    // Every tile is a balance at this moment: no period chip (#604).
    for (const label of ['Fuel stock', 'Tanks low / critical', 'Out of stock', 'Oversold'])
      expect(tileOf(label).textContent).not.toContain('Now');
    expect(screen.queryByText('Book stock over capacity')).toBeNull();
  });

  it('shows the stock tiles on the stock tabs only (owner decision)', async () => {
    const { container } = open();
    await waitFor(() => expect(tileOf('Oversold')).toBeTruthy());
    for (const name of ['Decantations', 'Density']) {
      tab(name);
      expect(container.querySelector('.kpi-value')).toBeNull();
    }
    for (const name of ['Product stock', 'Movements', 'Reconciliations', 'Tanks']) {
      tab(name);
      expect(container.querySelectorAll('.kpi-value').length).toBe(4);
    }
  });

  it('draws each tank with the Dashboard gauge at the large size, states as chips', async () => {
    open();
    const t1 = await screen.findByTestId('tank-t1');
    const gauge = t1.querySelector('[data-size]') as HTMLElement;
    expect(gauge.dataset.size).toBe('lg');
    expect(gauge.dataset.tone).toBe('critical');
    expect(within(t1).getByText('2,000 L').className).toContain('text-danger-fg');
    expect(within(t1).getByText('of 20,000 L · 10%')).toBeTruthy();
    // The gauge's own (screen-reader) word and the state chip agree.
    expect(within(t1).getAllByText('Critical').length).toBe(2);
    const t2 = screen.getByTestId('tank-t2');
    expect(within(t2).getByText('Over capacity')).toBeTruthy();
    expect(within(t2).getByText('Waiting on decantation')).toBeTruthy();
    // An ordinary tank carries no state chip.
    expect(within(screen.getByTestId('tank-t3')).queryByText('OK')).toBeNull();
  });

  it('filters tanks by status in the list header and totals what it shows', async () => {
    open();
    await screen.findByTestId('tank-t1');
    const header = screen.getByTestId('section-header-tanks');
    fireEvent.click(within(header).getByRole('radio', { name: 'Over capacity, 1' }));
    expect(screen.queryByTestId('tank-t1')).toBeNull();
    expect(screen.getByTestId('tank-t2')).toBeTruthy();
    expect(within(header).getByText('Total of 1 shown · 23,000.00 L')).toBeTruthy();
  });

  it('lists product stock with vocabulary chips and a total only when filtered', async () => {
    open();
    tab('Product stock');
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Oversold')).toBeTruthy();
    expect(within(table).getByText('Out of stock')).toBeTruthy();
    expect(within(table).queryByText(/^Total/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Oversold, 1' }));
    expect(within(screen.getByRole('table')).getByText('Total of 1 shown')).toBeTruthy();
    // The row and its total.
    expect(within(screen.getByRole('table')).getAllByText('−2 Nos').length).toBe(2);
  });

  it('puts the movements range in the ledger header; nets one product only', async () => {
    open();
    tab('Movements');
    const header = await screen.findByTestId('section-header-stock-movements');
    expect(within(header).getByRole('button', { name: /Movements period/ })).toBeTruthy();
    const table = await screen.findByRole('table');
    // This month: the two Petrol rows, signed, readable references.
    expect(within(table).getByText('+8,000.00 L')).toBeTruthy();
    expect(within(table).getByText('−500.00 L')).toBeTruthy();
    expect(within(table).getAllByText('Nozzle reading').length).toBe(1);
    // The reference never repeats the type beside it.
    expect(within(table).getAllByText('Decantation').length).toBe(1);
    expect(within(table).queryByText('decantation_tank_line')).toBeNull();
    expect(within(table).getByText('Net of 2 movements, Petrol')).toBeTruthy();
    // Under 5 products: counted chips, not a dropdown.
    const products = within(header).getByRole('radiogroup', { name: 'Product' });
    expect(
      within(products)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['All, 2', 'Diesel, 0', 'Petrol, 2']);
    expect(within(table).getByText('7,500.00 L')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('counts reconciliations in their own tab', async () => {
    open();
    tab('Reconciliations');
    const header = await screen.findByTestId('section-header-reconciliations');
    await waitFor(() => expect(within(header).getByText('1 reconciliation')).toBeTruthy());
    const table = screen.getByRole('table');
    const cell = within(table).getAllByText('−100.00 L')[0];
    expect(cell.className).toContain('text-danger-fg');
    // Body figures are regular weight; only the total row is set bold.
    expect(cell.className).not.toContain('font-semibold');
    expect(within(table).getByText('Short')).toBeTruthy();
  });

  it('closes the count drawer on the write, without waiting for the refetch (caching rule 6)', async () => {
    let saved = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST' && url.includes('/inventory/count')) {
          saved = true;
          return new Response(JSON.stringify({ success: true, data: { warnings: [] } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // After the save every refetch hangs: the drawer must not wait on it.
        if (saved) return new Promise<Response>(() => {});
        const path = Object.keys(DATA).find((p) => url.includes(p));
        const answer: Answer | undefined = path ? DATA[path] : undefined;
        const data = answer && answer !== 'fail' ? answer.data : [];
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    renderWithProviders(<InventoryList selectedStation={station} userRole="Owner" />);
    await screen.findByTestId('tank-t1');
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile stock' }));
    fireEvent.change(screen.getByPlaceholderText('Measured quantity'), {
      target: { value: '1990' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reconcile stock' }).at(-1)!);
    await waitFor(() => expect(saved).toBe(true));
    await waitFor(() => expect(screen.queryByPlaceholderText('Measured quantity')).toBeNull());
    // The save settled: a new count is not stuck behind the hanging refetch.
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile stock' }));
    const submit = screen.getAllByRole('button', { name: /Reconcile stock/ }).at(-1)!;
    await waitFor(() => expect(submit.getAttribute('aria-busy')).not.toBe('true'));
    expect(submit.querySelector('[class*="animate-spin"]')).toBeNull();
  });

  it('shows "Couldn\'t load" with Retry per region, and keeps the rest up', async () => {
    open({ ...DATA, '/transactions/inventory/status': 'fail' });
    expect(
      (await screen.findAllByText(/Couldn.t load (fuel stock|tank levels|tanks)/)).length,
    ).toBe(3);
    expect(screen.getAllByRole('button', { name: /Retry/ }).length).toBeGreaterThan(0);
    await waitFor(() => expect(tileOf('Oversold').textContent).toContain('1'));
  });
});
