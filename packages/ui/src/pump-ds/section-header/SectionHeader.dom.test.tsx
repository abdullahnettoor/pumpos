// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SectionHeader } from './SectionHeader.js';

afterEach(cleanup);

describe('SectionHeader', () => {
  it('renders the title as a section heading with its context line', () => {
    render(<SectionHeader title="Forecourt" subtitle="Shift 2 · 6 DUs" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Forecourt' })).toBeTruthy();
    expect(screen.getByText('Shift 2 · 6 DUs')).toBeTruthy();
  });

  it('shows a right-aligned link only when given one', () => {
    const onClick = vi.fn();
    const { rerender } = render(<SectionHeader title="Money" />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<SectionHeader title="Money" action={{ label: 'Accounts', onClick }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accounts ›' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps the Dashboard column-header look (12px semibold uppercase muted)', () => {
    // Promoted from Dashboard ColumnHeader (#523) with no visual change: these
    // are the classes the Dashboard columns rendered before the move.
    render(
      <SectionHeader
        title="Fuels"
        subtitle="3 tanks"
        action={{ label: 'Inventory', onClick: () => {} }}
      />,
    );
    const heading = screen.getByRole('heading', { name: 'Fuels' });
    expect(heading.className).toBe(
      'text-[12px] font-semibold uppercase tracking-wide text-ink-muted',
    );
    expect(heading.parentElement?.className).toBe('flex items-baseline gap-2 px-0.5');
    expect(screen.getByText('3 tanks').className).toBe(
      'min-w-0 truncate text-[12px] text-ink-muted',
    );
    expect(screen.getByRole('button').className).toBe(
      'ml-auto shrink-0 text-[12px] font-medium text-brand hover:underline',
    );
  });
});

describe('SectionHeader controls (#567)', () => {
  it('renders a ControlBar at the right, after the title', () => {
    render(
      <SectionHeader
        title="Expense ledger"
        subtitle="7 entries"
        controls={{
          search: <input aria-label="Search" />,
          range: <button type="button">Range</button>,
        }}
      />,
    );
    const header = screen.getByTestId('section-header-expense-ledger');
    const bar = screen.getByTestId('control-bar');
    expect(header.contains(bar)).toBe(true);
    expect(header.lastElementChild).toBe(bar);
    expect(bar.className).toContain('ml-auto');
    // Fixed order regardless of prop order: range before search.
    expect(
      Array.from(bar.querySelectorAll('[data-slot]')).map((n) => n.getAttribute('data-slot')),
    ).toEqual(['range', 'search']);
  });
});
