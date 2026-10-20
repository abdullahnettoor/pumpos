// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { InteractiveTable } from '../../pump-ds/index.js';
import { buildSupplierColumns, type SupplierRow } from './columns.js';

afterEach(cleanup);

const suppliers: SupplierRow[] = [
  {
    id: 's1',
    name: 'IOCL',
    isActive: true,
    currentBalance: '1200.00',
    metadata: { tradeName: 'IOCL', gstin: '32AAACI1681G1Z0' },
  },
  { id: 's2', name: 'HPCL', isActive: true, currentBalance: '-500.00', metadata: {} },
  { id: 's3', name: 'Old Lubes', isActive: false, currentBalance: '0', metadata: {} },
];

function renderList(onStatement = vi.fn(), onEdit = vi.fn()) {
  renderWithProviders(
    <InteractiveTable
      columns={buildSupplierColumns(onStatement, onEdit)}
      rows={suppliers}
      rowKey={(s) => s.id}
      totalRow
    />,
  );
  return { onStatement, onEdit };
}

describe('supplier balance list columns', () => {
  it('reads an advance as "Advance" with the amount unsigned, never a coloured negative', () => {
    renderList();
    const row = screen.getByText('HPCL').closest('tr')!;
    expect(within(row).getByText('Advance')).toBeTruthy();
    expect(within(row).getByText('₹500.00')).toBeTruthy();
    const cell = within(row).getByText('Advance').closest('td')!;
    expect(cell.textContent).not.toContain('−');
    expect(cell.innerHTML).not.toMatch(/(text|bg)-(success|danger|warning)/);
  });

  it('marks an inactive supplier with the grey "Inactive" chip, never "Suspended"', () => {
    renderList();
    const row = screen.getByText('Old Lubes').closest('tr')!;
    const chip = within(row).getByText('Inactive');
    expect(chip.closest('[data-tone]')?.getAttribute('data-tone') ?? 'neutral').toBe('neutral');
    expect(document.body.textContent).not.toContain('Suspended');
  });

  it('skips a trade name that repeats the name; shows the GSTIN once', () => {
    renderList();
    const row = screen.getAllByText('IOCL')[0].closest('tr')!;
    expect(within(row).getAllByText(/IOCL/)).toHaveLength(1);
    expect(within(row).getByText('GSTIN 32AAACI1681G1Z0')).toBeTruthy();
  });

  it('opens the statement from the name and edits from the row action', () => {
    const { onStatement, onEdit } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'HPCL' }));
    expect(onStatement).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Old Lubes' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 's3' }));
  });
});
