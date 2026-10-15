// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders.js';
import { FLASH_MS, flashRows, useFlashingRows } from './rowFlash.js';
import { GroupedTable, InteractiveTable, type TableColumn } from '../pump-ds/index.js';

type Row = { id: string; name: string };
const columns: TableColumn<Row>[] = [
  { id: 'name', header: 'Name', kind: 'text', value: (r) => r.name },
];

const Probe: React.FC = () => <span>{[...useFlashingRows()].join(',') || 'none'}</span>;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('flashRows (#606)', () => {
  it('highlights the rows a save updated for a moment', () => {
    vi.useFakeTimers();
    render(<Probe />);
    act(() => flashRows(['r1', null, 'u1|du1']));
    expect(screen.getByText('r1,u1|du1')).toBeDefined();
    act(() => vi.advanceTimersByTime(FLASH_MS + 1));
    expect(screen.getByText('none')).toBeDefined();
  });
});

describe('tables tint the rows a save updated (#606)', () => {
  it('a flat table tints only the named row', () => {
    renderWithProviders(
      <InteractiveTable
        columns={columns}
        rows={[
          { id: 'a', name: 'Ravi' },
          { id: 'b', name: 'Meena' },
        ]}
        rowKey={(r) => r.id}
        flashRowIds={new Set(['b'])}
      />,
    );
    expect(screen.getByText('Meena').closest('tr')?.getAttribute('data-flash')).toBe('true');
    expect(screen.getByText('Ravi').closest('tr')?.getAttribute('data-flash')).toBeNull();
  });

  it('a grouped table tints the group header', () => {
    render(
      <GroupedTable
        label="Drawers"
        columns={columns}
        rowKey={(r) => r.id}
        groups={[{ key: 'g', header: 'DU1 · Ravi', rows: [], flash: true }]}
      />,
    );
    expect(screen.getByText('DU1 · Ravi').closest('tr')?.getAttribute('data-flash')).toBe('true');
  });
});
