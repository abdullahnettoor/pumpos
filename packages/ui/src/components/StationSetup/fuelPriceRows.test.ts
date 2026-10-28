import { describe, expect, it } from 'vite-plus/test';
import {
  buildFuelPriceRows,
  formatPriceTime,
  missedScheduledPrice,
  nextScheduledPriceAt,
  priceChange,
  sortNewestFirst,
  stationDateTimeInput,
  stationInputToIso,
} from './fuelPriceRows.js';

const unit = (id: string) => (id === 'cng' ? 'kg' : undefined);
const NOW = new Date('2026-10-15T20:00:00Z');

describe('buildFuelPriceRows', () => {
  it('reads the last change from the two latest history entries, whatever their order', () => {
    const rows = buildFuelPriceRows(
      [
        {
          productId: 'ms',
          productName: 'Petrol',
          productCode: 'MS',
          price: '102.5',
          effectiveFrom: '2026-10-10T00:30:00Z',
        },
      ],
      [
        { id: '1', productId: 'ms', price: '99', effectiveFrom: '2026-01-01T00:00:00Z' },
        { id: '3', productId: 'ms', price: '102.5', effectiveFrom: '2026-10-10T00:30:00Z' },
        { id: '2', productId: 'ms', price: '101', effectiveFrom: '2026-06-01T00:00:00Z' },
      ],
      unit,
      NOW,
    );
    expect(rows).toEqual([
      {
        productId: 'ms',
        productName: 'Petrol',
        productCode: 'MS',
        unit: 'L',
        price: 102.5,
        effectiveFrom: '2026-10-10T00:30:00Z',
        lastChange: { from: 101, to: 102.5, difference: 1.5 },
        scheduled: null,
      },
    ]);
  });

  it('has no last change with one price, and no price before the first', () => {
    const rows = buildFuelPriceRows(
      [
        { productId: 'cng', productName: 'CNG', price: 80, effectiveFrom: '2026-01-01T00:00:00Z' },
        { productId: 'xp', productName: 'XP95', price: 0, effectiveFrom: null },
      ],
      [{ id: '1', productId: 'cng', price: 80, effectiveFrom: '2026-01-01T00:00:00Z' }],
      unit,
      NOW,
    );
    expect(rows.map((r) => [r.unit, r.price, r.lastChange])).toEqual([
      ['kg', 80, null],
      ['L', null, null],
    ]);
  });
});

describe('scheduled prices (#619)', () => {
  const current = [
    {
      productId: 'ms',
      productName: 'Petrol',
      price: 102.5,
      effectiveFrom: '2026-10-10T00:30:00Z',
    },
  ];
  const history = [
    { id: '1', productId: 'ms', price: 101, effectiveFrom: '2026-06-01T00:00:00Z' },
    { id: '2', productId: 'ms', price: 102.5, effectiveFrom: '2026-10-10T00:30:00Z' },
    // Two changes still ahead: the card names the next one.
    { id: '4', productId: 'ms', price: 104, effectiveFrom: '2026-10-20T00:30:00Z' },
    { id: '3', productId: 'ms', price: 103, effectiveFrom: '2026-10-16T00:30:00Z' },
  ];

  it('shows the current price, its last change, and the next scheduled change', () => {
    const [row] = buildFuelPriceRows(current, history, () => 'L', NOW);
    expect(row).toMatchObject({
      price: 102.5,
      lastChange: { from: 101, to: 102.5, difference: 1.5 },
      scheduled: { price: 103, effectiveFrom: '2026-10-16T00:30:00Z' },
    });
  });

  it('has no scheduled change once its time has come', () => {
    const at = new Date('2026-10-16T00:30:00Z');
    const served = [{ ...current[0]!, price: 103, effectiveFrom: '2026-10-16T00:30:00Z' }];
    const [row] = buildFuelPriceRows(served, history, () => 'L', at);
    expect(row).toMatchObject({
      price: 103,
      lastChange: { from: 102.5, to: 103, difference: 0.5 },
      scheduled: { price: 104, effectiveFrom: '2026-10-20T00:30:00Z' },
    });
  });

  it('the last change ends on the served price, even before the refresh lands', () => {
    // 103 took effect a moment ago; the cached current price is still 102.50.
    const [row] = buildFuelPriceRows(current, history, () => 'L', new Date('2026-10-16T00:31:00Z'));
    expect(row!.lastChange).toEqual({ from: 101, to: 102.5, difference: 1.5 });
  });

  it('knows cached prices missed a scheduled change that has since taken effect (#628 review)', () => {
    const t = (iso: string) => new Date(iso).getTime();
    // Fetched 15 Oct 23:59, 103 took effect 16 Oct 00:30, read at 00:31: missed.
    expect(
      missedScheduledPrice(history, t('2026-10-15T23:59:00Z'), t('2026-10-16T00:31:00Z')),
    ).toBe(true);
    // Fetched after it took effect, or read before it does: nothing missed.
    expect(
      missedScheduledPrice(history, t('2026-10-16T00:30:01Z'), t('2026-10-16T00:31:00Z')),
    ).toBe(false);
    expect(
      missedScheduledPrice(history, t('2026-10-15T23:59:00Z'), t('2026-10-16T00:29:00Z')),
    ).toBe(false);
    // Nothing cached yet.
    expect(missedScheduledPrice(history, 0, t('2026-10-16T00:31:00Z'))).toBe(false);
  });

  it('knows when the next scheduled price of any fuel takes effect', () => {
    expect(nextScheduledPriceAt(history, NOW.getTime())).toBe(
      new Date('2026-10-16T00:30:00Z').getTime(),
    );
    expect(nextScheduledPriceAt(history, new Date('2026-10-21T00:00:00Z').getTime())).toBeNull();
  });
});

