import { describe, expect, it } from 'vitest';
import {
  compareFuelPricesNewestFirst,
  currentFuelPriceByProduct,
  isFuelPriceInEffect,
  isProvablyNewerFuelPrice,
  isScheduledFuelPrice,
} from './fuel-price-order.js';

const p = (id: string, effectiveFrom: string, createdAt?: string) => ({
  id,
  effectiveFrom,
  createdAt,
});

describe('fuel price order', () => {
  it('latest effective first, then latest recorded, then id', () => {
    const list = [
      p('a', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'),
      p('c', '2026-10-05T00:00:00Z', '2026-10-01T00:00:00Z'),
      p('b', '2026-10-05T00:00:00Z', '2026-10-02T00:00:00Z'),
      p('d', '2026-10-05T00:00:00Z', '2026-10-02T00:00:00Z'),
    ];
    expect([...list].sort(compareFuelPricesNewestFirst).map((x) => x.id)).toEqual([
      'd',
      'b',
      'c',
      'a',
    ]);
  });

  it('proves newer only from what is known', () => {
    const answer = p('x', '2026-10-05T00:00:00Z', '2026-10-05T01:00:00Z');
    expect(isProvablyNewerFuelPrice(answer, { effectiveFrom: '2026-10-04T00:00:00Z' })).toBe(true);
    expect(isProvablyNewerFuelPrice(answer, { effectiveFrom: '2026-10-06T00:00:00Z' })).toBe(false);
    // Equal effective time without the other's recorded time and id: unproven.
    expect(isProvablyNewerFuelPrice(answer, { effectiveFrom: '2026-10-05T00:00:00Z' })).toBe(false);
    expect(
      isProvablyNewerFuelPrice(answer, p('w', '2026-10-05T00:00:00Z', '2026-10-05T00:30:00Z')),
    ).toBe(true);
    expect(isProvablyNewerFuelPrice(answer, answer)).toBe(false);
  });
});

describe('scheduled fuel prices (#619)', () => {
  const NOW = new Date('2026-10-15T20:00:00Z');
  const price = (id: string, productId: string, effectiveFrom: string, createdAt: string) => ({
    id,
    productId,
    effectiveFrom,
    createdAt,
  });

  it('a price is in effect from its effective time on, scheduled before it', () => {
    expect(isFuelPriceInEffect({ effectiveFrom: '2026-10-15T20:00:00Z' }, NOW)).toBe(true);
    expect(isFuelPriceInEffect({ effectiveFrom: '2026-10-15T20:00:01Z' }, NOW)).toBe(false);
    expect(isScheduledFuelPrice({ effectiveFrom: '2026-10-16T00:30:00Z' }, NOW)).toBe(true);
    expect(isScheduledFuelPrice({ effectiveFrom: '2026-10-16T00:30:00Z' }, NOW.getTime())).toBe(
      true,
    );
  });

  it('the current price is the latest in effect; a scheduled one waits for its time', () => {
    const prices = [
      price('old', 'ms', '2026-10-01T00:30:00Z', '2026-09-30T12:00:00Z'),
      price('now', 'ms', '2026-10-10T00:30:00Z', '2026-10-09T12:00:00Z'),
      price('next', 'ms', '2026-10-16T00:30:00Z', '2026-10-15T12:00:00Z'),
      price('later', 'hsd', '2026-10-20T00:30:00Z', '2026-10-15T12:00:00Z'),
    ];
    const before = currentFuelPriceByProduct(prices, NOW);
    expect(before.get('ms')?.id).toBe('now');
    // Diesel has only a scheduled price: none current yet.
    expect(before.has('hsd')).toBe(false);
    const after = currentFuelPriceByProduct(prices, new Date('2026-10-16T00:30:00Z'));
    expect(after.get('ms')?.id).toBe('next');
  });

  it('ties at the same effective time resolve by recorded time, then id', () => {
    const prices = [
      price('a', 'ms', '2026-10-10T00:30:00Z', '2026-10-09T12:00:00Z'),
      price('b', 'ms', '2026-10-10T00:30:00Z', '2026-10-09T12:01:00Z'),
    ];
    expect(currentFuelPriceByProduct(prices, NOW).get('ms')?.id).toBe('b');
  });
});
