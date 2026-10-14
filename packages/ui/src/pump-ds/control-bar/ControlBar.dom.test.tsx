// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ControlBar } from './ControlBar.js';

afterEach(cleanup);

const slotsOf = (el: Element) =>
  Array.from(el.querySelectorAll('[data-slot]')).map((n) => n.getAttribute('data-slot'));

describe('ControlBar', () => {
  it('lays the controls out as range · search · filters · (space) · export · info', () => {
    render(
      <ControlBar
        info={<span>i</span>}
        exportMenu={<span>Export</span>}
        filters={<span>Chips</span>}
        search={<span>Search</span>}
        range={<span>Range</span>}
      />,
    );
    const bar = screen.getByTestId('control-bar');
    expect(slotsOf(bar)).toEqual(['range', 'search', 'filters', 'exportMenu', 'info']);
    expect(bar.textContent).toBe('RangeSearchChipsExporti');
    // Export and info share the pushed-right end group, so they wrap together.
    const end = screen.getByText('Export').closest('[data-slot]')!.parentElement!;
    expect(end.className).toContain('ml-auto');
    expect(end.contains(screen.getByText('i'))).toBe(true);
    expect(bar.className).toContain('flex-wrap');
  });

  it('puts section actions in the end group, before export and info (#530)', () => {
    render(
      <ControlBar
        info={<span>i</span>}
        exportMenu={<span>Export</span>}
        actions={<button type="button">Add entry</button>}
        range={<span>Range</span>}
      />,
    );
    const bar = screen.getByTestId('control-bar');
    expect(slotsOf(bar)).toEqual(['range', 'actions', 'exportMenu', 'info']);
    const end = screen.getByText('Export').closest('[data-slot]')!.parentElement!;
    expect(end.contains(screen.getByRole('button', { name: 'Add entry' }))).toBe(true);
  });

  it('leaves out empty slots', () => {
    render(<ControlBar range={<span>Range</span>} filters={null} />);
    expect(slotsOf(screen.getByTestId('control-bar'))).toEqual(['range']);
  });
});
