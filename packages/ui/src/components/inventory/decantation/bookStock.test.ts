import { describe, expect, it } from 'vitest';
import { bookStock } from './bookStock.js';

const tank = { id: 't', name: 'Tank 2', productId: 'p', productName: 'Diesel' };

describe('bookStock (#603)', () => {
  it('leads with the stock, then capacity and percent in the same unit', () => {
    expect(bookStock({ ...tank, currentVolume: 13000, capacity: 20000 })).toBe(
      'Book 13,000 L of 20,000 L · 65%',
    );
    expect(bookStock({ ...tank, currentVolume: 1240, capacity: 2000, unit: 'kg' })).toBe(
      'Book 1,240 kg of 2,000 kg · 62%',
    );
  });

  it('reads the stock alone without a capacity, nothing without a stock', () => {
    expect(bookStock({ ...tank, currentVolume: 5000 })).toBe('Book 5,000 L');
    expect(bookStock({ ...tank, currentVolume: null })).toBeUndefined();
  });
});
