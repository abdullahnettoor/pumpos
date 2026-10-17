// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilterChips, type FilterChipOption } from './FilterChips.js';

type F = 'all' | 'overdue' | 'over-limit' | 'paid';
const OPTIONS: FilterChipOption<F>[] = [
  { value: 'all', label: 'All', count: 8 },
  { value: 'overdue', label: 'Overdue', count: 3, status: 'overdue' },
  { value: 'over-limit', label: 'Over limit', count: 1, status: 'over-limit' },
  { value: 'paid', label: 'Paid up', count: 1 },
];

function Harness({ onChange }: { onChange?: (v: F) => void }) {
  const [v, setV] = useState<F>('all');
  return (
    <FilterChips
      aria-label="Customer status"
      options={OPTIONS}
      value={v}
      onChange={(next) => {
        setV(next);
        onChange?.(next);
      }}
    />
  );
}

describe('FilterChips', () => {
  afterEach(cleanup);

  it('shows each filter with its count, the count in its status tone', () => {
    render(<Harness />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([
      'All8',
      'Overdue3',
      'Over limit1',
      'Paid up1',
    ]);
    // The count is part of the name, set apart: "Overdue, 3", not "Overdue3".
    expect(screen.getByRole('radio', { name: 'Overdue, 3' })).toBeTruthy();
    expect(screen.getByText('3').dataset.tone).toBe('warning');
    expect(screen.getByText('3').className).toContain('text-warning-fg');
    expect(screen.getByText('8').dataset.tone).toBe('neutral');
    const overLimit = screen.getByRole('radio', { name: /Over limit/ });
    expect(overLimit.querySelector('[data-tone]')!.className).toContain('text-danger-fg');
  });

  it('keeps a zero count neutral: no problem, no colour', () => {
    render(
      <FilterChips
        aria-label="Customer status"
        options={[{ value: 'over-limit', label: 'Over limit', count: 0, status: 'over-limit' }]}
        value="over-limit"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('0').dataset.tone).toBe('neutral');
  });

  it('selects one filter at a time, applied on click', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Customer status' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Overdue/ }));
    expect(onChange).toHaveBeenCalledWith('overdue');
    expect(screen.getByRole('radio', { name: /Overdue/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: /All/ }).getAttribute('aria-checked')).toBe('false');
  });

  it('moves and selects with the arrow keys; only the selected chip is a tab stop', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const group = screen.getByRole('radiogroup');
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([0, -1, -1, -1]);
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('overdue');
    expect(document.activeElement?.textContent).toBe('Overdue3');
    fireEvent.keyDown(group, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('paid');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('all');
  });
});
