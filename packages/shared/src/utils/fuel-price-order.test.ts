import { describe, expect, it } from 'vitest';
import { compareFuelPricesNewestFirst, isProvablyNewerFuelPrice } from './fuel-price-order.js';

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
