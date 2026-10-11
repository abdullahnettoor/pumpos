// @vitest-environment jsdom
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

  it('a snapshot that adds up has no "Not itemised" row', () => {
    render(
      <PaymentSplit
        split={derivePaymentSplit(
          { cash: 71275, upi: 58000, card: 27000, credit: 23000, omcCard: 2000 },
          181400,
          -125,
        )}
      />,
    );
    expect(screen.queryByText('Not itemised')).toBeNull();
  });

  it('a legacy snapshot that does not add up shows its buckets, the total and an honest "Not itemised" row', () => {
    // Predates the OMC bucket: ₹2,000 of sales sit in no stored payment figure.
    render(
      <PaymentSplit
        split={derivePaymentSplit(
          { cash: 71275, upi: 58000, card: 27000, credit: 23000, omcCard: null },
          181400,
          -125,
        )}
      />,
    );
    const row = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    expect(within(row('Total sales')).getByText('₹1,81,400')).toBeTruthy();
    expect(within(row('Not itemised')).getByText('₹2,000')).toBeTruthy();
    expect(screen.getByText('Recorded before payment details were stored')).toBeTruthy();
    expect(screen.queryByText('OMC card')).toBeNull();
  });

  it('keeps every dl child a dt/dd group (valid markup)', () => {
    const { container } = render(
      <PaymentSplit
        split={derivePaymentSplit(
          { cash: 100, upi: 0, card: 0, credit: 0, omcCard: null },
          300,
          -50,
        )}
      />,
    );
    for (const group of container.querySelectorAll('dl > div'))
      expect([...group.children].map((c) => c.tagName)).toEqual(['DT', 'DD']);
  });
});
