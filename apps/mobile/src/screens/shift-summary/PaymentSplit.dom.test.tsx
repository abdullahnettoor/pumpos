// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { derivePaymentSplit } from '../../lib/shifts/summary.js';
import { PaymentSplit } from './PaymentSplit.js';

afterEach(cleanup);

describe('PaymentSplit', () => {
  it('Morning: shows the OMC card bucket, the shortage line and the total they add up to', () => {
    const split = derivePaymentSplit(
      { cash: 71275, upi: 58000, card: 27000, credit: 23000, omcCard: 2000 },
      181400,
      -125,
    );
    const { container } = render(<PaymentSplit split={split} />);
    const row = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    expect(within(row('OMC card')).getByText('₹2,000')).toBeTruthy();
    expect(within(row('Short')).getByText('₹125')).toBeTruthy();
    expect(within(row('Total sales')).getByText('₹1,81,400')).toBeTruthy();
    // The shortage is not a payment method: no bar segment for it, one per paying bucket.
    expect(container.querySelectorAll('[aria-hidden="true"].flex > div')).toHaveLength(5);
    expect(row('Short').className).toContain('text-bad-fg');
  });

  it('a split that cannot be reconciled prints only the buckets', () => {
    const split = derivePaymentSlicesOnly();
    render(<PaymentSplit split={split} />);
    expect(screen.queryByText('Short')).toBeNull();
    expect(screen.queryByText('Total sales')).toBeNull();
    expect(screen.queryByText('OMC card')).toBeNull();
  });
});

function derivePaymentSlicesOnly() {
  // A snapshot that predates the OMC bucket: ₹2,000 of it cannot be placed.
  return derivePaymentSplit(
    { cash: 71275, upi: 58000, card: 27000, credit: 23000, omcCard: null },
    181400,
    -125,
  );
}
