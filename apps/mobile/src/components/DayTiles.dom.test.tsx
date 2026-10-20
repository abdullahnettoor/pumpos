// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { principalOf } from '@pump/shared';
import { deriveTiles } from '../lib/home/figures.js';
import { DayTiles } from './DayTiles.js';

afterEach(cleanup);

const tiles = deriveTiles({
  pnl: { revenue: 100, cogs: 60, grossMargin: 40 },
  purchases: { total: 50, count: 1 },
  credit: { total: 0, count: 0 },
} as never);

describe('DayTiles', () => {
  it('shows margin and purchases to a principal that holds both', () => {
    render(<DayTiles tiles={tiles} principal={principalOf('Owner')} />);
    expect(screen.getByText('Gross margin')).toBeTruthy();
    expect(screen.getByText('Purchases')).toBeTruthy();
  });
  it('hides margin without View margin, and purchases without View purchase prices / costs', () => {
    render(<DayTiles tiles={tiles} principal={{ role: 'Manager', permissions: [] }} />);
    expect(screen.queryByText('Gross margin')).toBeNull();
    expect(screen.queryByText('Purchases')).toBeNull();
    expect(screen.getByText('Credit sales')).toBeTruthy();
  });
});
