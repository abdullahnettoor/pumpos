// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NozzleReadingsTable } from './NozzleReadingsTable.js';
import { BeforeCloseChecklist } from './BeforeCloseChecklist.js';
import { nozzleGroups, type CheckItem } from './liveShiftModel.js';

afterEach(cleanup);

const reading = (id: string, duId: string, product: string, opening: number, closing: number) => ({
  nozzleId: id,
  nozzleName: id.toUpperCase(),
  duId,
  duCode: duId.toUpperCase(),
  productId: `p-${product}`,
  productName: product,
  unit: 'L',
  openingReading: String(opening),
  closingReading: String(closing),
  unitPrice: '100.00',
});

const groups = nozzleGroups(
  {
    openedAt: '2026-10-14T08:30:00.000Z',
    nozzleReadings: [
      reading('n1', 'du1', 'Petrol', 0, 10),
      reading('n2', 'du1', 'Diesel', 0, 20),
      reading('n3', 'du2', 'Diesel', 0, 0),
    ],
    staffAssignments: [
      { userId: 'u1', userName: 'Ravi', duId: 'du1', duCode: 'DU1' },
      { userId: 'u2', userName: 'Suresh', duId: 'du2', duCode: 'DU2' },
    ],
    handovers: [{ userId: 'u1', duId: 'du1', varianceAmount: '0' }],
  },
  { now: Date.parse('2026-10-14T10:00:00.000Z') },
);

describe('NozzleReadingsTable', () => {
  it('opens the Handover of the drawer whose button is pressed', () => {
    const onOpen = vi.fn();
    render(<NozzleReadingsTable groups={groups} onOpenHandover={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record handover' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', duId: 'du2' }));
  });

  it('filters by product at once, and the total says how many it shows', () => {
    render(<NozzleReadingsTable groups={groups} onOpenHandover={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'Nozzle readings' });
    expect(within(table).getByText('Total excl. DU2, not handed over')).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: 'Diesel, 2' }));
    expect(within(table).queryByText('N1')).toBeNull();
    // N3 is DU2's, still out: shown, but not summed, and the label says so.
    const total = within(table)
      .getByText('Total of 2 shown excl. DU2, not handed over')
      .closest('tr')!;
    expect(total.textContent).toContain('20.00 L');
  });
});

describe('BeforeCloseChecklist', () => {
  const handover = { kind: 'handover' as const, groupKey: 'u2|du2', label: 'Record DU2 handover' };
  const items: CheckItem[] = [
    {
      id: 'readings',
      label: 'Closing readings',
      meta: '2 of 3',
      state: 'pending',
      action: handover,
    },
    { id: 'handovers', label: 'Handovers', meta: '1 of 2', state: 'pending', action: handover },
    { id: 'drops', label: 'Cash drops', meta: 'None', state: 'done', action: null },
    { id: 'variances', label: 'Variances', meta: 'None yet', state: 'pending', action: null },
    {
      id: 'office-count',
      label: 'Office cash count',
      meta: 'At close',
      state: 'pending',
      action: { kind: 'close', label: 'Count at close' },
    },
  ];

  it('links to each place once, and to the close flow only for who may close', () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <BeforeCloseChecklist items={items} onAction={onAction} canClose />,
    );
    expect(screen.getAllByRole('button', { name: 'Record DU2 handover' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Count at close' }));
    expect(onAction).toHaveBeenCalledWith({ kind: 'close', label: 'Count at close' });
    expect(screen.getByText('1 of 5 done')).toBeDefined();

    rerender(<BeforeCloseChecklist items={items} onAction={onAction} canClose={false} />);
    expect(screen.queryByRole('button', { name: 'Count at close' })).toBeNull();
  });
});
