// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders as render } from '../../test/renderWithProviders.js';
import { InteractiveTable } from './InteractiveTable.js';
import { StatementTable } from '../statement-table/StatementTable.js';
import { cellText, totalTexts, type TableColumn } from './columns.js';

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
  it('money and qty cells are right-aligned mono; their headers are right-aligned only', () => {
    renderTable();
    for (const name of ['Volume', 'Rate', 'Amount']) {
      expect(header(name).className).toContain('text-right');
      expect(header(name).className).not.toContain('font-mono');
    }
    expect(isNumericCell(screen.getByText('₹1,14,700.00'))).toBe(true);
    expect(isNumericCell(screen.getByText('1,240.00 L'))).toBe(true);
    expect(header('Product').className).not.toContain('text-right');
  });

  it('every header reads the same: 10px uppercase, weight 500, faint sans', () => {
    renderTable();
    for (const name of ['Date', 'Product', 'Volume', 'Rate', 'Amount', 'Status']) {
      const th = header(name);
      for (const cls of ['text-[10px]', 'uppercase', 'font-medium', 'text-ink-faint']) {
        expect(th.className.split(' ')).toContain(cls);
      }
      expect(th.className).not.toContain('font-semibold');
      expect(th.getAttribute('style') ?? '').not.toMatch(/font-weight|font-size|color/);
    }
  });

  it('a money body cell is regular weight; only the total row is semibold', () => {
    renderTable();
    expect(screen.getByText('₹1,14,700.00').className).not.toContain('font-semibold');
    const foot = screen.getByRole('table').querySelector('tfoot tr') as HTMLElement;
    expect(foot.className).toContain('font-semibold');
  });

  it('a date reads in the sans face, as the Dashboard prints its times', () => {
    renderTable();
    const date = screen.getByText('09 Jul 2026');
    expect(date.className).toContain('text-left');
    expect(date.className).not.toContain('font-mono');
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
  it('renders a total cell the caller supplies, while the PDF text keeps the figure', () => {
    const totalRow = {
      label: 'Total',
      values: { amount: -340 },
      derive: false,
      cells: { amount: <span data-testid="chip">−₹340.00 chip</span> },
    };
    render(
      <InteractiveTable columns={columns} rows={rows} rowKey={(r) => r.id} totalRow={totalRow} />,
    );
    expect(screen.getByTestId('chip').textContent).toBe('−₹340.00 chip');
    expect(totalTexts(columns, rows, totalRow)?.cells[4]).toBe('−₹340.00');
  });

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

  it('a passed figure on a mixed-unit qty column still totals —', () => {
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
        totalRow={{ values: { q: 5 } }}
      />,
    );
    expect(footerCells()).toEqual(['Total', '—']);
  });

  it('a passed figure takes the unit every row shares', () => {
    const perRow: TableColumn<{ q: number; u: string }>[] = [
      { id: 'label', header: 'Item', kind: 'text', value: () => 'x' },
      { id: 'q', header: 'Qty', kind: 'qty', unit: (r) => r.u, value: (r) => r.q },
    ];
    render(
      <StatementTable
        columns={perRow}
        rows={[
          { q: 2, u: 'kg' },
          { q: 3, u: 'kg' },
        ]}
        rowKey={(_r, i) => String(i)}
        totalRow={{ values: { q: 7 } }}
      />,
    );
    expect(footerCells()).toEqual(['Total', '7.00 kg']);
  });

  it('a total with a broken figure behind it prints —, not a sum that counted it as 0', () => {
    const broken: TableColumn<{ a: number }>[] = [
      { id: 'label', header: 'Item', kind: 'text', value: () => 'x' },
      { id: 'a', header: 'Amount', kind: 'money', value: (r) => r.a },
      { id: 'q', header: 'Qty', kind: 'qty', unit: 'L', value: (r) => r.a },
    ];
    render(
      <StatementTable
        columns={broken}
        rows={[{ a: 50 }, { a: Number.NaN }]}
        rowKey={(_r, i) => String(i)}
        totalRow
      />,
    );
    expect(footerCells()).toEqual(['Total', '—', '—']);
  });

  it('sums money in paise, so the total is the sum of the figures shown', () => {
    const money: TableColumn<{ a: number }>[] = [
      { id: 'label', header: 'Item', kind: 'text', value: () => 'x' },
      { id: 'a', header: 'Amount', kind: 'money', value: (r) => r.a },
    ];
    render(
      <StatementTable
        columns={money}
        rows={[{ a: 0.004 }, { a: 0.004 }, { a: 0.004 }]}
        rowKey={(_r, i) => String(i)}
        totalRow
      />,
    );
    // Each row shows ₹0.00; a float sum (0.012) would print ₹0.01.
    expect(footerCells()).toEqual(['Total', '₹0.00']);
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

  it('sorts an empty value last, whichever way the column sorts', () => {
    type Entry = { id: string; amount: number | null };
    const cols: TableColumn<Entry>[] = [
      { id: 'id', header: 'Entry', kind: 'text', value: (r) => r.id },
      { id: 'amount', header: 'Amount', kind: 'money', value: (r) => r.amount },
      { id: 'note', header: 'Note', kind: 'text', value: (r) => (r.amount == null ? null : r.id) },
    ];
    render(
      <InteractiveTable
        columns={cols}
        rows={[
          { id: 'a', amount: 30 },
          { id: 'b', amount: null },
          { id: 'c', amount: -10 },
        ]}
        rowKey={(r) => r.id}
      />,
    );
    const order = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => within(r).getAllByRole('cell')[0].textContent);
    // The sorted header gains an arrow, so match its start.
    const sortBy = (name: string) =>
      fireEvent.click(screen.getByRole('columnheader', { name: new RegExp(`^${name}`) }));
    sortBy('Amount');
    expect(order()).toEqual(['c', 'a', 'b']);
    sortBy('Amount');
    expect(order()).toEqual(['a', 'c', 'b']);
    sortBy('Note');
    expect(order()).toEqual(['a', 'c', 'b']);
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

describe('money cells', () => {
  it('a money cell with no value is blank, not ₹0.00', () => {
    type Entry = { id: string; dir: 'in' | 'out'; amount: number };
    const money: TableColumn<Entry>[] = [
      { id: 'id', header: 'Entry', kind: 'text', value: (r) => r.id },
      {
        id: 'in',
        header: 'In',
        kind: 'money',
        value: (r) => (r.dir === 'in' ? r.amount : null),
      },
    ];
    render(
      <StatementTable
        columns={money}
        rows={[
          { id: 'a', dir: 'in', amount: 50 },
          { id: 'b', dir: 'out', amount: 20 },
        ]}
        rowKey={(r) => r.id}
        totalRow
      />,
    );
    const cells = screen
      .getAllByRole('row')
      .slice(1, 3)
      .map((r) => within(r).getAllByRole('cell')[1].textContent);
    expect(cells).toEqual(['₹50.00', '']);
    expect(footerCells()).toEqual(['Total', '₹50.00']);
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

describe('plain text, as a PDF prints the table (#580)', () => {
  it('reads each cell as the screen shows it, a status as its word', () => {
    render(<StatementTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const shown = Array.from(screen.getAllByRole('row')[1].querySelectorAll('td')).map(
      (c) => c.textContent,
    );
    expect(columns.map((col) => cellText(col, rows[0]))).toEqual(shown);
    expect(cellText(columns[5], rows[1])).toBe('Unpaid');
  });

  it('a column with its own cell prints its text; text alone is the cell', () => {
    const col: TableColumn<Sale> = {
      id: 'v',
      header: 'Variance',
      kind: 'money',
      value: (r) => r.amount,
      text: (r) => `+${r.amount}`,
      cell: (r) => <b>+{r.amount}</b>,
    };
    expect(cellText(col, rows[0])).toBe('+114700');
    render(
      <StatementTable
        columns={[{ ...col, cell: undefined }]}
        rows={rows.slice(0, 1)}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByText('+114700')).toBeTruthy();
  });

  it('reads the total row as the screen prints it, label first', () => {
    render(<StatementTable columns={columns} rows={rows} rowKey={(r) => r.id} totalRow />);
    expect(totalTexts(columns, rows, true)).toEqual({
      cells: footerCells().map((c) => c ?? ''),
      labelled: true,
    });
    expect(totalTexts(columns, rows, undefined)).toBeNull();
  });
});

describe('a stored total row (derive: false)', () => {
  it('prints only the figures it is given: a missing one is blank, null is —, nothing is summed', () => {
    expect(
      totalTexts(columns, rows, {
        values: { litres: null, amount: 100000 },
        derive: false,
      })?.cells,
    ).toEqual(['Total', '', '—', '', '₹1,00,000.00', '']);
  });

  it('a qty figure takes the unit it is given, not the rows’ own', () => {
    expect(
      totalTexts(columns, rows, {
        values: { litres: 12.5 },
        units: { litres: 'kg' },
        derive: false,
      })?.cells[2],
    ).toBe('12.50 kg');
  });
});
