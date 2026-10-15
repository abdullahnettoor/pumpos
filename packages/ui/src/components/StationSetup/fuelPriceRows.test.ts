import { describe, expect, it } from 'vitest';
import {
  buildFuelPriceRows,
  sortNewestFirst,
  stationDateTimeInput,
  stationInputToIso,
} from './fuelPriceRows.js';

const unit = (id: string) => (id === 'cng' ? 'kg' : undefined);

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
    );
    expect(rows).toEqual([
      {
        productId: 'ms',
        productName: 'Petrol',
        productCode: 'MS',
        unit: 'L',
        price: 102.5,
        effectiveFrom: '2026-10-10T00:30:00Z',
        lastChange: { from: 101, to: 102.5 },
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
    );
    expect(rows.map((r) => [r.unit, r.price, r.lastChange])).toEqual([
      ['kg', 80, null],
      ['L', null, null],
    ]);
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
      const [row] = buildFuelPriceRows(current, history, () => 'L');
      expect(row!.price).toBe(104);
      expect(row!.lastChange).toEqual({ from: 100, to: 104 });
    }
  });
});

describe('station wall-clock times', () => {
  it('shows now on the station clock, not the browser clock', () => {
    const now = new Date('2026-10-15T20:00:00Z');
    expect(stationDateTimeInput(now, 'Asia/Kolkata')).toBe('2026-10-16T01:30');
    expect(stationDateTimeInput(now, 'Asia/Dubai')).toBe('2026-10-16T00:00');
  });

  it('reads an entered time on the station clock', () => {
    expect(stationInputToIso('2026-10-16T01:30', 'Asia/Kolkata')).toBe('2026-10-15T20:00:00.000Z');
    expect(stationInputToIso('2026-10-16T06:00', 'UTC')).toBe('2026-10-16T06:00:00.000Z');
  });
});
