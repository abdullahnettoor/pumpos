// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@tanstack/react-table';
import { renderWithProviders as render } from '../../test/renderWithProviders.js';
import { DataTable } from './DataTable.js';

type Row = { name: string };
const columns: ColumnDef<Row, any>[] = [{ accessorKey: 'name', header: 'Name' }];

afterEach(cleanup);

describe('DataTable states', () => {
  it('loading: a skeleton, no rows', () => {
    render(<DataTable columns={columns} data={undefined} isLoading title="Expenses" />);
    expect(screen.getByLabelText('Loading expenses')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('error: "Couldn\'t load <title> · Retry", Retry calls onRetry, never the empty message', () => {
    const onRetry = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[]}
        error={new Error('boom')}
        onRetry={onRetry}
        title="Expenses"
        emptyMessage="No expenses."
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load expenses ·/);
    expect(screen.queryByText('No expenses.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error without onRetry: message only, defaulting the title to "records"', () => {
    render(<DataTable columns={columns} data={undefined} error={new Error('boom')} />);
    expect(screen.getByText(/Couldn't load records/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('success + empty: the empty message', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="No expenses." />);
    expect(screen.getByText('No expenses.')).toBeTruthy();
  });

  it('success + data: the rows', () => {
    render(<DataTable columns={columns} data={[{ name: 'Diesel' }]} />);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Diesel')).toBeTruthy();
  });
});
