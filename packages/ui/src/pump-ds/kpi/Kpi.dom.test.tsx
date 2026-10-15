// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KpiStrip } from './KpiStrip.js';
import { KpiTile } from './KpiTile.js';
import { formatKpiScope, kpiTileChip, sharedKpiScope } from './scope.js';

const COLOUR = /(?:^|\s)(?:text|bg|border|shadow)-[^\s]*(?:warning|danger|success|info|brand)/;

describe('KpiTile', () => {
  afterEach(cleanup);

  it('shows a 12px sentence-case label with its period chip', () => {
    render(<KpiTile label="Spent this month" scope={{ month: '2026-10-14' }} value="₹31,475.00" />);
    const label = screen.getByText('Spent this month');
    const row = label.parentElement!;
    expect(row.className).toContain('text-[12px]');
    expect(row.className).not.toContain('uppercase');
    expect(screen.getByText('Oct').className).toContain('text-[12px]');
  });

  it('formats every period through the shared words', () => {
    expect(formatKpiScope('today')).toBe('Today');
    expect(formatKpiScope('in-range')).toBe('In range');
    expect(formatKpiScope('now')).toBe('Now');
    expect(formatKpiScope('this-shift')).toBe('This shift');
    expect(formatKpiScope({ day: '2026-10-14' })).toBe('14 Oct');
    expect(formatKpiScope({ month: '2026-10' })).toBe('Oct');
    // One locale-free month table: never ICU's "Sept".
    expect(formatKpiScope({ month: '2026-09-30' })).toBe('Sep');
  });

  it('never labels a balance: `now` shows no chip (#604)', () => {
    render(<KpiTile label="Receivable" scope="now" value="₹3,82,711.00" />);
    expect(screen.queryByText('Now')).toBeNull();
  });

  it('labels a tile only when its strip does not already name the period (#604)', () => {
    expect(kpiTileChip(undefined)).toBeNull();
    expect(kpiTileChip('now')).toBeNull();
    expect(kpiTileChip('today')).toBe('Today');
    expect(kpiTileChip('today', 'today')).toBeNull();
    expect(kpiTileChip({ month: '2026-10-14' }, { month: '2026-10' })).toBeNull();
    expect(kpiTileChip({ month: '2026-10' }, 'today')).toBe('Oct');
  });

  it('finds the one period a strip shares, or none when tiles differ (#604)', () => {
    expect(sharedKpiScope(['today', 'today', 'today'])).toBe('today');
    expect(sharedKpiScope([{ month: '2026-10-01' }, { month: '2026-10' }])).toEqual({
      month: '2026-10-01',
    });
    expect(sharedKpiScope(['today', { month: '2026-10' }])).toBeNull();
    // A balance has no period, so a strip holding one names nothing.
    expect(sharedKpiScope(['now', 'now'])).toBeNull();
    expect(sharedKpiScope([{ month: '2026-10' }, 'now'])).toBeNull();
    expect(sharedKpiScope([])).toBeNull();
  });

  it('has no colour without alert: the value is plain ink', () => {
    const { container } = render(<KpiTile label="Receivable" scope="now" value="₹3,82,711.00" />);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.className).not.toMatch(COLOUR);
    expect(screen.getByText('₹3,82,711.00').className).toContain('text-ink-strong');
    for (const el of Array.from(tile.querySelectorAll('*'))) {
      expect((el as HTMLElement).className || '').not.toMatch(COLOUR);
    }
  });

  it('colours the left edge and the value for an alert', () => {
    const { container } = render(
      <KpiTile label="Overdue" scope="now" alert="warning" value="₹1,08,750.00" />,
    );
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.dataset.alert).toBe('warning');
    expect(tile.className).toContain('shadow-[inset_3px_0_0_var(--color-warning-fg)]');
    expect(screen.getByText('₹1,08,750.00').className).toContain('text-warning-fg');

    cleanup();
    render(<KpiTile label="Net profit" alert="danger" value="−₹4,200.00" />);
    expect(screen.getByText('−₹4,200.00').className).toContain('text-danger-fg');
  });

  it('keeps a neutral delta neutral (spend going up is not bad news)', () => {
    render(
      <KpiTile
        label="Spent"
        scope="in-range"
        value="₹31,475.00"
        delta={{ value: '8%', direction: 'up', neutral: true }}
        hint="vs Sep, same days"
      />,
    );
    const delta = screen.getByText('8%').parentElement!;
    expect(delta.className).toContain('text-ink-muted');
    expect(delta.className).not.toContain('success');
    expect(screen.getByText('vs Sep, same days')).toBeTruthy();
  });
});

describe('KpiStrip', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const tiles = (n: number) =>
    Array.from({ length: n }, (_, i) => <KpiTile key={i} label={`Tile ${i}`} value={String(i)} />);

  it('names a shared period once above the strip; tiles drop the repeat (#604)', () => {
    render(
      <KpiStrip scope="today" aria-label="Today's figures">
        <KpiTile label="Fuel sold" scope="today" value="0.00 L" />
        <KpiTile label="Sales" value="₹0.00" />
        <KpiTile label="Other" scope={{ month: '2026-10' }} value="1" />
      </KpiStrip>,
    );
    expect(screen.getAllByText('Today')).toHaveLength(1);
    expect(screen.getByText('Oct')).toBeTruthy();
    const strip = screen.getByLabelText("Today's figures");
    expect(strip.firstElementChild?.textContent).toBe('Today');
  });

  it('renders no caption without a scope', () => {
    const { container } = render(<KpiStrip>{tiles(2)}</KpiStrip>);
    const strip = container.firstElementChild as HTMLElement;
    expect(strip.className).toContain('bg-border-soft');
    expect(strip.children).toHaveLength(2);
  });

  it('warns in development above 4 tiles', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<KpiStrip>{tiles(5)}</KpiStrip>);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('5 tiles'));
  });

  it('is quiet at 4 tiles or fewer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <KpiStrip>
        {tiles(3)}
        {false}
        <KpiTile label="Fourth" value="4" />
      </KpiStrip>,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
