import { describe, expect, it } from 'vitest';
import { buildFuelPriceRows } from '../../components/StationSetup/fuelPriceRows.js';
import {
  withRecordedCurrentPrice,
  withRecordedPriceInHistory,
  type FuelPriceHistoryRow,
  type RecordedFuelPrice,
} from './fuelPrices.js';

/** GET /setup/pricing and /setup/pricing/history as the server answers them. */
const current = () => [
  {
    productId: 'p-ms',
    productName: 'Petrol',
    productCode: 'MS',
    price: 102.5,
    effectiveFrom: '2026-10-10T00:30:00.000Z',
  },
  {
    productId: 'p-hsd',
    productName: 'Diesel',
    productCode: 'HSD',
    price: 90.1,
    effectiveFrom: '2026-10-10T00:30:00.000Z',
  },
];
const history = () => [
  {
    id: 'fp-2',
    productId: 'p-ms',
    productName: 'Petrol',
    productCode: 'MS',
    price: '102.50',
    effectiveFrom: '2026-10-10T00:30:00.000Z',
    createdAt: '2026-10-10T00:20:00.000Z',
  },
  {
    id: 'fp-1',
    productId: 'p-ms',
    productName: 'Petrol',
    productCode: 'MS',
    price: '101.80',
    effectiveFrom: '2026-10-01T00:30:00.000Z',
    createdAt: '2026-10-01T00:20:00.000Z',
  },
  {
    id: 'fp-3',
    productId: 'p-hsd',
    productName: 'Diesel',
    productCode: 'HSD',
    price: '90.10',
    effectiveFrom: '2026-10-10T00:30:00.000Z',
    createdAt: '2026-10-10T00:21:00.000Z',
  },
];
const labels = { productName: 'Petrol', productCode: 'MS' };
const answer = (over: Partial<RecordedFuelPrice> = {}): RecordedFuelPrice => ({
  id: 'fp-9',
  stationId: 'st-1',
  productId: 'p-ms',
  price: '103.10',
  effectiveFrom: '2026-10-15T00:30:00.000Z',
  createdAt: '2026-10-15T00:25:00.000Z',
  ...over,
});

const apply = (
  a: RecordedFuelPrice,
  c: ReturnType<typeof current> = current(),
  h: FuelPriceHistoryRow[] = history(),
) => {
  const nextHistory = withRecordedPriceInHistory(h, a, labels);
  return { history: nextHistory, current: withRecordedCurrentPrice(c, a, nextHistory) };
};

describe('fuel price patches (#606)', () => {
  it('writes the server’s price and effective-from; the last change recomputes from history', () => {
    const next = apply(answer());
    expect(next.history[0]).toEqual({
      id: 'fp-9',
      productId: 'p-ms',
      productName: 'Petrol',
      productCode: 'MS',
      price: '103.10',
      effectiveFrom: '2026-10-15T00:30:00.000Z',
      createdAt: '2026-10-15T00:25:00.000Z',
    });
    expect(next.current[0]).toMatchObject({
      price: 103.1,
      effectiveFrom: '2026-10-15T00:30:00.000Z',
    });
    // Diesel is untouched.
    expect(next.current[1]).toEqual(current()[1]);
    const [petrol] = buildFuelPriceRows(next.current, next.history, () => 'L');
    expect(petrol.lastChange).toEqual({ from: 102.5, to: 103.1, difference: 0.6 });
  });

  it('a backdated change joins the history but does not become current', () => {
    const c = current();
    const next = apply(answer({ effectiveFrom: '2026-10-05T00:30:00.000Z' }), c);
    expect(next.history.map((h) => h.id)).toEqual(['fp-3', 'fp-2', 'fp-9', 'fp-1']);
    expect(next.current).toBe(c);
  });

  it('drops an older answer arriving after a newer save of the same fuel (out of order)', () => {
    const newer = answer({ id: 'fp-b', price: '104.00', createdAt: '2026-10-15T00:26:00.000Z' });
    const older = answer({ id: 'fp-a', price: '103.10', createdAt: '2026-10-15T00:25:00.000Z' });
    const afterNewer = apply(newer);
    const afterOlder = apply(older, afterNewer.current, afterNewer.history);
    expect(afterOlder.current).toBe(afterNewer.current);
    expect(afterOlder.current[0].price).toBe(104);
    // Both changes are listed, newest recorded first.
    expect(afterOlder.history.slice(0, 2).map((h) => h.id)).toEqual(['fp-b', 'fp-a']);
  });

  it('is idempotent for a replayed answer', () => {
    const once = apply(answer());
    const twice = apply(answer(), once.current, once.history);
    expect(twice.history).toBe(once.history);
    expect(twice.current).toBe(once.current);
  });

  it('without a cached history, an answer is current only from the cached effective-from on', () => {
    const c = current();
    expect(
      withRecordedCurrentPrice(c, answer({ effectiveFrom: '2026-10-05T00:30:00.000Z' }), undefined),
    ).toBe(c);
    expect(withRecordedCurrentPrice(c, answer(), undefined)[0].price).toBe(103.1);
  });
});
