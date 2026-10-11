// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StockMovement } from './StockMovement.js';
import type { TankMovementRow } from '../../lib/reports/dssr.js';

const tank: TankMovementRow = {
  key: 'hsd',
  title: 'Tank HSD-1 · Diesel (HSD)',
  movement: 'Opening 12,500 → Closing 20,615 L',
  detail: ['Sold 1,885 L · Received 10,000 L', 'Dip 20,470 L'],
  variance: '−145 L',
  tone: 'bad',
};

describe('StockMovement', () => {
  it('puts each detail on its own line and never cuts a line with an ellipsis', () => {
    render(<StockMovement tanks={[tank]} />);
    const sold = screen.getByText('Sold 1,885 L · Received 10,000 L');
    const dip = screen.getByText('Dip 20,470 L');
    expect(sold).not.toBe(dip);
    expect(sold.className).toContain('block');
    for (const line of [screen.getByText(tank.movement), sold, dip]) {
      // `truncate` (overflow hidden + ellipsis + nowrap) anywhere above a line would clip it at 390px.
      expect(line.closest('.truncate')).toBeNull();
    }
  });
});
