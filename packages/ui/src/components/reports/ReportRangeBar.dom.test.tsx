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

    // The row that holds the controls must not hold the prose — that is the
    // bug: a sentence in the row stretches it and misaligns the controls.
    const controlRow = action.parentElement!.parentElement!;
    expect(controlRow.contains(note)).toBe(false);
    expect(controlRow.nextElementSibling).toBe(note);
  });

  it('puts the actions in the same row as the range picker', () => {
    render(
      <ReportRangeBar
        value={range}
        onChange={vi.fn()}
        note="Closed shifts only."
        actions={<button type="button">Export</button>}
      />,
    );

    const action = screen.getByRole('button', { name: 'Export' });
    const controlRow = action.parentElement!.parentElement!;

    // The range picker's own inputs live in that row too, so the two clusters
    // are siblings and can align — rather than the actions being pushed into
    // a cluster shared with the note, as they were.
    expect(controlRow.querySelectorAll('input').length).toBeGreaterThan(0);
  });

  it('renders no caption at all when a tab has no note', () => {
    render(<ReportRangeBar value={range} onChange={vi.fn()} note={undefined} />);

    expect(screen.queryByText(/only/)).toBeNull();
  });
});
