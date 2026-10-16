import { describe, expect, it } from 'vitest';
import { fuelsWithoutRate, noRateInEffectMessage } from './shift-open-rates.js';

describe('fuelsWithoutRate (#630)', () => {
  const rated = new Set(['pet']);
  const hasRate = (id: string) => rated.has(id);

  it('lists each fuel without a rate once, in nozzle order', () => {
    expect(
      fuelsWithoutRate(
        [{ productId: 'dsl' }, { productId: 'pet' }, { productId: 'cng' }, { productId: 'dsl' }],
        hasRate,
      ),
    ).toEqual(['dsl', 'cng']);
  });

  it('is empty when every fuel on a nozzle has a rate, or there are no nozzles', () => {
    expect(fuelsWithoutRate([{ productId: 'pet' }], hasRate)).toEqual([]);
    expect(fuelsWithoutRate([], hasRate)).toEqual([]);
  });
});

describe('noRateInEffectMessage', () => {
  it('names every fuel', () => {
    expect(noRateInEffectMessage(['Petrol'])).toBe(
      'Petrol has no rate in effect. Set a rate before opening.',
    );
    expect(noRateInEffectMessage(['Petrol', 'Diesel'])).toBe(
      'Petrol and Diesel have no rate in effect. Set a rate before opening.',
    );
    expect(noRateInEffectMessage(['Petrol', 'Diesel', 'CNG'])).toBe(
      'Petrol, Diesel and CNG have no rate in effect. Set a rate before opening.',
    );
  });
});