describe('priceChange (#605)', () => {
  it('is old → new with the signed difference, in whole paise', () => {
    expect(priceChange('101.80', '102.50')).toEqual({ from: 101.8, to: 102.5, difference: 0.7 });
    expect(priceChange(94.6, 94.12)).toEqual({ from: 94.6, to: 94.12, difference: -0.48 });
    // 0.1 + 0.2 is not 0.3 in floating point; paise are.
    expect(priceChange(0.1, 0.3).difference).toBe(0.2);
    expect(priceChange(100, 100).difference).toBe(0);
  });
});

describe('sortNewestFirst', () => {
  it('lists the latest change first and leaves the input alone', () => {
    const input = [
      { id: 'a', productId: 'ms', price: 1, effectiveFrom: '2026-01-01T00:00:00Z' },
      { id: 'c', productId: 'ms', price: 3, effectiveFrom: '2026-10-01T00:00:00Z' },
      { id: 'b', productId: 'ms', price: 2, effectiveFrom: '2026-05-01T00:00:00Z' },
    ];
    expect(sortNewestFirst(input).map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(input[0]!.id).toBe('a');
  });
});

describe('price ties', () => {
  const at = '2026-10-10T00:30:00Z';
  const tied = [
    { id: 'a', productId: 'ms', price: 100, effectiveFrom: at, createdAt: '2026-10-09T10:00:00Z' },
    { id: 'b', productId: 'ms', price: 104, effectiveFrom: at, createdAt: '2026-10-09T11:00:00Z' },
    { id: 'c', productId: 'ms', price: 98, effectiveFrom: '2026-09-01T00:00:00Z' },
  ];
  // The API resolves the tie the same way (fuelPricesNewestFirst): 104 is current.
  const current = [{ productId: 'ms', productName: 'Petrol', price: 104, effectiveFrom: at }];

  it('orders equal effective times by when they were recorded, then by id, in any input order', () => {
    expect(sortNewestFirst(tied).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(sortNewestFirst([...tied].reverse()).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    const noCreated = tied.map(({ createdAt: _c, ...e }) => e);
    expect(sortNewestFirst(noCreated).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(sortNewestFirst([...noCreated].reverse()).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it("shows the API's current price, and a last change that ends on it", () => {
    for (const history of [tied, [...tied].reverse()]) {
      const [row] = buildFuelPriceRows(current, history, () => 'L', NOW);
      expect(row!.price).toBe(104);
      expect(row!.lastChange).toEqual({ from: 100, to: 104, difference: 4 });
    }
  });
});

describe('station wall-clock times', () => {
  it('shows now on the station clock, not the browser clock', () => {
    const now = new Date('2026-10-15T20:00:00Z');
    expect(stationDateTimeInput(now, 'Asia/Kolkata')).toBe('2026-10-16T01:30');
    expect(stationDateTimeInput(now, 'Asia/Dubai')).toBe('2026-10-16T00:00');
  });

  it('writes a scheduled time short, on the station clock (#619)', () => {
    expect(formatPriceTime('2026-10-16T00:30:00Z', 'Asia/Kolkata')).toBe(
      'Fri 16 Oct, 6:00\u00a0am',
    );
    expect(formatPriceTime('2026-10-15T20:00:00Z', 'Asia/Kolkata')).toBe(
      'Fri 16 Oct, 1:30\u00a0am',
    );
  });

  it('reads an entered time on the station clock', () => {
    expect(stationInputToIso('2026-10-16T01:30', 'Asia/Kolkata')).toBe('2026-10-15T20:00:00.000Z');
    expect(stationInputToIso('2026-10-16T06:00', 'UTC')).toBe('2026-10-16T06:00:00.000Z');
  });
});
