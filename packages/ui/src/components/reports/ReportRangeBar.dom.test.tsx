// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReportRangeBar } from './ReportRangeBar.js';

/**
 * #227: a report tab's methodology note is prose, and prose in the control row
 * stretches the bar and knocks the controls out of alignment. The note belongs
 * under the row — one pattern, every tab.
 */

const range = { from: '2026-03-01', to: '2026-03-31' };

describe('ReportRangeBar', () => {
  afterEach(cleanup);

  it('keeps the note out of the control row', () => {
    render(
      <ReportRangeBar
        value={range}
        onChange={vi.fn()}
        note="Closed shifts only."
        actions={<button type="button">Export</button>}
      />,
    );

    const note = screen.getByText('Closed shifts only.');
    const action = screen.getByRole('button', { name: 'Export' });

    // The note is a sibling of the control row, never inside it: no ancestor
    // of the action is an ancestor of the note short of the bar itself.
    const controlRow = action.parentElement!.parentElement!;
    expect(controlRow.contains(action)).toBe(true);
    expect(controlRow.contains(note)).toBe(false);
    expect(controlRow.nextElementSibling).toBe(note);
  });

  it('keeps the actions aligned with the range picker in one row', () => {
    render(
      <ReportRangeBar
        value={range}
        onChange={vi.fn()}
        actions={<button type="button">Export</button>}
      />,
    );

    const action = screen.getByRole('button', { name: 'Export' });
    // Actions sit in a bottom-aligned flex row, so a labelled select and the
    // range picker rest on the same baseline instead of centring against prose.
    const actionRow = action.parentElement!;
    expect(actionRow.style.alignItems).toBe('flex-end');
    expect(actionRow.style.flexWrap).toBe('wrap');
  });

  it('renders nothing extra when a tab has no note', () => {
    const { container } = render(<ReportRangeBar value={range} onChange={vi.fn()} />);

    expect(container.querySelector('p')).toBeNull();
  });
});
