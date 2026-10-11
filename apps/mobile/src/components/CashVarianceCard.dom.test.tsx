// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dayCashVariance, shiftCashVariance } from '../lib/cashVariance.js';
import { deriveShiftVariance } from '../lib/shifts/variance.js';
import { CashVarianceCard } from './CashVarianceCard.js';

afterEach(cleanup);

const day = {
  shifts: [{ shiftSequence: 1, templateName: 'Morning', cashVariance: 50 }],
  drawer: {
    totalCashVariance: 50,
    totalAttendantVariance: -125,
    attendants: [{ attendantName: 'Ramesh Kumar', duName: 'DU-1', variance: -125 }],
  },
};

describe('CashVarianceCard', () => {
  it('shows both levels with their own tone, not summed', () => {
    render(<CashVarianceCard variance={dayCashVariance(day)} />);
    const group = screen.getByRole('group', { name: 'Cash variance' });
    const att = group.querySelector('[data-variance-level="attendants"]') as HTMLElement;
    const off = group.querySelector('[data-variance-level="office"]') as HTMLElement;
    expect(within(att).getByText('Attendants')).toBeTruthy();
    expect(within(att).getByText('−₹125').className).toContain('text-bad-fg');
    expect(within(att).getByText('DU-1 short')).toBeTruthy();
    expect(within(off).getByText('Office count')).toBeTruthy();
    expect(within(off).getByText('+₹50').className).toContain('text-warn-fg');
    expect(within(off).getByText('Morning over')).toBeTruthy();
    expect(screen.queryByText(/75/)).toBeNull();
    expect(group.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('bad');
  });

  it('is the same figure on the Shift Summary header as on the day tile', () => {
    const shift = shiftCashVariance(
      deriveShiftVariance({
        cashVarianceModel: 2,
        attendantVariance: -125,
        officeCountVariance: 50,
        drawers: [{ attendantId: 'a1', duName: 'DU-1', variance: -125 }],
      }),
    );
    render(<CashVarianceCard wide variance={shift} />);
    expect(screen.getByText('−₹125')).toBeTruthy();
    expect(screen.getByText('+₹50')).toBeTruthy();
  });

  it('prints a dash and the reason before any Shift closes', () => {
    render(<CashVarianceCard variance={dayCashVariance({})} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('No closed Shift yet')).toBeTruthy();
  });
});
