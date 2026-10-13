import { describe, expect, it } from 'vitest';
import {
  agingSegments,
  creditTile,
  daysLabel,
  lastPaymentTile,
  oldestCaption,
  paidTile,
  settlesLabel,
  usuallyPaysTile,
  vehicleBars,
} from './receivables.js';

describe('agingSegments', () => {
  it('splits the total into the three buckets with their share', () => {
    const s = agingSegments({ d0_7: 250, d8_30: 500, d30plus: 250 });
    expect(s?.map((x) => [x.key, x.label, x.tone, x.amount, x.share])).toEqual([
      ['d0_7', '0–7 days', 'good', 250, 25],
      ['d8_30', '8–30 days', 'warn', 500, 50],
      ['d30plus', '30+ days', 'bad', 250, 25],
    ]);
  });

  it('keeps an empty bucket in the split (a zero share, not a missing one)', () => {
    const s = agingSegments({ d0_7: 100, d8_30: 0, d30plus: 0 });
    expect(s).toHaveLength(3);
    expect(s?.[1]).toMatchObject({ amount: 0, share: 0 });
  });

  it('draws nothing when nothing is owed or the summary is not there yet', () => {
    expect(agingSegments({ d0_7: 0, d8_30: 0, d30plus: 0 })).toBeNull();
    expect(agingSegments(undefined)).toBeNull();
    expect(agingSegments(null)).toBeNull();
  });
});

describe('oldestCaption', () => {
  it('uses the aging cuts for the tone: 7|8 and 30|31 days', () => {
    expect(oldestCaption(7)?.tone).toBe('muted');
    expect(oldestCaption(8)?.tone).toBe('warn');
    expect(oldestCaption(30)?.tone).toBe('warn');
    expect(oldestCaption(31)?.tone).toBe('bad');
  });

  it('words it', () => {
    expect(oldestCaption(18)?.text).toBe('Oldest 18 days');
    expect(oldestCaption(1)?.text).toBe('Oldest 1 day');
    expect(oldestCaption(0)?.text).toBe('Oldest today');
    expect(daysLabel(-3)).toBe('today');
  });

  it('is hidden, not "0 days", when the age is unknown', () => {
    expect(oldestCaption(null)).toBeNull();
    expect(oldestCaption(undefined)).toBeNull();
  });
});

describe('customer tiles', () => {
  it('shows the last payment with its date and how long ago', () => {
    expect(
      lastPaymentTile({ amount: 40000, entryDate: '2026-09-18', method: 'UPI', daysAgo: 21 }),
    ).toEqual({ label: 'Last payment', value: '₹40,000', sub: '18 Sep · 21 days ago' });
    expect(
      lastPaymentTile({ amount: 500, entryDate: '2026-10-09', method: 'Cash', daysAgo: 0 })?.sub,
    ).toBe('9 Oct · today');
    expect(
      lastPaymentTile({ amount: 500, entryDate: '2026-10-08', method: 'Cash', daysAgo: 1 })?.sub,
    ).toBe('8 Oct · 1 day ago');
  });

  it('hides the last payment and usually-pays-in when the API has none', () => {
    expect(lastPaymentTile(null)).toBeNull();
    expect(usuallyPaysTile(null)).toBeNull();
    expect(usuallyPaysTile(undefined)).toBeNull();
  });

  it('shows usually-pays-in, including a customer who pays on the day', () => {
    expect(usuallyPaysTile(24)).toMatchObject({ label: 'Usually pays in', value: '24 days' });
    expect(usuallyPaysTile(1)?.value).toBe('1 day');
    expect(usuallyPaysTile(0)?.value).toBe('0 days');
  });

  it('shows credit taken with slips and litres, and paid with the settlement cycle', () => {
    const month = { credit: 81900, slips: 23, litres: 812.4, paid: 0 };
    expect(creditTile(month)).toEqual({
      label: 'Credit this month',
      value: '₹81,900',
      sub: '23 slips · 812 L',
    });
    expect(creditTile({ ...month, slips: 1, litres: 0 }).sub).toBe('1 slip');
    expect(paidTile(month, 'OPEN')).toEqual({
      label: 'Paid this month',
      value: '₹0',
      sub: 'Settles: open account',
    });
    expect(settlesLabel('EOD')).toBe('Settles: end of day');
    expect(settlesLabel(undefined)).toBe('Settles: open account');
  });
});

describe('vehicleBars', () => {
  it('sizes each bar against the biggest spender', () => {
    const bars = vehicleBars([
      { vehicleId: 'a', registration: 'A', type: 'Truck', amount: 500, litres: 5 },
      { vehicleId: 'b', registration: 'B', type: 'Bus', amount: 125, litres: 1 },
    ]);
    expect(bars.map((b) => b.pct)).toEqual([100, 25]);
  });

  it('keeps a tiny spender visible and handles none', () => {
    const bars = vehicleBars([
      { vehicleId: 'a', registration: 'A', type: 'Truck', amount: 100000, litres: 5 },
      { vehicleId: 'b', registration: 'B', type: 'Bus', amount: 1, litres: 0 },
    ]);
    expect(bars[1].pct).toBe(2);
    expect(vehicleBars([])).toEqual([]);
  });
});
