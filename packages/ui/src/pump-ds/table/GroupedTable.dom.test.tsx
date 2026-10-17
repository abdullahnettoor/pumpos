// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GroupedTable } from './GroupedTable.js';
import type { TableColumn } from './columns.js';

type Row = { id: string; nozzle: string; litres: number | null; value: number | null };

const columns: TableColumn<Row>[] = [
  { id: 'nozzle', header: 'Nozzle', kind: 'text', value: (r) => r.nozzle },
  { id: 'litres', header: 'Litres', kind: 'qty', unit: 'L', value: (r) => r.litres },
  { id: 'value', header: 'Value', kind: 'money', value: (r) => r.value },
];

afterEach(cleanup);

describe('GroupedTable', () => {
  const groups = [
    {
      key: 'du1',
      header: <span>DU1 · Ravi</span>,
      rows: [
        { id: 'n1', nozzle: 'N1', litres: 180.4, value: 18491 },
        { id: 'n2', nozzle: 'N2', litres: 300.25, value: 28283.55 },
      ],
    },
    {
      key: 'du2',
      header: <span>DU2 · Suresh</span>,
      muted: true,
      rows: [{ id: 'n3', nozzle: 'N3', litres: null, value: null }],
    },
  ];

  it('puts each group under its own full-width header row', () => {
    render(
      <GroupedTable label="Readings" columns={columns} groups={groups} rowKey={(r) => r.id} />,
    );
    const table = screen.getByRole('table', { name: 'Readings' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual([
      'Nozzle',
      'Litres',
      'Value',
      'DU1 · Ravi',
      'DU2 · Suresh',
    ]);
    expect(screen.getByText('DU1 · Ravi').closest('th')?.getAttribute('colspan')).toBe('3');
  });

  it('totals every group in one closing row, labelled as asked', () => {
    render(
      <GroupedTable
        columns={columns}
        groups={groups}
        rowKey={(r) => r.id}
        totalRow={{ label: 'Total excl. 1 pending' }}
      />,
    );
    const foot = screen.getByText('Total excl. 1 pending').closest('tr')!;
    expect(foot.textContent).toContain('480.65 L');
    expect(foot.textContent).toContain('₹46,774.55');
  });

  it('lets the label span the leading columns that add nothing up', () => {
    const withProduct: TableColumn<Row>[] = [
      columns[0],
      { id: 'product', header: 'Product', kind: 'text', value: () => 'Petrol' },
      ...columns.slice(1),
    ];
    render(<GroupedTable columns={withProduct} groups={groups} rowKey={(r) => r.id} totalRow />);
    const label = screen.getByText('Total').closest('th')!;
    expect(label.getAttribute('colspan')).toBe('2');
    expect(label.closest('tr')!.children).toHaveLength(3);
  });
});
