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
/** The browser's clock in these cases: after every answer's effective time unless a case says so. */
const NOW = new Date('2026-10-15T06:00:00.000Z');
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
) => ({
  current: withRecordedCurrentPrice(c, a, h, NOW),
  history: withRecordedPriceInHistory(h, a, labels),
});

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
    const [petrol] = buildFuelPriceRows(next.current, next.history, () => 'L', NOW);
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

  it('without a cached history, only a later effective time proves the answer current', () => {
    const c = current();
    expect(
      withRecordedCurrentPrice(
        c,
        answer({ effectiveFrom: '2026-10-05T00:30:00.000Z' }),
        undefined,
        NOW,
      ),
    ).toBe(c);
    expect(withRecordedCurrentPrice(c, answer(), undefined, NOW)[0].price).toBe(103.1);
  });

  it('an equal-time replay with no history leaves the current price to the refetch (#606 review)', () => {
    // The cache holds ₹104 effective 15 Oct (a newer save); an older answer for
    // the same moment arrives. Without recorded times, nothing is proven.
    const c = current().map((r) =>
      r.productId === 'p-ms' ? { ...r, price: 104, effectiveFrom: '2026-10-15T00:30:00.000Z' } : r,
    );
    expect(withRecordedCurrentPrice(c, answer(), undefined, NOW)).toBe(c);
  });

  it('a stale history cache cannot let an older answer replace a newer current price', () => {
    // History predates the cached current price (₹104 from 16 Oct); the answer
    // is newer than that history but older than the current price.
    const c = current().map((r) =>
      r.productId === 'p-ms' ? { ...r, price: 104, effectiveFrom: '2026-10-16T00:30:00.000Z' } : r,
    );
    expect(withRecordedCurrentPrice(c, answer(), history(), NOW)).toBe(c);
  });

  it('an equal effective time is proven by the matching history entry’s recorded time', () => {
    const same = answer({ effectiveFrom: '2026-10-10T00:30:00.000Z' });
    expect(apply(same).current[0].price).toBe(103.1);
    const earlier = answer({
      effectiveFrom: '2026-10-10T00:30:00.000Z',
      createdAt: '2026-10-10T00:10:00.000Z',
    });
    const c = current();
    expect(apply(earlier, c).current).toBe(c);
  });

  it('a future-dated answer joins the history but is not current before its time (#619)', () => {
    const c = current();
    const future = answer({ effectiveFrom: '2026-10-16T00:30:00.000Z' });
    const next = apply(future, c);
    expect(next.current).toBe(c);
    expect(next.history[0]?.id).toBe('fp-9');
    // The card: ₹102.50 now, ₹103.10 scheduled; the last change is unchanged.
    const [petrol] = buildFuelPriceRows(next.current, next.history, () => 'L', NOW);
    expect(petrol).toMatchObject({
      price: 102.5,
      lastChange: { from: 101.8, to: 102.5, difference: 0.7 },
      scheduled: { price: 103.1, effectiveFrom: '2026-10-16T00:30:00.000Z' },
    });
    // From its time on, the same answer is the current price.
    const at = new Date('2026-10-16T00:30:00.000Z');
    expect(withRecordedCurrentPrice(c, future, history(), at)[0]).toMatchObject({
      price: 103.1,
      effectiveFrom: '2026-10-16T00:30:00.000Z',
    });
  });

  it('a scheduled price in the history does not stop a change effective now (#619)', () => {
    const scheduled = {
      id: 'fp-8',
      productId: 'p-ms',
      productName: 'Petrol',
      productCode: 'MS',
      price: '104.00',
      effectiveFrom: '2026-10-20T00:30:00.000Z',
      createdAt: '2026-10-14T10:00:00.000Z',
    };
    const next = apply(answer(), current(), [scheduled, ...history()]);
    expect(next.current[0]).toMatchObject({ price: 103.1 });
    const [petrol] = buildFuelPriceRows(next.current, next.history, () => 'L', NOW);
    expect(petrol.scheduled).toEqual({ price: 104, effectiveFrom: '2026-10-20T00:30:00.000Z' });
  });
});
