// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders as render } from '../../test/renderWithProviders.js';
import { InteractiveTable } from './InteractiveTable.js';
import { StatementTable } from '../statement-table/StatementTable.js';
import type { TableColumn } from './columns.js';

type Sale = {
  id: string;
  date: string;
  product: string;
  litres: number;
  rate: number;
  amount: number;
  status: 'paid' | 'unpaid';
};

const rows: Sale[] = [
  {
    id: 'a',
    date: '2026-07-09',
    product: 'Diesel',
    litres: 1240,
    rate: 92.5,
    amount: 114700,
    status: 'paid',
  },
  {
    id: 'b',
    date: '2026-07-10',
    product: 'Petrol',
    litres: 8.5,
    rate: 101,
    amount: 858.5,
    status: 'unpaid',
  },
];

/** One set of column definitions, rendered by both adapters below. */
const columns: TableColumn<Sale>[] = [
  { id: 'date', header: 'Date', kind: 'date', value: (r) => r.date },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product },
  { id: 'litres', header: 'Volume', kind: 'qty', unit: 'L', value: (r) => r.litres },
  { id: 'rate', header: 'Rate', kind: 'money', total: false, value: (r) => r.rate },
  { id: 'amount', header: 'Amount', kind: 'money', value: (r) => r.amount },
  { id: 'status', header: 'Status', kind: 'status', value: (r) => r.status },
];

const header = (name: string) => screen.getByRole('columnheader', { name });
const footerCells = () => {
  const foot = screen.getByRole('table').querySelector('tfoot');
  if (!foot) throw new Error('no total row');
  return Array.from(foot.querySelectorAll('th, td')).map((c) => c.textContent);
};
const isNumericCell = (el: HTMLElement) =>
  el.className.includes('text-right') && el.className.includes('font-mono');

afterEach(cleanup);

const adapters = {
  interactive: () =>
    render(<InteractiveTable columns={columns} rows={rows} rowKey={(r) => r.id} totalRow />),
  statement: () =>
    render(<StatementTable columns={columns} rows={rows} rowKey={(r) => r.id} totalRow />),
};

describe.each(Object.entries(adapters))('%s table: shared column kinds', (_name, renderTable) => {
  it('money and qty columns are right-aligned mono, header and body', () => {
    renderTable();
    for (const name of ['Volume', 'Rate', 'Amount']) expect(isNumericCell(header(name))).toBe(true);
    expect(isNumericCell(screen.getByText('₹1,14,700.00'))).toBe(true);
    expect(isNumericCell(screen.getByText('1,240.00 L'))).toBe(true);
    expect(header('Product').className).not.toContain('text-right');
    expect(header('Date').className).not.toContain('font-mono');
  });

  it('formats with the shared money, quantity and date formats', () => {
    renderTable();
    expect(screen.getByText('₹92.50')).toBeTruthy();
    expect(screen.getByText('8.50 L')).toBeTruthy();
    expect(screen.getByText('09 Jul 2026')).toBeTruthy();
  });

  it('status cells read the status vocabulary', () => {
    renderTable();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Unpaid')).toBeTruthy();
  });

  it('total row sums money and qty, skips a column marked total: false', () => {
    renderTable();
    expect(footerCells()).toEqual(['Total', '', '1,248.50 L', '', '₹1,15,558.50', '']);
  });
});

describe('total row', () => {
  it('prints a figure the caller passes instead of re-deriving it', () => {
    render(
      <StatementTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        totalRow={{ label: 'Day total', values: { amount: 200000 } }}
      />,
    );
    expect(footerCells()).toEqual(['Day total', '', '1,248.50 L', '', '₹2,00,000.00', '']);
  });

  it('sums a qty column only when every row shares a unit', () => {
    const mixed: TableColumn<{ q: number; u: string }>[] = [
      { id: 'label', header: 'Item', kind: 'text', value: () => 'x' },
      { id: 'q', header: 'Qty', kind: 'qty', unit: (r) => r.u, value: (r) => r.q },
    ];
    render(
      <StatementTable
        columns={mixed}
        rows={[
          { q: 2, u: 'L' },
          { q: 3, u: 'Nos' },
        ]}
        rowKey={(_r, i) => String(i)}
        totalRow
      />,
    );
    expect(footerCells()).toEqual(['Total', '—']);
  });

  it('no total row unless asked', () => {
    render(<InteractiveTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole('table').querySelector('tfoot')).toBeNull();
  });
});

describe('interactive adapter', () => {
  it('sorts a money column by value, not by its text', () => {
    render(
      <InteractiveTable
        columns={columns}
        rows={[...rows, { ...rows[0], id: 'c', amount: 9000 }]}
        rowKey={(r) => r.id}
      />,
    );
    fireEvent.click(header('Amount'));
    const amounts = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[4].textContent);
    expect(amounts).toEqual(['₹858.50', '₹9,000.00', '₹1,14,700.00']);
  });

  it('opens a row on click', () => {
    const onRowClick = vi.fn();
    render(
      <InteractiveTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(screen.getByText('Petrol'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it('loading and error come from the Data Section, never the empty message', () => {
    render(
      <InteractiveTable
        columns={columns}
        rows={undefined}
        rowKey={(r) => r.id}
        error={new Error('boom')}
        title="Sales"
        emptyMessage="No sales."
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load sales/);
    expect(screen.queryByText('No sales.')).toBeNull();
  });
});

describe('statement adapter', () => {
  it('is read-only: no sortable header', () => {
    render(<StatementTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    fireEvent.click(header('Amount'));
    const first = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[1];
    expect(first.textContent).toBe('Diesel');
  });

  it('a cell override keeps the kind’s alignment', () => {
    render(
      <StatementTable
        columns={[
          { id: 'p', header: 'Product', kind: 'text', value: (r: Sale) => r.product },
          {
            id: 'amt',
            header: 'Amount',
            kind: 'money',
            value: (r: Sale) => r.amount,
            cell: () => 'n/a',
          },
        ]}
        rows={rows.slice(0, 1)}
        rowKey={(r) => r.id}
      />,
    );
    expect(isNumericCell(screen.getByText('n/a'))).toBe(true);
  });
});
